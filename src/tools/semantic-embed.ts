/**
 * Tool for creating semantic embeddings from text
 * This stub function is the basis for more advanced semantic search operations
 */

import { Tool, ToolContext, ToolParameters } from '../types/tools';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

// Load environment variables (including OPENAI_API_KEY)
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Converts text into embedding vectors using OpenAI's embedding API
 * In a production setting, this could be replaced with a local model
 *
 * @param text The text to embed
 * @returns A promise resolving to an array of floating point values (embedding vector)
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error('Error creating embedding:', error);
    throw new Error(
      `Failed to create embedding: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The semanticEmbed tool implementation
 */
export const tool: Tool = {
  name: 'semanticEmbed',
  description:
    'Converts input text into a semantic embedding vector. This is used for semantic analysis and comparison of code or text.',
  parameterSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'The text to be converted into an embedding vector for semantic analysis.',
      },
    },
    required: ['text'],
  },
  requiresPermission: false,
  execute: async (parameters: ToolParameters, context: ToolContext): Promise<any> => {
    const { text } = parameters;

    context.logger.logAction('Semantic Embed', {
      text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
    });

    try {
      const embedding = await createEmbedding(text);

      return {
        text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        vector: embedding,
        dimensions: embedding.length,
      };
    } catch (error) {
      context.logger.logError(error as Error, 'Failed to create embedding');
      throw error;
    }
  },
};
