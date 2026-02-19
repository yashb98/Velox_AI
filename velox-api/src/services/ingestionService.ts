// src/services/ingestionService.ts
//
// 4.4 — Two new capabilities added to this service:
//   (a) SHA-256 content_hash deduplication — each chunk is hashed before
//       INSERT; if the same content_hash already exists for this kb_id the
//       chunk is skipped, preventing duplicate embeddings from re-ingestion.
//   (b) HNSW index bootstrap — `ensureHnswIndex()` is called once per KB
//       to create the pgvector HNSW index if it doesn't already exist,
//       giving O(log n) approximate-nearest-neighbour lookups vs O(n) ivfflat.

import crypto from "crypto";
import { PrismaClient, Prisma } from "@prisma/client";
import { embeddingService } from "./embeddingService";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

interface ChunkMetadata {
  source?: string;
  page?: number;
  section?: string;
  [key: string]: any;
}

// ─── HNSW index management ───────────────────────────────────────────────────

/**
 * 4.4 — Ensures an HNSW index exists on knowledge_chunks.embedding.
 * Uses CREATE INDEX IF NOT EXISTS so it's safe to call repeatedly.
 * HNSW gives ~10× faster ANN search vs the default ivfflat for this
 * embedding dimension (768). m=16, ef_construction=64 are production defaults.
 */
async function ensureHnswIndex(): Promise<void> {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw
        ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `
    );
    logger.info("HNSW index ensured on knowledge_chunks.embedding");
  } catch (err: any) {
    // Non-fatal: the index may already exist or the pgvector version may not
    // support HNSW yet. Search still works via the existing GiST/ivfflat index.
    logger.warn({ err: err.message }, "HNSW index creation skipped (non-fatal)");
  }
}

// ─── SHA-256 helper ──────────────────────────────────────────────────────────

/**
 * 4.4 — Returns the hex SHA-256 hash of the chunk text.
 * Used as a deduplication key: same text → same hash → skip INSERT.
 */
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// ─── IngestionService ────────────────────────────────────────────────────────

export class IngestionService {
  /**
   * Split text into overlapping chunks.
   */
  private splitIntoChunks(
    text: string,
    chunkSize = 512,
    overlap = 50
  ): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      if (chunk.length > 0) chunks.push(chunk);
      start = end - overlap;
    }
    return chunks;
  }

  /**
   * Ingest a single document into the knowledge base.
   *
   * 4.4 Changes:
   *   - Each chunk is SHA-256 hashed; existing hashes are skipped (dedup).
   *   - `ensureHnswIndex()` is called once before the first INSERT so the
   *     index is always present when data arrives.
   *   - INSERT now writes content_hash to the knowledge_chunks row.
   */
  async ingestDocument(
    kbId: string,
    content: string,
    metadata: ChunkMetadata = {}
  ): Promise<{ success: boolean; chunksCreated: number; chunksSkipped: number }> {
    try {
      logger.info(`Starting ingestion for KB: ${kbId}`);

      const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } });
      if (!kb) throw new Error("Knowledge base not found");

      const chunks = this.splitIntoChunks(content, kb.chunk_size, kb.chunk_overlap);
      logger.info(`Split into ${chunks.length} chunks`);

      // 4.4 — Ensure HNSW index exists before inserting new vectors
      await ensureHnswIndex();

      const embeddings = await embeddingService.getEmbeddings(chunks);

      let successCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
        const embedding = embeddings[i];
        if (!embedding) {
          logger.warn(`Skipping chunk ${i + 1} (embedding failed)`);
          continue;
        }

        // 4.4 — Compute SHA-256 hash for deduplication
        const contentHash = sha256(chunks[i]);

        // Check if this chunk already exists in this KB (dedup guard)
        const existing = await prisma.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            SELECT id FROM knowledge_chunks
            WHERE  kb_id        = ${kbId}
              AND  content_hash = ${contentHash}
            LIMIT  1
          `
        );

        if (existing.length > 0) {
          logger.debug(`Chunk ${i + 1} already exists (content_hash match) — skipping`);
          skippedCount++;
          continue;
        }

        const embeddingStr = `[${embedding.join(",")}]`;

        // 4.4 — Store content_hash in the INSERT so the @@index([content_hash])
        //        index in schema.prisma is populated and future dedup is fast.
        await prisma.$executeRaw(
          Prisma.sql`
            INSERT INTO knowledge_chunks
              (id, content, content_hash, embedding, metadata, kb_id, created_at, updated_at)
            VALUES (
              gen_random_uuid(),
              ${chunks[i]},
              ${contentHash},
              ${embeddingStr}::vector,
              ${JSON.stringify(metadata)}::jsonb,
              ${kbId},
              NOW(),
              NOW()
            )
          `
        );

        successCount++;
      }

      logger.info(
        { created: successCount, skipped: skippedCount, total: chunks.length },
        "Ingestion complete"
      );

      return { success: true, chunksCreated: successCount, chunksSkipped: skippedCount };
    } catch (error: any) {
      logger.error({ error: error.message }, "Ingestion failed");
      return { success: false, chunksCreated: 0, chunksSkipped: 0 };
    }
  }

  /**
   * Ingest multiple documents in batch.
   */
  async ingestDocuments(
    kbId: string,
    documents: Array<{ content: string; metadata?: ChunkMetadata }>
  ): Promise<{ success: boolean; totalChunks: number; totalSkipped: number }> {
    try {
      let totalChunks = 0;
      let totalSkipped = 0;

      for (const doc of documents) {
        const result = await this.ingestDocument(kbId, doc.content, doc.metadata);
        totalChunks += result.chunksCreated;
        totalSkipped += result.chunksSkipped;
      }

      return { success: true, totalChunks, totalSkipped };
    } catch (error: any) {
      logger.error({ error: error.message }, "Batch ingestion failed");
      return { success: false, totalChunks: 0, totalSkipped: 0 };
    }
  }
}

export const ingestionService = new IngestionService();
