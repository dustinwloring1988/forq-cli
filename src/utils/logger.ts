/**
 * Logger utility for forq CLI
 * Provides functions to log messages to console and log files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log file paths
const CONVERSATION_LOG = path.join(logsDir, 'conversation.log');
const ERROR_LOG = path.join(logsDir, 'error.log');
const ACTION_LOG = path.join(logsDir, 'actions.log');

/**
 * Logger class for handling different types of logs
 */
export class Logger {
  /**
   * Log a message to the conversation log with timestamp
   * @param message The message to log
   */
  logConversation(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}${os.EOL}`;
    fs.appendFileSync(CONVERSATION_LOG, logEntry);
  }

  /**
   * Log an error to the error log with timestamp
   * @param error The error to log
   * @param context Additional context about the error
   */
  logError(error: Error | string, context?: string): void {
    const timestamp = new Date().toISOString();
    const errorMessage = error instanceof Error ? `${error.message}\n${error.stack}` : error;

    const logEntry = `[${timestamp}] ${context ? context + ': ' : ''}${errorMessage}${os.EOL}`;
    fs.appendFileSync(ERROR_LOG, logEntry);
  }

  /**
   * Log an action to the actions log with timestamp
   * @param action The action performed
   * @param details Details about the action
   */
  logAction(action: string, details?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString();
    const detailsStr = details ? JSON.stringify(details) : '';
    const logEntry = `[${timestamp}] ${action} ${detailsStr}${os.EOL}`;
    fs.appendFileSync(ACTION_LOG, logEntry);
  }
}

// Export a singleton instance of the logger
export const logger = new Logger();
