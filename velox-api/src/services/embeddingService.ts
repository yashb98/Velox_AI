// src/services/embeddingService.ts
//
// Embedding service for RAG vector search.
// Uses OpenAI-compatible embedding API (works with OpenAI, Kimi, or local models).

import { logger } from "../utils/logger";

// OpenAI-compatible embedding response
interface EmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export class EmbeddingService {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor() {
    // Use OpenAI by default, can be overridden with env vars
    this.baseUrl = process.env.EMBEDDING_API_URL || process.env.OPENAI_API_URL || "https://api.openai.com/v1";
    this.apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "";
    this.model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  }

  async getEmbedding(text: string): Promise<number[] | null> {
    try {
      if (!text || text.trim().length === 0) {
        logger.warn("Empty text provided for embedding");
        return null;
      }

      if (!this.apiKey) {
        logger.warn("No embedding API key configured, skipping embedding generation");
        return null;
      }

      // Truncate very long texts to avoid token limits
      const maxLength = 8000;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) : text;

      if (text.length > maxLength) {
        logger.warn(`Text truncated from ${text.length} to ${maxLength} characters`);
      }

      logger.debug(`Generating embedding for text (${truncatedText.length} chars)...`);

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: truncatedText,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Embedding API error: ${response.status} - ${errorText}`);
        return null;
      }

      const result = (await response.json()) as EmbeddingResponse;

      if (!result.data || !result.data[0]?.embedding) {
        logger.error("Invalid embedding response structure");
        return null;
      }

      const embedding = result.data[0].embedding;
      logger.debug(`Generated embedding: ${embedding.length} dimensions`);
      return embedding;

    } catch (error: any) {
      logger.error({ error: error.message }, "Error generating embedding");
      return null;
    }
  }

  /**
   * Generate embeddings for multiple texts.
   * Processes sequentially with delay to avoid rate limits.
   */
  async getEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    try {
      const embeddings: (number[] | null)[] = [];

      logger.info(`Generating ${texts.length} embeddings...`);

      for (let i = 0; i < texts.length; i++) {
        const embedding = await this.getEmbedding(texts[i]);
        embeddings.push(embedding);

        // Add small delay to prevent rate limiting
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const successCount = embeddings.filter(e => e !== null).length;
      logger.info(`Generated ${successCount}/${texts.length} embeddings`);

      return embeddings;

    } catch (error: any) {
      logger.error({ error: error.message }, "Error generating batch embeddings");
      return texts.map(() => null);
    }
  }

  /**
   * Generate embeddings in batch (more efficient for OpenAI API).
   * Falls back to sequential if batch fails.
   */
  async getBatchEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    if (!this.apiKey) {
      logger.warn("No embedding API key configured");
      return texts.map(() => null);
    }

    try {
      // Filter and truncate texts
      const maxLength = 8000;
      const processedTexts = texts.map(t =>
        t && t.length > maxLength ? t.substring(0, maxLength) : t || ""
      );

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: processedTexts,
        }),
      });

      if (!response.ok) {
        logger.warn("Batch embedding failed, falling back to sequential");
        return this.getEmbeddings(texts);
      }

      const result = (await response.json()) as EmbeddingResponse;

      if (!result.data) {
        return this.getEmbeddings(texts);
      }

      // Sort by index and extract embeddings
      const sortedData = result.data.sort((a, b) => a.index - b.index);
      return sortedData.map(d => d.embedding || null);

    } catch (error: any) {
      logger.error({ error: error.message }, "Batch embedding error, falling back to sequential");
      return this.getEmbeddings(texts);
    }
  }
}

export const embeddingService = new EmbeddingService();
