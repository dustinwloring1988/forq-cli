import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline'; // Keep this import for utility functions
// Using require for chalk to avoid ESM issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');
// Use inquirer for input handling to avoid the character duplication issue
// eslint-disable-next-line @typescript-eslint/no-var-requires
const inquirer = require('inquirer');

import { Message } from './types/messages';
import { loadSystemPrompt } from './config/systemPrompt';
import { queryAI, streamAI } from './api/ai';
import { logger } from './utils/logger';
import { analytics } from './utils/analytics';
import { loadTools, executeTool, getAllTools, getToolsSchema } from './tools';
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

  // Initialize permission config
  initializePermissionConfig();

  // Set up history file
  const historyDir = path.join(os.homedir(), '.forq');
  const historyFile = path.join(historyDir, 'history');

  if (!fs.existsSync(historyDir)) {
    fs.mkdirSync(historyDir, { recursive: true });
  }

  let history: string[] = [];
  if (fs.existsSync(historyFile)) {
    try {
      history = fs.readFileSync(historyFile, 'utf8').split('\n').filter(Boolean);
    } catch (error) {
      console.error('Error loading history:', (error as Error).message);
    }
  }

  // Create tool context based on current working directory
  const toolContext: ToolContext = {
    cwd: process.cwd(),
    logger: logger,
  };

  // Get code context to enhance system prompt
  const projectInstructions = loadProjectInstructions();
  let enhancedSystemPrompt: Message = loadSystemPrompt();

  // Add project instructions if available
  if (projectInstructions) {
    enhancedSystemPrompt.content += `\n\n## Project-Specific Instructions\n${projectInstructions}`;
  }

  // Add git context if available
  const gitContext = collectGitContext();
  if (gitContext) {
    enhancedSystemPrompt.content += `\n\n${gitContext}`;
    console.log(chalk.green('Added git context to system prompt'));
  }

  // Add project structure summary
  const structureSummary = getDirectoryStructureSummary();
  if (structureSummary) {
    enhancedSystemPrompt.content += `\n\n${structureSummary}`;
    console.log(chalk.green('Added project structure to system prompt'));
  }

  // Initialize conversation with enhanced system prompt
  const conversation: Message[] = [enhancedSystemPrompt];

  // Apply configuration for prompt
  const promptStyle = config.repl?.prompt || 'forq> ';

  // Apply color scheme if configured
  const promptColor = config.repl?.colorScheme?.prompt || 'blue';
  const responseColor = config.repl?.colorScheme?.response || 'green';
  const errorColor = config.repl?.colorScheme?.error || 'red';
  const infoColor = config.repl?.colorScheme?.info || 'yellow';
  const successColor = config.repl?.colorScheme?.success || 'green';

  // Get auto-compact threshold from config or use default
  const autoCompactThreshold = config.repl?.autoCompactThreshold || MAX_CONVERSATION_LENGTH * 2;

  // Setup cleanup function for graceful exit
  function cleanup(): void {
    analytics.endSession();
    savePermissionConfig();
    cleanupPermissionConfig();
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
    console.log(
      `  Complete Tool Cycle: ${currentConfig.api?.anthropic?.completeToolCycle !== false ? 'Yes' : 'No'}`,
    );

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

  console.log(
    chalk[successColor]('Welcome to forq CLI!'),
    chalk[infoColor]('Type /help for available commands.'),
  );

  // Main REPL loop using inquirer
  async function replLoop() {
    try {
      const historySize = config.repl?.historySize || 100;

      const { input } = await inquirer.prompt([
        {
          type: 'input',
          name: 'input',
          message: chalk[promptColor](promptStyle),
          // Handle history and tab completion within inquirer
          validate: (value: string) => true,
        },
      ]);

      const trimmedLine = input.trim();

      // Track input as a command (if it's a special command)
      if (trimmedLine.startsWith('/')) {
        analytics.trackCommand(trimmedLine.split(' ')[0]);
      }

      // Don't add empty lines or duplicates to history
      if (trimmedLine && (history.length === 0 || history[history.length - 1] !== trimmedLine)) {
        history.push(trimmedLine);
        fs.writeFileSync(historyFile, history.join('\n') + '\n');
      }

      // Handle basic REPL commands
      if (trimmedLine === '/help') {
        console.log(chalk[infoColor]('Available commands:'));
        console.log(chalk.cyan('/help') + ' - Display this help message');
        console.log(chalk.cyan('/clear') + ' - Clear the console');
        console.log(chalk.cyan('/exit') + ' - Exit the REPL');
        console.log(chalk.cyan('/reset') + ' - Reset the conversation');
        console.log(chalk.cyan('/tools') + ' - List available tools');
        console.log(
          chalk.cyan('/compact') + ' - Compact conversation history to reduce token usage',
        );
        console.log(chalk.cyan('/config') + ' - Display current configuration');
        console.log(chalk.cyan('/tool-cycle') + ' - Toggle complete tool cycle feature');
      } else if (trimmedLine === '/clear') {
        console.clear();
      } else if (trimmedLine === '/exit') {
        cleanup();
        console.log(chalk[infoColor]('Goodbye!'));
        process.exit(0);
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
      } else if (trimmedLine === '/tool-cycle') {
        // Toggle the tool cycle setting
        const currentValue = config.api?.anthropic?.completeToolCycle;
        const newValue = !currentValue;

        if (config.api && config.api.anthropic) {
          config.api.anthropic.completeToolCycle = newValue;
          console.log(
            chalk[infoColor](`Complete tool cycle ${newValue ? 'enabled' : 'disabled'}.`),
          );
          console.log(
            chalk[infoColor](
              newValue
                ? 'Tool results will be sent back to Claude for a final response.'
                : 'Tool results will be executed without sending back to Claude.',
            ),
          );
        } else {
          console.log(
            chalk[errorColor](
              'Unable to toggle tool cycle setting. Configuration not properly initialized.',
            ),
          );
        }
      } else if (trimmedLine) {
        try {
          const userInput = trimmedLine;

          // Add user message to conversation history
          conversation.push({
            role: 'user',
            content: userInput,
          });

          // Log user message to conversation log
          logger.logConversation(`User: ${userInput}`);

          // Show a thinking indicator
          console.log(chalk[promptColor]('Thinking...'));

          // Get AI response using stream for better UX
          let responseContent = '';

          // Streaming setup
          const handleChunk = (chunk: string) => {
            // Print chunk without a newline
            process.stdout.write(chunk);
            responseContent += chunk;
          };

          // Complete response handler
          const handleComplete = async (response: {
            text: string;
            toolCalls: any[];
            stopReason: string | null;
            toolUseId?: string;
          }) => {
            // Update response content
            responseContent = response.text;

            // Add assistant message to conversation
            conversation.push({
              role: 'assistant',
              content: responseContent,
            });

            // Log assistant response
            logger.logConversation(`AI: ${responseContent}`);

            // Log conversation length and check if auto-compact is needed
            if (conversation.length >= autoCompactThreshold) {
              console.log(
                chalk[infoColor](
                  `Conversation length (${conversation.length}) exceeded threshold. Auto-compacting...`,
                ),
              );
              compactConversationHistory();
            }

            // Process tool calls if any
            if (response.toolCalls && response.toolCalls.length > 0) {
              for (const toolCall of response.toolCalls) {
                // Log the tool call
                logger.logAction(`Executing tool: ${toolCall.name}`);
                analytics.trackToolUsage(toolCall.name);

                try {
                  // Execute the tool and get result
                  const result = await executeTool(toolCall, toolContext);
                  console.log(chalk.cyan(`Tool ${toolCall.name} executed successfully`));

                  // Check if we should complete the tool cycle by sending result back to Claude
                  const completeToolCycle = config.api?.anthropic?.completeToolCycle !== false;
                  const isToolUse = response.stopReason === 'tool_use';

                  if (completeToolCycle && isToolUse && response.toolUseId) {
                    console.log(chalk[infoColor]('Sending tool result back to Claude...'));

                    // Import the sendToolResultToAI function from the AI API
                    const { sendToolResultToAI } = await import('./api/ai.js');

                    // Create a shallow copy of the conversation to avoid modifying the original
                    const conversationCopy = [...conversation];

                    // Send the tool result back to Claude
                    const finalResponse = await sendToolResultToAI(
                      conversationCopy,
                      result,
                      response.toolUseId,
                      {},
                    );

                    // Process the final response
                    if (finalResponse) {
                      // Print the response
                      console.log('\n' + chalk[responseColor](finalResponse.text));

                      // Add the final response to the conversation
                      conversation.push({
                        role: 'assistant',
                        content: finalResponse.text,
                      });

                      // Log the final response
                      logger.logConversation(`AI (final): ${finalResponse.text}`);
                    }
                  }
                } catch (error) {
                  const errorMessage = (error as Error).message;
                  console.error(
                    chalk[errorColor](`Error executing tool ${toolCall.name}: ${errorMessage}`),
                  );
                }
              }
            }
          };

          // Stream the response
          await streamAI(conversation, handleChunk, handleComplete as (response: any) => void);

          // Add a newline after streaming completes
          console.log('');
        } catch (error) {
          console.error(chalk[errorColor](`Error: ${(error as Error).message}`));
          logger.logError((error as Error).message, 'REPL Error');
        }
      }

      // Continue the REPL loop
      replLoop();
    } catch (error) {
      console.error(chalk[errorColor](`REPL error: ${(error as Error).message}`));
      logger.logError((error as Error).message, 'REPL Error');
      process.exit(1);
    }
  }

  // Start the REPL loop
  await replLoop();
}
