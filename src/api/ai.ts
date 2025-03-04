/**
 * AI API Integration
 * Handles interactions with the Anthropic API
 */

import Anthropic from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';
import { Message as ForqMessage } from '../types/messages';
import { logger } from '../utils/logger';

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
 * Convert our internal message format to Anthropic's format
 */
function convertToAnthropicMessages(messages: ForqMessage[]): Anthropic.MessageParam[] {
  return messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));
}

/**
 * Extract system message from messages array
 */
function extractSystemMessage(messages: ForqMessage[]): string | undefined {
  const systemMessage = messages.find((msg) => msg.role === 'system');
  return systemMessage?.content;
}

/**
 * Query the AI with a series of messages
 * @param messages Array of messages to send to the AI
 * @returns Promise resolving to the AI's response text
 */
export async function queryAI(messages: ForqMessage[]): Promise<string> {
  try {
    const anthropicMessages = convertToAnthropicMessages(messages);
    const systemPrompt = extractSystemMessage(messages);

    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 4000,
      messages: anthropicMessages,
      system: systemPrompt,
    });

    const responseText = response.content
      .map((c) => {
        if (c.type === 'text') {
          return c.text;
        }
        return '';
      })
      .join('');

    logger.logConversation(`AI Response: ${responseText}`);
    return responseText;
  } catch (error) {
    logger.logError(error as Error, 'AI API Error');
    return `Error communicating with AI: ${(error as Error).message}`;
  }
}

/**
 * Stream the AI's response to a callback function
 * @param messages Array of messages to send to the AI
 * @param onChunk Callback function to process each chunk of the response
 * @param onComplete Callback function called when the response is complete
 */
export async function streamAI(
  messages: ForqMessage[],
  onChunk: (text: string) => void,
  onComplete?: (fullText: string) => void,
): Promise<void> {
  try {
    const anthropicMessages = convertToAnthropicMessages(messages);
    const systemPrompt = extractSystemMessage(messages);

    const stream = await anthropic.messages.create({
      model: 'claude-3-7-sonnet-20250219',
      max_tokens: 8192,
      messages: anthropicMessages,
      system: systemPrompt,
      stream: true,
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta' &&
        chunk.delta.text
      ) {
        const text = chunk.delta.text;
        fullResponse += text;
        onChunk(text);
      }
    }

    logger.logConversation(`AI Response (streamed): ${fullResponse}`);

    if (onComplete) {
      onComplete(fullResponse);
    }
  } catch (error) {
    logger.logError(error as Error, 'AI Streaming Error');
    onChunk(`Error streaming from AI: ${(error as Error).message}`);
  }
}
