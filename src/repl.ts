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

// Maximum number of messages to keep in history before compacting
const MAX_CONVERSATION_LENGTH = 20;

/**
 * Interactive REPL (Read-Eval-Print Loop) for the forq CLI
 * Handles user input and interacts with AI
 */
export async function startRepl(): Promise<void> {
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

  let historyIndex = history.length;
  let currentInput = '';

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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('forq> '),
    historySize: 100,
    completer: (line: string) => {
      const completions = ['/help', '/clear', '/exit', '/reset', '/tools', '/compact'];
      const hits = completions.filter((c) => c.startsWith(line));
      return [hits.length ? hits : completions, line];
    },
  });

  // Enable keypress events
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // We need to use readline.emitKeypressEvents to handle arrow keys
  readline.emitKeypressEvents(process.stdin);

  console.log(
    chalk.green('Welcome to forq CLI!'),
    chalk.yellow('Type /help for available commands.'),
  );
  rl.prompt();

  // Handle history navigation and input processing
  process.stdin.on('keypress', (_, key) => {
    if (!key) return;

    if (key.name === 'up' && historyIndex > 0) {
      if (historyIndex === history.length) {
        currentInput = rl.line;
      }
      historyIndex--;
      // Clear current line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      // Write the prompt and historical command
      process.stdout.write(chalk.blue('forq> ') + history[historyIndex]);
    } else if (key.name === 'down') {
      // Clear current line
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);

      if (historyIndex < history.length - 1) {
        historyIndex++;
        // Write the prompt and historical command
        process.stdout.write(chalk.blue('forq> ') + history[historyIndex]);
      } else if (historyIndex === history.length - 1) {
        historyIndex = history.length;
        // Write the prompt and current input
        process.stdout.write(chalk.blue('forq> ') + currentInput);
      } else {
        // Just rewrite the prompt
        process.stdout.write(chalk.blue('forq> '));
      }
    }
  });

  /**
   * Compacts the conversation history to reduce token usage
   * Keeps the system prompt, summarizes older messages, and preserves recent messages
   */
  function compactConversationHistory(): void {
    if (conversation.length <= 2) {
      console.log(chalk.yellow('Conversation too short to compact.'));
      return;
    }

    // Always keep the system prompt (first message)
    const systemPrompt = conversation[0];

    // If conversation is already small, don't compact
    if (conversation.length <= MAX_CONVERSATION_LENGTH) {
      console.log(chalk.yellow('Conversation already compact.'));
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
      chalk.green(
        `Compacted conversation history. Summarized ${messagesToSummarize.length} messages.`,
      ),
    );
  }

  rl.on('line', async (line) => {
    const trimmedLine = line.trim();

    // Don't add empty lines or duplicates to history
    if (trimmedLine && (history.length === 0 || history[history.length - 1] !== trimmedLine)) {
      history.push(trimmedLine);
      fs.writeFileSync(historyFile, history.join('\n') + '\n');
      historyIndex = history.length;
    }

    // Handle basic REPL commands
    if (trimmedLine === '/help') {
      console.log(chalk.yellow('Available commands:'));
      console.log(chalk.cyan('/help') + ' - Display this help message');
      console.log(chalk.cyan('/clear') + ' - Clear the console');
      console.log(chalk.cyan('/exit') + ' - Exit the REPL');
      console.log(chalk.cyan('/reset') + ' - Reset the conversation');
      console.log(chalk.cyan('/tools') + ' - List available tools');
      console.log(chalk.cyan('/compact') + ' - Compact conversation history to reduce token usage');
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
      console.log(chalk.yellow('Conversation reset.'));
    } else if (trimmedLine === '/tools') {
      console.log(chalk.yellow('Available tools:'));
      getAllTools().forEach((tool) => {
        console.log(chalk.cyan(tool.name) + ' - ' + tool.description);
      });
    } else if (trimmedLine === '/compact') {
      compactConversationHistory();
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
        // Get AI response
        const aiResponse = await queryAI(conversation);

        // Clear the thinking indicator
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        // Extract tool calls from AI response
        const toolCalls = extractToolCalls(aiResponse);

        // Process tool calls if any
        if (toolCalls.length > 0) {
          console.log(chalk.green('AI: ') + aiResponse);

          // Execute each tool call
          for (const toolCall of toolCalls) {
            console.log(chalk.cyan(`Executing tool: ${toolCall.name}`));

            try {
              const result = await executeTool(toolCall, toolContext);

              if (result.success) {
                console.log(chalk.green('Tool execution successful:'));
                console.log(JSON.stringify(result.result, null, 2));
              } else {
                console.log(chalk.red('Tool execution failed:'));
                console.log(result.error);
              }
            } catch (error) {
              console.error(chalk.red('Error executing tool: ') + (error as Error).message);
            }
          }
        } else {
          // Just display the normal response
          console.log(chalk.green('AI: ') + aiResponse);
        }

        // Add AI response to conversation
        conversation.push({
          role: 'assistant',
          content: aiResponse,
        });

        // Auto-compact if conversation is getting too long
        if (conversation.length > MAX_CONVERSATION_LENGTH * 2) {
          console.log(chalk.yellow('Conversation is getting long. Auto-compacting...'));
          compactConversationHistory();
        }
      } catch (error) {
        // Clear the thinking indicator
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);

        console.error(chalk.red('Error: ') + (error as Error).message);
        logger.logError(error as Error, 'REPL Error');
      }
    }

    rl.prompt();
  }).on('close', () => {
    console.log(chalk.yellow('Goodbye!'));
    process.exit(0);
  });

  // Setup cleanup function for graceful exit
  function cleanup(): void {
    savePermissionConfig();
    cleanupPermissionConfig();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }

  // Handle graceful exit
  process.on('SIGINT', () => {
    cleanup();
    console.log(chalk.yellow('\nBye!'));
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    cleanup();
    console.log(chalk.yellow('\nTerminated!'));
    process.exit(0);
  });

  process.on('exit', () => {
    cleanup();
  });
}
