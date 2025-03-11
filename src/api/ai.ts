/**
 * AI API Integration
 * Handles interactions with the Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import {
  Message as ForqMessage,
  ContentBlock,
  ThinkingBlock,
  RedactedThinkingBlock,
} from '../types/messages';
import { ToolCall, ToolResult } from '../types/tools';
import { getToolsSchema } from '../tools';
import { logger } from '../utils/logger';
import chalk from 'chalk';

// Load environment variables
dotenv.config();

// Check if running in self mode
const isSelfMode = process.argv.some(arg => arg.includes('self'));
console.log('Running in self mode:', isSelfMode);

// Set up Anthropic client with API key
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey && !isSelfMode) {
  console.error(
    chalk.red('Error: ANTHROPIC_API_KEY environment variable is required. Set it in .env file.'),
  );
  process.exit(1);
}

const anthropic = new Anthropic({
  apiKey,
});

/**
 * Find the last index in an array that satisfies the predicate function
 * @param array The array to search
 * @param predicate Function to test each element
 * @returns Index of the last element that satisfies the predicate, or -1 if none found
 */
function findLastIndex<T>(array: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i], i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Configuration options for AI requests
 */
export interface AIOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: {
    enabled?: boolean;
    budgetTokens?: number;
  };
}

/**
 * Default AI configuration
 */
const DEFAULT_AI_OPTIONS: AIOptions = {
  model: 'claude-3-7-sonnet-20250219',
  maxTokens: 64000,
  temperature: 1,
  thinking: {
    enabled: false,
    budgetTokens: 32000,
  },
};

/**
 * Convert Forq messages to Anthropic format
 */
function convertToAnthropicMessages(
  messages: ForqMessage[],
  debug: boolean = false,
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    // Skip system messages as they're handled separately
    if (msg.role === 'system') continue;

    // Skip messages with empty content
    if (!msg.content) {
      if (debug) {
        logger.logAction('Skipping Empty Message', { role: msg.role });
      }
      continue;
    }

    // Create the message in Anthropic format
    const anthropicMsg: Anthropic.MessageParam = {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    };

    // If the content is a string but appears to be a JSON array, try to parse it
    // This handles cases where thinking blocks are stored as a JSON string
    if (
      typeof msg.content === 'string' &&
      (msg.content.startsWith('[') || msg.content.startsWith('{'))
    ) {
      try {
        const parsedContent = JSON.parse(msg.content);
        if (Array.isArray(parsedContent)) {
          anthropicMsg.content = parsedContent;
          if (debug) {
            logger.logAction('Parsed JSON Content', {
              role: msg.role,
              contentTypes: parsedContent.map((item) => item.type).join(','),
            });
          }
        }
      } catch (error) {
        // If parsing fails, keep the original string content
        if (debug) {
          logger.logAction('Failed to parse JSON content', { error: (error as Error).message });
        }
      }
    }

    // If the message has metadata with original content (which may contain thinking blocks),
    // use that content instead. This is critical for preserving thinking blocks.
    if (msg.metadata?.originalContent) {
      const originalContent = msg.metadata.originalContent;
      if (Array.isArray(originalContent)) {
        anthropicMsg.content = originalContent;
        if (debug) {
          logger.logAction('Using Original Content from Metadata', {
            role: msg.role,
            contentTypes: originalContent.map((item) => item.type).join(','),
          });
        }
      }
    }

    // Check for original response in metadata
    if (msg.metadata?.originalResponse) {
      const originalResponse = msg.metadata.originalResponse;
      if (
        originalResponse.text &&
        Array.isArray(originalResponse.text) &&
        originalResponse.text.some(
          (block: any) => block.type === 'thinking' || block.type === 'redacted_thinking',
        )
      ) {
        anthropicMsg.content = originalResponse.text;
        if (debug) {
          logger.logAction('Using Original Response Text with Thinking Blocks', {
            role: msg.role,
            contentTypes: originalResponse.text.map((item: any) => item.type).join(','),
          });
        }
      }
    }

    result.push(anthropicMsg);
  }

  if (debug) {
    logger.logAction('Converted Messages', {
      count: result.length,
      roles: result.map((m) => m.role).join(','),
    });
  }

  return result;
}

/**
 * Extract system message from messages array
 */
function extractSystemMessage(messages: ForqMessage[]): string | undefined {
  const systemMessage = messages.find((msg) => msg.role === 'system');
  if (!systemMessage) return undefined;

  // Handle case where content might be an array of ContentBlock
  if (typeof systemMessage.content === 'string') {
    return systemMessage.content;
  }

  // System messages should always have string content, but handle the case
  // where it might somehow be an array
  return undefined;
}

/**
 * Extract thinking blocks from a message's content
 * @param content The message content (string or ContentBlock[])
 * @returns Array of thinking blocks, or empty array if none found
 */
function extractThinkingBlocks(
  content: string | ContentBlock[],
): (ThinkingBlock | RedactedThinkingBlock)[] {
  // If content is a string, try to parse it as JSON
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
        ) as (ThinkingBlock | RedactedThinkingBlock)[];
      }
    } catch (error) {
      // If parsing fails, return empty array
      return [];
    }
  }

  // If content is already an array, filter out thinking blocks
  if (Array.isArray(content)) {
    return content.filter(
      (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
    ) as (ThinkingBlock | RedactedThinkingBlock)[];
  }

  return [];
}

/**
 * Extract thinking blocks from the last assistant message in a conversation
 * @param messages The conversation messages
 * @returns Array of thinking blocks, or empty array if none found
 */
function extractLastAssistantThinkingBlocks(
  messages: ForqMessage[],
): (ThinkingBlock | RedactedThinkingBlock)[] {
  // Find the last assistant message
  const lastAssistantIndex = [...messages].reverse().findIndex((msg) => msg.role === 'assistant');
  if (lastAssistantIndex === -1) return [];

  // Get the message
  const lastAssistantMessage = messages[messages.length - 1 - lastAssistantIndex];

  // Check metadata first
  if (lastAssistantMessage.metadata?.originalContent) {
    const originalContent = lastAssistantMessage.metadata.originalContent;
    return extractThinkingBlocks(originalContent);
  }

  // Check original response in metadata
  if (lastAssistantMessage.metadata?.originalResponse?.text) {
    return extractThinkingBlocks(lastAssistantMessage.metadata.originalResponse.text);
  }

  // Check the content directly
  return extractThinkingBlocks(lastAssistantMessage.content);
}

/**
 * Ensure thinking blocks are correctly ordered before other content types
 * @param content Array of content blocks
 * @returns Reordered content blocks with thinking blocks first
 */
function ensureCorrectBlockOrder(content: ContentBlock[]): ContentBlock[] {
  if (!content || !Array.isArray(content) || content.length <= 1) return content;

  // Separate blocks by type
  const thinkingBlocks = content.filter(
    (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
  );
  const toolUseBlocks = content.filter((block) => block.type === 'tool_use');
  const toolResultBlocks = content.filter((block) => block.type === 'tool_result');
  const textBlocks = content.filter((block) => block.type === 'text');

  // Return in correct order: thinking blocks → tool_use blocks → tool_result blocks → text blocks
  return [...thinkingBlocks, ...toolUseBlocks, ...toolResultBlocks, ...textBlocks];
}

/**
 * Convert our internal tool schema format to Anthropic's expected format
 */
function convertToAnthropicTools(toolsSchema: Record<string, any>[]): Anthropic.Tool[] {
  return toolsSchema.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

/**
 * Extract tool calls from Anthropic API response
 */
function extractToolCallsFromResponse(response: Anthropic.Message): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  // Check if there are any tool_use content blocks in the response
  for (const contentBlock of response.content) {
    if (contentBlock.type === 'tool_use') {
      toolCalls.push({
        name: contentBlock.name,
        parameters: contentBlock.input || {},
      });

      logger.logAction('Tool Call Detected', {
        tool: contentBlock.name,
        parameters: JSON.stringify(contentBlock.input),
      });
    }
  }

  return toolCalls;
}

/**
 * Parsed response from an AI request
 */
export interface AIResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
  toolUseId?: string;
  metadata?: Record<string, any>;
}

/**
 * Query the AI with a series of messages
 * @param messages Array of messages to send to the AI
 * @param options Optional configuration options
 * @returns Promise resolving to an AIResponse object with text and toolCalls
 */
export async function queryAI(messages: ForqMessage[], options?: AIOptions): Promise<AIResponse> {
  try {
    const anthropicMessages = convertToAnthropicMessages(messages);
    const systemPrompt = extractSystemMessage(messages);

    // Merge default options with provided options
    const mergedOptions = {
      ...DEFAULT_AI_OPTIONS,
      ...options,
    };

    // Build API request parameters
    const requestParams: any = {
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
    };

    // If thinking is enabled, set temperature to 1 as required by the API
    if (mergedOptions.thinking?.enabled && mergedOptions.thinking.budgetTokens) {
      requestParams.thinking = {
        type: 'enabled',
        budget_tokens: mergedOptions.thinking.budgetTokens,
      };
      requestParams.temperature = 1; // Must be 1 when thinking is enabled
    } else {
      requestParams.temperature = mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!;
    }

    const response = await anthropic.beta.messages.create(requestParams);

    // Extract text from the response
    const responseText = response.content
      .map((c) => {
        if (c.type === 'text') {
          return c.text;
        }
        return '';
      })
      .join('');

    // Extract tool calls from the response
    const toolCalls = extractToolCallsFromResponse(response);

    logger.logConversation(`AI Response: ${responseText}`);
    return {
      text: responseText,
      toolCalls,
      stopReason: response.stop_reason,
      toolUseId:
        toolCalls.length > 0 ? response.content.find((c) => c.type === 'tool_use')?.id : undefined,
    };
  } catch (error) {
    logger.logError(error as Error, 'AI API Error');
    return {
      text: `Error communicating with AI: ${(error as Error).message}`,
      toolCalls: [],
      stopReason: 'error',
    };
  }
}

/**
 * Stream AI response to a callback function
 * @param messages Conversation messages
 * @param onChunk Callback function called for each text chunk
 * @param onComplete Callback function called when the response is complete with full text and tool calls
 * @param options Optional configuration options
 */
export async function streamAI(
  messages: ForqMessage[],
  onChunk: (text: string) => void,
  onComplete?: (response: AIResponse) => Promise<void> | void,
  options?: AIOptions,
): Promise<AIResponse> {
  try {
    const anthropicMessages = convertToAnthropicMessages(messages);
    const systemPrompt = extractSystemMessage(messages);

    // Merge default options with provided options
    const mergedOptions = {
      ...DEFAULT_AI_OPTIONS,
      ...options,
    };

    // Build API request parameters
    const requestParams: any = {
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
    };

    // If thinking is enabled, set temperature to 1 as required by the API
    if (mergedOptions.thinking?.enabled && mergedOptions.thinking.budgetTokens) {
      requestParams.thinking = {
        type: 'enabled',
        budget_tokens: mergedOptions.thinking.budgetTokens,
      };
      requestParams.temperature = 1; // Must be 1 when thinking is enabled
      logger.logAction('Enabled Extended Thinking', {
        budgetTokens: mergedOptions.thinking.budgetTokens,
      });
    } else {
      requestParams.temperature = mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!;
    }

    // Get the stream with Anthropic SDK
    const stream = await anthropic.beta.messages.stream(requestParams);

    // Track response data for the final AIResponse
    let fullResponseText = '';
    let stopReason: string | null = null;
    let finalToolCalls: ToolCall[] = [];
    let toolUseId: string | undefined = undefined;

    // Process the stream
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const textChunk = chunk.delta.text;
        onChunk(textChunk);
        fullResponseText += textChunk;
      }
    }

    // Get the final message once streaming is complete
    const finalMessage = await stream.finalMessage();
    stopReason = finalMessage.stop_reason;

    // Extract tool calls from final message
    finalToolCalls = extractToolCallsFromResponse(finalMessage);
    toolUseId =
      finalToolCalls.length > 0
        ? finalMessage.content.find((c) => c.type === 'tool_use')?.id
        : undefined;

    // Check if there are thinking blocks
    const hasThinkingBlocks = finalMessage.content.some(
      (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
    );

    logger.logConversation(`AI Response: ${fullResponseText}`);
    if (hasThinkingBlocks) {
      logger.logAction('Message Contains Thinking Blocks', {
        blocks: finalMessage.content.map((block) => block.type).join(','),
      });
    }

    // Create the AI response
    const aiResponse: AIResponse = {
      text: fullResponseText,
      toolCalls: finalToolCalls,
      stopReason,
      toolUseId,
    };

    // If thinking is enabled or there are tool calls, store the original content in metadata
    if (hasThinkingBlocks || finalToolCalls.length > 0) {
      // Create a new metadata object if it doesn't exist
      if (!aiResponse.metadata) {
        aiResponse.metadata = {};
      }
      // Store the original content in metadata
      aiResponse.metadata.originalContent = finalMessage.content;
    }

    if (onComplete) {
      await onComplete(aiResponse);
    }

    return aiResponse;
  } catch (error) {
    logger.logError(error as Error, 'AI Streaming Error');
    onChunk(`Error streaming from AI: ${(error as Error).message}`);

    const errorResponse: AIResponse = {
      text: `Error streaming from AI: ${(error as Error).message}`,
      toolCalls: [],
      stopReason: 'error',
    };

    if (onComplete) {
      await onComplete(errorResponse);
    }

    return errorResponse;
  }
}

/**
 * Send a tool result back to the AI
 * @param messages Conversation messages
 * @param toolResult Result from tool execution
 * @param toolUseId ID of the tool use request
 * @param options AI options
 * @returns Promise resolving to an AIResponse object
 */
export async function sendToolResultToAI(
  messages: ForqMessage[],
  toolResult: ToolResult,
  toolUseId: string,
  options?: AIOptions,
): Promise<AIResponse> {
  try {
    // If the tool result indicates a permission error, handle it specially
    if (!toolResult.success && toolResult.error?.includes('Permission denied')) {
      logger.logAction('Tool Permission Denied', {
        toolName: toolResult.toolName,
        error: toolResult.error,
      });

      return {
        text: `The tool execution was stopped because permission was denied: ${toolResult.error}`,
        toolCalls: [],
        stopReason: 'permission_denied',
      };
    }

    // Enable debug mode to troubleshoot message conversion
    const debug = true;

    // Extract thinking blocks from the last assistant message
    const thinkingBlocks = extractLastAssistantThinkingBlocks(messages);

    if (thinkingBlocks.length > 0) {
      logger.logAction('Found Thinking Blocks in Last Assistant Message', {
        count: thinkingBlocks.length,
        types: thinkingBlocks.map((block) => block.type).join(','),
      });
    }

    // Find the last AI response in the messages
    const lastAssistantMessageIndex = findLastIndex(messages, (msg) => msg.role === 'assistant');

    // Check if the last assistant message has originalContent from a previous response
    const lastAssistantMessage =
      lastAssistantMessageIndex >= 0 ? messages[lastAssistantMessageIndex] : undefined;

    // Check for originalContent in metadata (where thinking blocks would be stored)
    const originalContent = lastAssistantMessage?.metadata?.originalContent;

    if (originalContent) {
      logger.logAction('Found Original Content in Metadata', {
        contentTypes: Array.isArray(originalContent)
          ? originalContent.map((block: any) => block.type).join(',')
          : 'unknown',
      });
    }

    // Create a copy of messages to modify
    const messagesCopy = [...messages];

    // If thinking is enabled and we found thinking blocks, ensure they're properly included in the assistant message
    const mergedOptions = {
      ...DEFAULT_AI_OPTIONS,
      ...options,
    };
    const thinkingEnabled = mergedOptions.thinking?.enabled === true;

    if (thinkingEnabled && lastAssistantMessageIndex >= 0) {
      // If we have original content, use it
      if (originalContent && Array.isArray(originalContent)) {
        messagesCopy[lastAssistantMessageIndex] = {
          ...messagesCopy[lastAssistantMessageIndex],
          content: originalContent,
          metadata: {
            ...messagesCopy[lastAssistantMessageIndex].metadata,
            hasThinkingBlocks: true,
          },
        };
      }
      // If we don't have original content but we have extracted thinking blocks,
      // ensure content is an array and starts with thinking blocks
      else if (
        thinkingBlocks.length > 0 &&
        typeof messagesCopy[lastAssistantMessageIndex].content === 'string'
      ) {
        // Convert string content to an array with thinking blocks first
        messagesCopy[lastAssistantMessageIndex] = {
          ...messagesCopy[lastAssistantMessageIndex],
          content: [
            ...thinkingBlocks,
            {
              type: 'text',
              text: messagesCopy[lastAssistantMessageIndex].content as string,
            },
          ],
          metadata: {
            ...messagesCopy[lastAssistantMessageIndex].metadata,
            hasThinkingBlocks: true,
          },
        };
      }
    }

    // Create tool result message - important: don't include thinking blocks here
    const toolResultMessage: ForqMessage = {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: toolResult.error
            ? JSON.stringify({ error: toolResult.error })
            : JSON.stringify(toolResult.result || {}),
          ...(toolResult.error ? { is_error: true } : {}),
        },
      ],
    };

    // Add tool result message to the copy
    messagesCopy.push(toolResultMessage);

    // Filter out any messages with empty content before conversion
    const validMessages = messagesCopy.filter((msg) => msg.content || msg.role === 'system');

    // Convert messages with debug enabled
    const anthropicMessages = convertToAnthropicMessages(validMessages, debug);
    const systemPrompt = extractSystemMessage(validMessages);

    // Log the tool result
    logger.logAction('Tool Result', {
      toolUseId,
      result: toolResult.result,
      error: toolResult.error,
      success: toolResult.success,
    });

    // Log the messages being sent to help with debugging
    logger.logAction('Sending Messages to API', {
      messageCount: anthropicMessages.length,
      lastAssistantHasThinking: anthropicMessages.some(
        (msg) =>
          msg.role === 'assistant' &&
          msg.content &&
          Array.isArray(msg.content) &&
          msg.content.some(
            (block) => block.type === 'thinking' || block.type === 'redacted_thinking',
          ),
      ),
    });

    // Build API request parameters
    const requestParams: any = {
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
      stream: true, // Enable streaming to avoid timeout issues
    };

    // If thinking is enabled, set temperature to 1 as required by the API
    if (mergedOptions.thinking?.enabled && mergedOptions.thinking.budgetTokens) {
      requestParams.thinking = {
        type: 'enabled',
        budget_tokens: mergedOptions.thinking.budgetTokens,
      };
      requestParams.temperature = 1; // Must be 1 when thinking is enabled
    } else {
      requestParams.temperature = mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!;
    }

    // Use streaming API and collect the entire response
    const stream = await anthropic.beta.messages.stream(requestParams);

    // Track response data for the final AIResponse
    let fullResponseText = '';
    let stopReason: string | null = null;
    let finalToolCalls: ToolCall[] = [];
    let responseToolUseId: string | undefined = undefined;

    // Process the stream
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const textChunk = chunk.delta.text;
        fullResponseText += textChunk;
      }
    }

    // Get the final message once streaming is complete
    const finalMessage = await stream.finalMessage();
    stopReason = finalMessage.stop_reason;

    // Extract tool calls from final message
    finalToolCalls = extractToolCallsFromResponse(finalMessage);
    responseToolUseId =
      finalToolCalls.length > 0
        ? finalMessage.content.find((c) => c.type === 'tool_use')?.id
        : undefined;

    logger.logConversation(`AI Response after tool result: ${fullResponseText}`);

    return {
      text: fullResponseText,
      toolCalls: finalToolCalls,
      stopReason,
      toolUseId: responseToolUseId,
    };
  } catch (error) {
    logger.logError(error as Error, 'AI Tool Result Error');
    return {
      text: `Error sending tool result to AI: ${(error as Error).message}`,
      toolCalls: [],
      stopReason: 'error',
    };
  }
}
