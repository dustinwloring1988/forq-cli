/**
 * Type definitions for message structures used in AI communication
 */

/**
 * Represents a message in a conversation with the AI
 */
export interface Message {
  /** The role of the message sender (system, user, or assistant) */
  role: 'system' | 'user' | 'assistant';
  /** The content of the message */
  content: string;
  /** Optional metadata for tracking, debugging, etc. */
  metadata?: Record<string, any>;
}
