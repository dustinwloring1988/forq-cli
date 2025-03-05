/**
 * AI API Integration
 * Handles interactions with the Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { Message as ForqMessage } from '../types/messages';
import { logger } from '../utils/logger';
import { getToolsSchema } from '../tools';
import { ToolCall, ToolResult } from '../types/tools';

// Load environment variables
dotenv.config();

// Validate API key
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error('Error: ANTHROPIC_API_KEY environment variable is not set');
  process.exit(1);
}

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey,
});

/**
 * Configuration options for AI requests
 */
export interface AIOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Default AI configuration
 */
const DEFAULT_AI_OPTIONS: AIOptions = {
  model: 'claude-3-opus-20240229',
  maxTokens: 4000,
  temperature: 0.7,
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
  return systemMessage?.content;
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
 * Response object that includes both text and tool calls
 */
export interface AIResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
  toolUseId?: string;
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

    const response = await anthropic.messages.create({
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      temperature: mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
    });

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

    const response = await anthropic.messages.create({
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      temperature: mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
    });

    // For tool calls, we need the complete response which doesn't work well with streaming
    // Extract text content
    const responseText = response.content
      .map((c) => {
        if (c.type === 'text') {
          return c.text;
        }
        return '';
      })
      .join('');

    // Send chunks of text to the callback
    // This simulates streaming for compatibility
    const chunkSize = 10;
    for (let i = 0; i < responseText.length; i += chunkSize) {
      const chunk = responseText.substring(i, i + chunkSize);
      onChunk(chunk);
      // Small delay to simulate streaming
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Extract tool calls
    const toolCalls = extractToolCallsFromResponse(response);

    logger.logConversation(`AI Response: ${responseText}`);

    const aiResponse: AIResponse = {
      text: responseText,
      toolCalls,
      stopReason: response.stop_reason,
      toolUseId:
        toolCalls.length > 0 ? response.content.find((c) => c.type === 'tool_use')?.id : undefined,
    };

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
    // Enable debug mode to troubleshoot message conversion
    const debug = true;

    // Filter out any messages with empty content before conversion
    const validMessages = messages.filter((msg) => msg.content || msg.role === 'system');

    // Convert messages with debug enabled
    const anthropicMessages = convertToAnthropicMessages(validMessages, debug);
    const systemPrompt = extractSystemMessage(validMessages);

    // Merge default options with provided options
    const mergedOptions = {
      ...DEFAULT_AI_OPTIONS,
      ...options,
    };

    // Create tool result message
    const toolResultMessage = {
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
      lastMessage: JSON.stringify(anthropicMessages[anthropicMessages.length - 1]),
      hasToolUse: anthropicMessages.some(
        (msg) =>
          msg.content &&
          Array.isArray(msg.content) &&
          msg.content.some((block) => block.type === 'tool_use'),
      ),
    });

    // Add the tool result message to the conversation
    anthropicMessages.push(toolResultMessage as any);

    // Send to Anthropic API
    const response = await anthropic.messages.create({
      model: mergedOptions.model || DEFAULT_AI_OPTIONS.model!,
      max_tokens: mergedOptions.maxTokens || DEFAULT_AI_OPTIONS.maxTokens!,
      temperature: mergedOptions.temperature || DEFAULT_AI_OPTIONS.temperature!,
      messages: anthropicMessages,
      system: systemPrompt,
      tools: convertToAnthropicTools(getToolsSchema()),
    });

    // Extract text content
    const responseText = response.content
      .map((c) => {
        if (c.type === 'text') {
          return c.text;
        }
        return '';
      })
      .join('');

    // Extract tool calls
    const toolCalls = extractToolCallsFromResponse(response);

    logger.logConversation(`AI Response after tool result: ${responseText}`);
    return {
      text: responseText,
      toolCalls,
      stopReason: response.stop_reason,
      toolUseId:
        toolCalls.length > 0 ? response.content.find((c) => c.type === 'tool_use')?.id : undefined,
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
