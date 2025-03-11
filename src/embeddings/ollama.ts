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

interface PerformanceMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  averageResponseTime: number;
  totalResponseTime: number;
}

export class OllamaEmbeddings {
  private client: OllamaClient;
  private cacheFile: string;
  private cache: EmbeddingCache;
  private cacheTTL: number; // Time to live in milliseconds
  private metrics: PerformanceMetrics;
  private batchSize: number;

  constructor(cacheDir: string = '.forq/cache', cacheTTL: number = 24 * 60 * 60 * 1000, batchSize: number = 5) {
    this.client = new OllamaClient();
    this.cacheFile = path.join(cacheDir, 'embeddings.json');
    this.cacheTTL = cacheTTL;
    this.batchSize = batchSize;
    this.cache = this.loadCache();
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageResponseTime: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
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
      this.metrics.cacheHits++;
      return cached.embedding;
    }
    this.metrics.cacheMisses++;
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
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    // Check cache first
    const cached = this.getCachedEmbedding(text);
    if (cached) {
      return cached;
    }

    // Generate new embedding
    try {
      const embedding = await this.client.createEmbedding(text);
      this.cacheEmbedding(text, embedding);
      
      // Update metrics
      const responseTime = Date.now() - startTime;
      this.metrics.totalResponseTime += responseTime;
      this.metrics.averageResponseTime = this.metrics.totalResponseTime / this.metrics.totalRequests;
      
      return embedding;
    } catch (error) {
      logger.logError(error as Error, 'Failed to generate embedding');
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple text strings in batch
   * Uses parallel processing with a controlled batch size
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    // Process in batches to avoid overwhelming the Ollama server
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.generateEmbedding(text))
      );
      results.push(...batchResults);
    }
    return results;
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
   * Public method to calculate vector similarity between two embedding vectors
   */
  calculateVectorSimilarity(vectorA: number[], vectorB: number[]): number {
    return this.cosineSimilarity(vectorA, vectorB);
  }

  /**
   * Find most similar texts based on embedding similarity
   * Optimized version that processes embeddings in batches
   */
  async findSimilar(query: string, texts: string[], topK: number = 5): Promise<Array<{ text: string; similarity: number }>> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Process text embeddings in batches
    const similarities: Array<{ text: string; similarity: number }> = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize);
      const batchEmbeddings = await this.generateEmbeddingsBatch(batch);
      
      for (let j = 0; j < batch.length; j++) {
        const similarity = this.cosineSimilarity(queryEmbedding, batchEmbeddings[j]);
        similarities.push({ text: batch[j], similarity });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
} 