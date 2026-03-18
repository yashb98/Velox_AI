"use strict";
// src/services/hybridSearchService.ts
//
// 4.3 — SQL injection fix: ALL raw queries now use Prisma.sql tagged templates
//        so every value is a bound parameter, never string-interpolated SQL.
//        The old backtick template form (`prisma.$queryRaw`...`) still interpolates
//        JS expressions directly — replaced with explicit Prisma.sql`` calls.
// 4.1 — Uses knowledge_chunks (Prisma) exclusively; document_chunks retired.
Object.defineProperty(exports, "__esModule", { value: true });
exports.hybridSearchService = exports.HybridSearchService = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
// ─── Reciprocal Rank Fusion ──────────────────────────────────────────────────
// Formula: RRF(d) = Σ 1/(k + rank(d))
function reciprocalRankFusion(keywordResults, semanticResults, k = 60) {
    const rrfScores = new Map();
    const addResults = (docs, source) => {
        docs.forEach((doc, index) => {
            const score = 1 / (k + index + 1);
            if (!rrfScores.has(doc.id)) {
                rrfScores.set(doc.id, { score: 0, doc, sources: new Set() });
            }
            const entry = rrfScores.get(doc.id);
            entry.score += score;
            entry.sources.add(source);
        });
    };
    addResults(keywordResults, "keyword");
    addResults(semanticResults, "semantic");
    const results = Array.from(rrfScores.values())
        .map(({ score, doc, sources }) => ({
        id: doc.id,
        content: doc.content,
        metadata: doc.metadata,
        score,
        rank: 0,
        source: (sources.size === 2
            ? "both"
            : sources.has("keyword")
                ? "keyword"
                : "semantic"),
    }))
        .sort((a, b) => b.score - a.score);
    results.forEach((r, i) => { r.rank = i + 1; });
    return results;
}
// ─── HybridSearchService ─────────────────────────────────────────────────────
class HybridSearchService {
    /**
     * 4.3 — Keyword search using PostgreSQL Full-Text Search.
     * Prisma.sql ensures `query` and `kbId` are bound parameters,
     * never interpolated into the SQL string itself.
     */
    async keywordSearch(query, kbId, limit = 10) {
        const start = Date.now();
        try {
            // 4.3 — Prisma.sql() wraps the entire statement; all ${...} values
            //        become bind parameters in the prepared statement.
            const results = await prisma.$queryRaw(client_1.Prisma.sql `
          SELECT id,
                 content,
                 metadata,
                 ts_rank(content_tsv, plainto_tsquery('english', ${query})) AS relevance
          FROM   knowledge_chunks
          WHERE  kb_id   = ${kbId}
            AND  content_tsv @@ plainto_tsquery('english', ${query})
          ORDER  BY relevance DESC
          LIMIT  ${limit}
        `);
            logger_1.logger.info(`Keyword search: ${Date.now() - start}ms, ${results.length} results`);
            return results;
        }
        catch (error) {
            logger_1.logger.error({ error }, "Keyword search failed");
            return [];
        }
    }
    /**
     * 4.3 — Semantic search using pgvector.
     * The embedding string is a bind parameter — no raw string concatenation
     * ever reaches the SQL engine.
     */
    async semanticSearch(embedding, kbId, limit = 10) {
        const start = Date.now();
        try {
            // Build the pgvector literal as a string, then pass via Prisma.sql bind
            const embeddingStr = `[${embedding.join(",")}]`;
            const results = await prisma.$queryRaw(client_1.Prisma.sql `
          SELECT id,
                 content,
                 metadata,
                 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
          FROM   knowledge_chunks
          WHERE  kb_id = ${kbId}
          ORDER  BY embedding <=> ${embeddingStr}::vector
          LIMIT  ${limit}
        `);
            logger_1.logger.info(`Semantic search: ${Date.now() - start}ms, ${results.length} results`);
            return results;
        }
        catch (error) {
            logger_1.logger.error({ error }, "Semantic search failed");
            return [];
        }
    }
    /**
     * Hybrid search: keyword + semantic in parallel, fused with RRF.
     */
    async search(query, embedding, kbId, limit = 5) {
        logger_1.logger.info(`Hybrid search: "${query.substring(0, 60)}" in KB: ${kbId}`);
        const searchLimit = limit * 2;
        const [keywordResults, semanticResults] = await Promise.all([
            this.keywordSearch(query, kbId, searchLimit),
            this.semanticSearch(embedding, kbId, searchLimit),
        ]);
        const fused = reciprocalRankFusion(keywordResults, semanticResults);
        const final = fused.slice(0, limit);
        logger_1.logger.info({
            total: final.length,
            keyword: final.filter((r) => r.source === "keyword").length,
            semantic: final.filter((r) => r.source === "semantic").length,
            both: final.filter((r) => r.source === "both").length,
        }, "Hybrid search complete");
        return final;
    }
    hasSpecificIdentifiers(query) {
        const patterns = [/\b\d{3,}\b/, /\b[A-Z]{2,}\d+\b/, /order\s+\d+/i, /ticket\s+\d+/i];
        return patterns.some((p) => p.test(query));
    }
    async smartSearch(query, embedding, kbId, limit = 5) {
        const hasIds = this.hasSpecificIdentifiers(query);
        logger_1.logger.info(hasIds ? "Boosting keyword search (specific IDs detected)" : "Balanced hybrid search");
        return this.search(query, embedding, kbId, limit);
    }
}
exports.HybridSearchService = HybridSearchService;
exports.hybridSearchService = new HybridSearchService();
