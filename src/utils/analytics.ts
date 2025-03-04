/**
 * Analytics module for tracking usage metrics
 * Provides functions to track session duration, commands used, etc.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from './logger';

// Analytics log file path
const logsDir = path.join(process.cwd(), 'logs');
const ANALYTICS_LOG = path.join(logsDir, 'analytics.log');

// Session tracking
interface SessionMetrics {
  sessionId: string;
  startTime: Date;
  endTime?: Date;
  commands: { name: string; count: number }[];
  toolsUsed: { name: string; count: number }[];
  totalTokensUsed?: number;
}

/**
 * Analytics class for tracking usage metrics
 */
export class Analytics {
  private currentSession: SessionMetrics;
  private initialized = false;

  constructor() {
    this.currentSession = this.createNewSession();
  }

  /**
   * Initialize analytics tracking for a new session
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.initialized = true;
    logger.logAction('AnalyticsInitialized', { sessionId: this.currentSession.sessionId });
  }

  /**
   * Create a new analytics session
   */
  private createNewSession(): SessionMetrics {
    return {
      sessionId: this.generateSessionId(),
      startTime: new Date(),
      commands: [],
      toolsUsed: [],
    };
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Track a command being used
   * @param commandName The name of the command
   */
  trackCommand(commandName: string): void {
    if (!this.initialized) {
      this.initialize();
    }

    const existingCommand = this.currentSession.commands.find((c) => c.name === commandName);
    if (existingCommand) {
      existingCommand.count++;
    } else {
      this.currentSession.commands.push({ name: commandName, count: 1 });
    }

    logger.logAction('CommandUsed', { commandName });
  }

  /**
   * Track a tool being used
   * @param toolName The name of the tool
   */
  trackToolUsage(toolName: string): void {
    if (!this.initialized) {
      this.initialize();
    }

    const existingTool = this.currentSession.toolsUsed.find((t) => t.name === toolName);
    if (existingTool) {
      existingTool.count++;
    } else {
      this.currentSession.toolsUsed.push({ name: toolName, count: 1 });
    }

    logger.logAction('ToolUsed', { toolName });
  }

  /**
   * Track token usage
   * @param tokenCount The number of tokens used
   */
  trackTokenUsage(tokenCount: number): void {
    if (!this.initialized) {
      this.initialize();
    }

    this.currentSession.totalTokensUsed = (this.currentSession.totalTokensUsed || 0) + tokenCount;
    logger.logAction('TokensUsed', {
      tokens: tokenCount,
      total: this.currentSession.totalTokensUsed,
    });
  }

  /**
   * End the current session and log analytics data
   */
  endSession(): void {
    if (!this.initialized) {
      return;
    }

    this.currentSession.endTime = new Date();
    const sessionDuration = this.getSessionDuration();

    // Log the session data
    const analyticsData = {
      ...this.currentSession,
      durationMs: sessionDuration,
      durationFormatted: this.formatDuration(sessionDuration),
    };

    const logEntry = `[${new Date().toISOString()}] SESSION_ENDED ${JSON.stringify(analyticsData)}${os.EOL}`;
    fs.appendFileSync(ANALYTICS_LOG, logEntry);

    logger.logAction('SessionEnded', {
      sessionId: this.currentSession.sessionId,
      duration: sessionDuration,
      commandsUsed: this.currentSession.commands.length,
      toolsUsed: this.currentSession.toolsUsed.length,
      totalTokens: this.currentSession.totalTokensUsed || 0,
    });

    // Reset for next session
    this.currentSession = this.createNewSession();
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration(): number {
    const endTime = this.currentSession.endTime || new Date();
    return endTime.getTime() - this.currentSession.startTime.getTime();
  }

  /**
   * Format duration in human-readable format
   * @param durationMs Duration in milliseconds
   */
  private formatDuration(durationMs: number): string {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Export a singleton instance of analytics
export const analytics = new Analytics();
