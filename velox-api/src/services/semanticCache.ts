// src/services/semanticCache.ts
//
// Semantic cache for RAG queries using Redis.
//
// Reference: docs/architecture/05-model-serving.md §5.2
//
// Features:
//   - Query similarity matching using embedding comparison
//   - TTL-based expiration
//   - Per-agent cache isolation
//   - Cache hit/miss metrics

import redis from '../config/redis';
import { logger } from '../utils/logger';
import { EmbeddingService } from './embeddingService';

interface CacheEntry {
  query: string;
  embedding: number[];
  response: string;
  model: string;
  retrievalContext: string[];
  timestamp: number;
}

interface CacheConfig {
  ttlSeconds: number;
  similarityThreshold: number;
  maxCacheSize: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  ttlSeconds: 3600, // 1 hour
  similarityThreshold: 0.92, // High similarity required for cache hit
  maxCacheSize: 1000, // Max entries per agent
  enabled: true,
};

export class SemanticCache {
  private config: CacheConfig;
  private embeddingService: EmbeddingService;
  private cachePrefix = 'semantic_cache';

  // Metrics
  private hits = 0;
  private misses = 0;

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Get cached response if a similar query exists.
   */
  async get(
    agentId: string,
    query: string
  ): Promise<{ response: string; model: string; context: string[] } | null> {
    if (!this.config.enabled) return null;

    try {
      const queryEmbedding = await this.embeddingService.embed(query);
      const cacheKey = this.getCacheKey(agentId);

      // Get all cached entries for this agent
      const entries = await this.getCacheEntries(cacheKey);

      if (entries.length === 0) {
        this.misses++;
        return null;
      }

      // Find most similar entry above threshold
      let bestMatch: CacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of entries) {
        const similarity = this.cosineSimilarity(queryEmbedding, entry.embedding);
        if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        this.hits++;
        logger.info(
          { agentId, similarity: bestSimilarity.toFixed(3), cachedQuery: bestMatch.query.slice(0, 50) },
          'Semantic cache hit'
        );
        return {
          response: bestMatch.response,
          model: `${bestMatch.model} (cached)`,
          context: bestMatch.retrievalContext,
        };
      }

      this.misses++;
      return null;
    } catch (error) {
      logger.error({ error }, 'Semantic cache get error');
      this.misses++;
      return null;
    }
  }

  /**
   * Store a query-response pair in the cache.
   */
  async set(
    agentId: string,
    query: string,
    response: string,
    model: string,
    retrievalContext: string[] = []
  ): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const embedding = await this.embeddingService.embed(query);
      const cacheKey = this.getCacheKey(agentId);

      const entry: CacheEntry = {
        query,
        embedding,
        response,
        model,
        retrievalContext,
        timestamp: Date.now(),
      };

      // Get existing entries
      const entries = await this.getCacheEntries(cacheKey);

      // Check for very similar existing entry (avoid duplicates)
      for (const existing of entries) {
        const similarity = this.cosineSimilarity(embedding, existing.embedding);
        if (similarity > 0.98) {
          // Update existing entry instead of adding new
          existing.response = response;
          existing.timestamp = Date.now();
          await this.saveCacheEntries(cacheKey, entries);
          return;
        }
      }

      // Add new entry
      entries.push(entry);

      // Enforce max size (remove oldest entries)
      if (entries.length > this.config.maxCacheSize) {
        entries.sort((a, b) => b.timestamp - a.timestamp);
        entries.length = this.config.maxCacheSize;
      }

      await this.saveCacheEntries(cacheKey, entries);

      logger.debug({ agentId, query: query.slice(0, 50) }, 'Semantic cache set');
    } catch (error) {
      logger.error({ error }, 'Semantic cache set error');
    }
  }

  /**
   * Invalidate cache for an agent.
   */
  async invalidate(agentId: string): Promise<void> {
    const cacheKey = this.getCacheKey(agentId);
    await redis.del(cacheKey);
    logger.info({ agentId }, 'Semantic cache invalidated');
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getCacheKey(agentId: string): string {
    return `${this.cachePrefix}:${agentId}`;
  }

  private async getCacheEntries(cacheKey: string): Promise<CacheEntry[]> {
    const data = await redis.get(cacheKey);
    if (!data) return [];
    try {
      return JSON.parse(data) as CacheEntry[];
    } catch {
      return [];
    }
  }

  private async saveCacheEntries(cacheKey: string, entries: CacheEntry[]): Promise<void> {
    await redis.set(cacheKey, JSON.stringify(entries), 'EX', this.config.ttlSeconds);
  }

  /**
   * Calculate cosine similarity between two vectors.
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

export const semanticCache = new SemanticCache();
