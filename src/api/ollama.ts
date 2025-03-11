/**
 * Ollama API Client
 * Handles communication with local Ollama instance
 */

import axios from 'axios';
import { getConfig } from '../utils/config';
import { logger } from '../utils/logger';

interface OllamaConfig {
  host: string;
  port: number;
  model: string;
  embeddingModel: string;
  maxTokens: number;
  temperature: number;
  contextWindow: number;
  systemPrompt: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
  eval_count?: number;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaModelInfo {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

export class OllamaClient {
  private config: OllamaConfig;
  private baseURL: string;

  constructor() {
    const config = getConfig();
    if (!config.api?.ollama) {
      throw new Error('Ollama configuration is missing');
    }

    this.config = {
      host: config.api.ollama.host || 'http://localhost',
      port: config.api.ollama.port || 11434,
      model: config.api.ollama.model || 'llama3.1',
      embeddingModel: config.api.ollama.embeddingModel || 'snowflake-arctic-embed2',
      maxTokens: config.api.ollama.maxTokens || 4096,
      temperature: config.api.ollama.temperature || 0.7,
      contextWindow: config.api.ollama.contextWindow || 8192,
      systemPrompt: config.api.ollama.systemPrompt || 'You are a helpful AI assistant.',
    };

    this.baseURL = `${this.config.host}:${this.config.port}`;
  }

  /**
   * Check if Ollama server is running
   */
  async ping(): Promise<boolean> {
    try {
      await axios.get(`${this.baseURL}/api/version`);
      return true;
    } catch (error) {
      logger.logError(error as Error, 'Failed to ping Ollama server');
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<OllamaModelInfo[]> {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`);
      return (response.data as { models: OllamaModelInfo[] }).models;
    } catch (error) {
      logger.logError(error as Error, 'Failed to list Ollama models');
      throw error;
    }
  }

  /**
   * Create a completion using the configured model
   */
  async createCompletion(prompt: string, context?: number[]): Promise<OllamaResponse> {
    try {
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: this.config.model,
        prompt,
        context,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
        system: this.config.systemPrompt,
      });
      return response.data as OllamaResponse;
    } catch (error) {
      logger.logError(error as Error, 'Failed to create Ollama completion');
      throw error;
    }
  }

  /**
   * Create embeddings using the configured embedding model
   */
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const response = await axios.post(`${this.baseURL}/api/embeddings`, {
        model: this.config.embeddingModel,
        prompt: text,
      });
      return (response.data as OllamaEmbeddingResponse).embedding;
    } catch (error) {
      logger.logError(error as Error, 'Failed to create Ollama embedding');
      throw error;
    }
  }

  /**
   * Check if a model is available locally
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const models = await this.listModels();
      return models.some(model => model.name === modelName);
    } catch (error) {
      logger.logError(error as Error, `Failed to check if model ${modelName} is available`);
      return false;
    }
  }

  /**
   * Pull a model from Ollama if not available locally
   */
  async pullModel(modelName: string): Promise<void> {
    try {
      await axios.post(`${this.baseURL}/api/pull`, {
        name: modelName,
      });
      logger.logAction('Ollama', { status: `Successfully pulled model ${modelName}` });
    } catch (error) {
      logger.logError(error as Error, `Failed to pull model ${modelName}`);
      throw error;
    }
  }
} 