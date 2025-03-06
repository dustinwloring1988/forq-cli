/**
 * Type definitions for message structures used in AI communication
 */

/**
 * Block types for message content
 */
export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export interface RedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | RedactedThinkingBlock
  | ToolUseBlock
  | ToolResultBlock;

/**
 * Represents a message in a conversation with the AI
 */
export interface Message {
  /** The role of the message sender (system, user, or assistant) */
  role: 'system' | 'user' | 'assistant';
  /** The content of the message, can be a string or an array of content blocks */
  content: string | ContentBlock[];
  /** Optional metadata for tracking, debugging, etc. */
  metadata?: Record<string, any>;
}
