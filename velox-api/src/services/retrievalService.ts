// src/services/retrievalService.ts
//
// 4.1 — Consolidated to use `knowledge_chunks` (Prisma) exclusively.
//        The old `document_chunks` table (raw pg Pool) is retired.
// 4.2 — Similarity threshold raised from 0.3 → 0.7 to cut hallucination noise.

import { PrismaClient, Prisma } from "@prisma/client";
import { EmbeddingService } from "./embeddingService";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

// 4.2 — Minimum cosine similarity to accept a chunk as relevant.
//        0.3 was far too permissive and returned noisy/unrelated content.
const SIMILARITY_THRESHOLD = 0.7;

export class RetrievalService {
  private embeddingService: EmbeddingService;

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Semantic similarity search against `knowledge_chunks` via pgvector.
   *
   * @param query   - Raw user text (will be embedded before search)
   * @param kbId    - Optional knowledge-base ID to scope search to one agent's KB
   * @param limit   - Max chunks to return (default 3)
   * @returns       - Newline-separated chunk content string, or "" if nothing
   *                  passes the similarity threshold
   */
  async search(
    query: string,
    kbId?: string,
    limit: number = 3
  ): Promise<string> {
    try {
      // 1. Embed the user's query
      const queryEmbedding = await this.embeddingService.getEmbedding(query);
      if (!queryEmbedding) {
        logger.warn("Embedding generation returned null — skipping RAG");
        return "";
      }

      const vectorString = `[${queryEmbedding.join(",")}]`;

      // 2. Cosine-similarity search on knowledge_chunks via Prisma $queryRaw.
      //    similarity = 1 - (embedding <=> query_vector)   [pgvector cosine distance]
      //    4.1 — Uses knowledge_chunks, NOT the legacy document_chunks table.
      //    4.2 — Threshold = 0.7 (was 0.3).
      let rows: Array<{ content: string; similarity: number }>;

      if (kbId) {
        rows = await prisma.$queryRaw<Array<{ content: string; similarity: number }>>(
          Prisma.sql`
            SELECT content,
                   1 - (embedding <=> ${vectorString}::vector) AS similarity
            FROM   knowledge_chunks
            WHERE  kb_id = ${kbId}
              AND  1 - (embedding <=> ${vectorString}::vector) > ${SIMILARITY_THRESHOLD}
            ORDER  BY similarity DESC
            LIMIT  ${limit}
          `
        );
      } else {
        // kbId not provided — search all chunks (fallback path)
        rows = await prisma.$queryRaw<Array<{ content: string; similarity: number }>>(
          Prisma.sql`
            SELECT content,
                   1 - (embedding <=> ${vectorString}::vector) AS similarity
            FROM   knowledge_chunks
            WHERE  1 - (embedding <=> ${vectorString}::vector) > ${SIMILARITY_THRESHOLD}
            ORDER  BY similarity DESC
            LIMIT  ${limit}
          `
        );
      }

      if (rows.length === 0) {
        logger.info("No relevant context found (threshold=0.7)");
        return "";
      }

      logger.info(
        { chunks: rows.length, topScore: rows[0].similarity.toFixed(3) },
        "RAG context retrieved"
      );

      // 3. Combine chunks into a single context block for the LLM prompt
      return rows.map((r) => r.content).join("\n---\n");
    } catch (error) {
      logger.error({ error }, "Vector search failed");
      return "";
    }
  }
}
