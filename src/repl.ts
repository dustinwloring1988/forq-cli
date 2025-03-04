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

/**
 * Interactive REPL (Read-Eval-Print Loop) for the forq CLI
 * Handles user input and interacts with AI
 */
export function startRepl(): void {
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

  // Get system prompt
  const systemPrompt = loadSystemPrompt();

  // Initialize conversation with system prompt
  const conversation: Message[] = [systemPrompt];

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.blue('forq> '),
    historySize: 100,
    completer: (line: string) => {
      const completions = ['/help', '/clear', '/exit'];
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

        // Display response
        console.log(chalk.green('AI: ') + aiResponse);

        // Add AI response to conversation
        conversation.push({
          role: 'assistant',
          content: aiResponse,
        });
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
}
