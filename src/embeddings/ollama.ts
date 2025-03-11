/**
 * Ollama Embeddings Module
 * Handles embedding generation and caching using Ollama's local models
 */

import * as fs from 'fs';
import * as path from 'path';
import { OllamaClient } from '../api/ollama';
import { logger } from '../utils/logger';

interface EmbeddingCache {
  [key: string]: {
    embedding: number[];
    timestamp: number;
  };
}

export class OllamaEmbeddings {
  private client: OllamaClient;
  private cacheFile: string;
  private cache: EmbeddingCache;
  private cacheTTL: number; // Time to live in milliseconds

  constructor(cacheDir: string = '.forq/cache', cacheTTL: number = 24 * 60 * 60 * 1000) {
    this.client = new OllamaClient();
    this.cacheFile = path.join(cacheDir, 'embeddings.json');
    this.cacheTTL = cacheTTL;
    this.cache = this.loadCache();
  }

  /**
   * Load the embedding cache from disk
   */
  private loadCache(): EmbeddingCache {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cacheData = fs.readFileSync(this.cacheFile, 'utf8');
        return JSON.parse(cacheData);
      }
    } catch (error) {
      logger.logError(error as Error, 'Failed to load embedding cache');
    }
    return {};
  }

  /**
   * Save the embedding cache to disk
   */
  private saveCache(): void {
    try {
      const cacheDir = path.dirname(this.cacheFile);
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      logger.logError(error as Error, 'Failed to save embedding cache');
    }
  }

  /**
   * Get cached embedding if available and not expired
   */
  private getCachedEmbedding(text: string): number[] | null {
    const cached = this.cache[text];
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.embedding;
    }
    return null;
  }

  /**
   * Cache an embedding
   */
  private cacheEmbedding(text: string, embedding: number[]): void {
    this.cache[text] = {
      embedding,
      timestamp: Date.now(),
    };
    this.saveCache();
  }

  /**
   * Generate embeddings for a text string
   * Uses cache if available, otherwise generates new embeddings
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cached = this.getCachedEmbedding(text);
    if (cached) {
      return cached;
    }

    // Generate new embedding
    try {
      const embedding = await this.client.createEmbedding(text);
      this.cacheEmbedding(text, embedding);
      return embedding;
    } catch (error) {
      logger.logError(error as Error, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find most similar texts based on embedding similarity
   */
  async findSimilar(query: string, texts: string[], topK: number = 5): Promise<Array<{ text: string; similarity: number }>> {
    const queryEmbedding = await this.generateEmbedding(query);
    const similarities = await Promise.all(
      texts.map(async (text) => {
        const embedding = await this.generateEmbedding(text);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        return { text, similarity };
      })
    );

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
} 