import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// Using require for chalk to avoid ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');

import { Message } from './types/messages';
import { loadSystemPrompt } from './config/systemPrompt';
import { queryAI, streamAI } from './api/ai';
import { logger } from './utils/logger';
import { analytics } from './utils/analytics';
import { loadTools, extractToolCalls, executeTool, getAllTools, getToolsSchema } from './tools';
import { ToolContext } from './types/tools';
import {
  initializePermissionConfig,
  savePermissionConfig,
  cleanupPermissionConfig,
} from './config/permissions-config';
import { closePrompt } from './utils/prompt';
import {
  collectProjectContext,
  loadProjectInstructions,
  collectGitContext,
  getDirectoryStructureSummary,
} from './utils/context';
import { getConfig, initializeConfig, ForqConfig } from './utils/config';

// Maximum number of messages to keep in history before compacting
const MAX_CONVERSATION_LENGTH = 20;

/**
 * Interactive REPL (Read-Eval-Print Loop) for the forq CLI
 * Handles user input and interacts with AI
 */
export async function startRepl(): Promise<void> {
  // Initialize configuration
  const config = initializeConfig();

  // Initialize analytics
  analytics.initialize();

  // Load available tools
  await loadTools();
  console.log(
    chalk.cyan('Loaded tools: ') +
      getAllTools()
        .map((t) => t.name)
        .join(', '),
  );

  // Initialize permission system
  initializePermissionConfig();

  // Create history file directory if it doesn't exist
  const historyDir = path.join(os.homedir(), '.forq');
  const historyFile = path.join(historyDir, 'history');

  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  // Read history file if it exists
  let history: string[] = [];
  if (fs.existsSync(historyFile)) {
    history = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
  }

  // Store current input when navigating history
  let currentInput = '';
  let historyIndex = history.length;

  // Create tool context
  const toolContext: ToolContext = {
    cwd: process.cwd(),
    logger: logger,
  };

  // Get system prompt and append information about available tools
  const systemPrompt = loadSystemPrompt();

  // Collect project context
  const projectContext = collectProjectContext();

  // Enhance system prompt with project context if available
  let enhancedPromptContent = systemPrompt.content;

  // Add project instructions if available
  if (projectContext.instructions) {
    enhancedPromptContent += `\n\n## Project-Specific Instructions\n${projectContext.instructions}`;
    console.log(chalk.green('Loaded project-specific instructions from FORQ.md'));
  }

  // Add git context if available
  if (projectContext.git) {
    enhancedPromptContent += '\n\n## Git Context\n';
    if (projectContext.git.currentBranch) {
      enhancedPromptContent += `Current branch: ${projectContext.git.currentBranch}\n`;
    }

    if (projectContext.git.modifiedFiles && projectContext.git.modifiedFiles.length > 0) {
      enhancedPromptContent += 'Modified files:\n';
      projectContext.git.modifiedFiles.forEach((file) => {
        enhancedPromptContent += `- ${file}\n`;
      });
    }

    if (projectContext.git.recentCommits && projectContext.git.recentCommits.length > 0) {
      enhancedPromptContent += 'Recent commits:\n';
      projectContext.git.recentCommits.forEach((commit) => {
        enhancedPromptContent += `- ${commit.hash} ${commit.message} (${commit.author}, ${commit.date})\n`;
      });
    }

    console.log(chalk.green('Added git context to system prompt'));
  }

  // Add directory structure if available
  if (projectContext.directoryStructure) {
    enhancedPromptContent += `\n\n## Project Structure\n\`\`\`\n${projectContext.directoryStructure}\`\`\``;
    console.log(chalk.green('Added project structure to system prompt'));
  }

  // Get tool schema for AI
  const toolsInfo = getToolsSchema();

  // Add tools information to system prompt
  const enhancedSystemPrompt: Message = {
    ...systemPrompt,
    content: `${enhancedPromptContent}\n\nYou have access to the following tools:\n${getAllTools()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join(
        '\n',
      )}\n\nTo use a tool, respond with the syntax: <tool:toolName>{"param1": "value1", "param2": "value2"}</tool>`,
  };

  // Initialize conversation with enhanced system prompt
  const conversation: Message[] = [enhancedSystemPrompt];

  // Apply configuration for readline
  const historySize = config.repl?.historySize || 100;
  const promptStyle = config.repl?.prompt || 'forq> ';

  // Apply color scheme if configured
  const promptColor = config.repl?.colorScheme?.prompt || 'blue';
  const responseColor = config.repl?.colorScheme?.response || 'green';
  const errorColor = config.repl?.colorScheme?.error || 'red';
  const infoColor = config.repl?.colorScheme?.info || 'yellow';
  const successColor = config.repl?.colorScheme?.success || 'green';

  // Get auto-compact threshold from config or use default
  const autoCompactThreshold = config.repl?.autoCompactThreshold || MAX_CONVERSATION_LENGTH * 2;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk[promptColor](promptStyle),
    historySize: historySize,
    completer: (line: string) => {
      const completions = ['/help', '/clear', '/exit', '/reset', '/tools', '/compact', '/config'];
      const hits = completions.filter((c) => c.startsWith(line));
      return [hits.length ? hits : completions, line];
    },
  });

  console.log(
    chalk[successColor]('Welcome to forq CLI!'),
    chalk[infoColor]('Type /help for available commands.'),
  );
  rl.prompt();

  // Setup cleanup function for graceful exit
  function cleanup(): void {
    analytics.endSession();
    savePermissionConfig();
    cleanupPermissionConfig();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  // Handle graceful exit
  process.on('SIGINT', () => {
    cleanup();
    console.log(chalk[infoColor]('\nBye!'));
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    console.log(chalk[infoColor]('\nTerminated!'));
    process.exit(0);
  });

  process.on('exit', () => {
    cleanup();
  });

  /**
   * Compacts the conversation history to reduce token usage
   * Keeps the system prompt, summarizes older messages, and preserves recent messages
   */
  function compactConversationHistory(): void {
    if (conversation.length <= 2) {
      console.log(chalk[infoColor]('Conversation too short to compact.'));
      return;
    }

    // Always keep the system prompt (first message)
    const systemPrompt = conversation[0];

    // If conversation is already small, don't compact
    if (conversation.length <= MAX_CONVERSATION_LENGTH) {
      console.log(chalk[infoColor]('Conversation already compact.'));
      return;
    }

    // Determine which messages to keep in full and which to summarize
    const keepCount = Math.min(MAX_CONVERSATION_LENGTH, conversation.length - 1);
    const messagesToSummarize = conversation.slice(1, -keepCount);
    const messagesToKeep = conversation.slice(-keepCount);

    // Create a summary message
    const summaryContent =
      `[This is a summary of ${messagesToSummarize.length} earlier messages in the conversation]\n\n` +
      messagesToSummarize
        .map((msg) => {
          return `${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}: ${
            msg.content.length > 100 ? msg.content.substring(0, 100) + '...' : msg.content
          }`;
        })
        .join('\n\n');

    // Create a new conversation with: system prompt, summary message, and recent messages
    conversation.length = 0;
    conversation.push(systemPrompt);
    conversation.push({
      role: 'system',
      content: summaryContent,
    });
    messagesToKeep.forEach((msg) => conversation.push(msg));

    console.log(
      chalk[successColor](
        `Compacted conversation history. Summarized ${messagesToSummarize.length} messages.`,
      ),
    );
  }

  /**
   * Displays REPL configuration status
   */
  function displayConfig(): void {
    const currentConfig = getConfig();
    console.log(chalk[infoColor]('Current REPL Configuration:'));

    console.log(chalk[infoColor]('API Settings:'));
    console.log(`  Model: ${currentConfig.api?.anthropic?.model || 'default'}`);
    console.log(`  Max Tokens: ${currentConfig.api?.anthropic?.maxTokens || 'default'}`);
    console.log(`  Temperature: ${currentConfig.api?.anthropic?.temperature || 'default'}`);

    console.log(chalk[infoColor]('REPL Settings:'));
    console.log(`  History Size: ${currentConfig.repl?.historySize || 'default'}`);
    console.log(
      `  Auto-Compact Threshold: ${currentConfig.repl?.autoCompactThreshold || 'default'}`,
    );

    console.log(chalk[infoColor]('Logging Settings:'));
    console.log(`  Log Level: ${currentConfig.logging?.level || 'default'}`);
    console.log(`  Log Conversation: ${currentConfig.logging?.logConversation ? 'Yes' : 'No'}`);
    console.log(`  Log Tool Calls: ${currentConfig.logging?.logToolCalls ? 'Yes' : 'No'}`);

    console.log(chalk[infoColor]('\nTo modify settings, use the config command:'));
    console.log(`  forq config --help`);
  }

  rl.on('line', async (line) => {
    // Track input as a command (if it's a special command)
    if (line.startsWith('/')) {
      analytics.trackCommand(line.split(' ')[0]);
    }

    const trimmedLine = line.trim();

    // Don't add empty lines or duplicates to history
    if (trimmedLine && (history.length === 0 || history[history.length - 1] !== trimmedLine)) {
      history.push(trimmedLine);
      fs.writeFileSync(historyFile, history.join('\n') + '\n');
      historyIndex = history.length;
    }

    // Handle basic REPL commands
    if (trimmedLine === '/help') {
      console.log(chalk[infoColor]('Available commands:'));
      console.log(chalk.cyan('/help') + ' - Display this help message');
      console.log(chalk.cyan('/clear') + ' - Clear the console');
      console.log(chalk.cyan('/exit') + ' - Exit the REPL');
      console.log(chalk.cyan('/reset') + ' - Reset the conversation');
      console.log(chalk.cyan('/tools') + ' - List available tools');
      console.log(chalk.cyan('/compact') + ' - Compact conversation history to reduce token usage');
      console.log(chalk.cyan('/config') + ' - Display current configuration');
    } else if (trimmedLine === '/clear') {
      console.clear();
    } else if (trimmedLine === '/exit') {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
      return;
    } else if (trimmedLine === '/reset') {
      conversation.length = 1; // Keep only the system prompt
      console.log(chalk[infoColor]('Conversation reset.'));
    } else if (trimmedLine === '/tools') {
      console.log(chalk[infoColor]('Available tools:'));
      getAllTools().forEach((tool) => {
        console.log(chalk.cyan(tool.name) + ' - ' + tool.description);
      });
    } else if (trimmedLine === '/compact') {
      compactConversationHistory();
    } else if (trimmedLine === '/config') {
      displayConfig();
    } else if (trimmedLine) {
      // Create user message
      const userMessage: Message = {
        role: 'user',
        content: trimmedLine,
      };

      // Add user message to conversation
      conversation.push(userMessage);

      // Log user message
      logger.logConversation(`User: ${trimmedLine}`);

      // Show thinking indicator
      process.stdout.write(chalk.gray('Thinking... '));

      try {
        // Show thinking indicator
        const thinkingInterval = setInterval(() => {
          process.stdout.write(chalk[infoColor]('.'));
        }, 500);

        // Get API config values
        const apiConfig = config.api?.anthropic;

        // Query AI
        const aiResponse = await queryAI(conversation, {
          maxTokens: apiConfig?.maxTokens,
          temperature: apiConfig?.temperature,
        });

        // Clear thinking indicator
        clearInterval(thinkingInterval);
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        // Display AI response
        console.log(chalk[responseColor]('AI: ') + aiResponse);

        // Extract tool calls from AI response
        const toolCalls = extractToolCalls(aiResponse);

        // Process tool calls if any
        if (toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            console.log(chalk.cyan(`Executing tool: ${toolCall.name}`));

            try {
              // Track tool usage for analytics
              analytics.trackToolUsage(toolCall.name);

              // Execute the tool
              const result = await executeTool(toolCall, toolContext);

              // Display tool result
              if (result.success) {
                console.log(chalk.green(`Tool execution successful: ${toolCall.name}`));
                if (result.result) {
                  console.log(JSON.stringify(result.result, null, 2));
                }
              } else {
                console.log(chalk.red(`Tool execution failed: ${toolCall.name}`));
                console.log(result.error);
              }
            } catch (toolError) {
              console.error(
                chalk[errorColor](`Error executing tool ${toolCall.name}: `) +
                  (toolError as Error).message,
              );
              logger.logError(toolError as Error, `Tool Execution Error: ${toolCall.name}`);
            }
          }
        }

        // Add AI response to conversation
        conversation.push({
          role: 'assistant',
          content: aiResponse,
        });

        // Auto-compact if conversation is getting too long
        if (conversation.length > autoCompactThreshold) {
          console.log(chalk[infoColor]('Conversation is getting long. Auto-compacting...'));
          compactConversationHistory();
        }
      } catch (error) {
        // Clear the thinking indicator
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        console.error(chalk[errorColor]('Error: ') + (error as Error).message);
        logger.logError(error as Error, 'REPL Error');
      }
    }

    rl.prompt();
  }).on('close', () => {
    analytics.endSession();
    console.log(chalk[infoColor]('Goodbye!'));
    process.exit(0);
  });
}
