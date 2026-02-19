// src/services/promptService.ts
//
// 5.2 — LangSmith prompt versioning.
//
// Moves hardcoded system prompts out of llmService.ts into the LangSmith
// Prompt Hub so the team can version, A/B-test, and roll back prompts
// without deploying code.
//
// Design:
//   - Prompts are pulled from LangSmith Hub at first call.
//   - Results are cached for CACHE_TTL_MS (5 minutes) to avoid rate-limit
//     hammering and to keep cold-start latency low.
//   - If LangSmith is unreachable (or LANGSMITH_API_KEY is missing), the
//     service falls back gracefully to the DEFAULT_PROMPTS defined below.

import { Client as LangSmithClient } from "langsmith";
import { logger } from "../utils/logger";

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

// ─── Default (fallback) prompts ───────────────────────────────────────────────
// These are used when LangSmith is unavailable or LANGSMITH_API_KEY is not set.
// They should mirror the latest production prompts committed to the Hub.

const DEFAULT_PROMPTS: Record<string, string> = {
  "velox-voice-system": `You are Velox, a professional AI voice assistant.
Tone: Friendly, concise, professional.
Constraint: Keep answers under two sentences — responses will be spoken aloud.
Do not use markdown, bullet points, or formatting.
If you need to use a tool, do it silently.`,

  "velox-voice-rag": `You are Velox, a professional AI voice assistant.
Use the following knowledge-base excerpts to answer the user's question accurately.
Keep the answer under two sentences. Do not mention the source documents.

=== KNOWLEDGE BASE ===
{{context}}
======================`,
};

// ─── Prompt cache ─────────────────────────────────────────────────────────────

interface CacheEntry {
  prompt: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

// ─── LangSmith client (lazy init) ─────────────────────────────────────────────

let _client: LangSmithClient | null = null;

function getClient(): LangSmithClient | null {
  if (_client) return _client;
  const apiKey = process.env.LANGSMITH_API_KEY;
  if (!apiKey) {
    logger.warn("LANGSMITH_API_KEY not set — using default prompts");
    return null;
  }
  _client = new LangSmithClient({ apiKey });
  return _client;
}

// ─── PromptService ────────────────────────────────────────────────────────────

export class PromptService {
  /**
   * Pull a prompt from LangSmith Hub (with 5-minute in-memory cache).
   * Falls back to DEFAULT_PROMPTS on any error.
   *
   * @param promptName - LangSmith Hub prompt name (e.g. "velox-voice-system")
   * @param vars       - Optional template variables to interpolate into the prompt
   */
  async getPrompt(
    promptName: string,
    vars?: Record<string, string>
  ): Promise<string> {
    // 1. Check cache
    const cached = cache.get(promptName);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return this.interpolate(cached.prompt, vars);
    }

    // 2. Try fetching from LangSmith Hub
    const client = getClient();
    if (client) {
      try {
        const promptObj = await (client as any).pullPrompt(promptName);
        // LangSmith returns a PromptTemplate; extract the first human message
        const promptStr: string =
          typeof promptObj === "string"
            ? promptObj
            : (promptObj?.messages?.[0]?.prompt?.template as string | undefined) ??
              promptObj?.template ??
              JSON.stringify(promptObj);

        cache.set(promptName, { prompt: promptStr, fetchedAt: Date.now() });
        logger.info({ promptName }, "Prompt pulled from LangSmith Hub");
        return this.interpolate(promptStr, vars);
      } catch (err: any) {
        logger.warn(
          { promptName, err: err.message },
          "LangSmith pull failed — using default"
        );
      }
    }

    // 3. Fall back to defaults
    const fallback = DEFAULT_PROMPTS[promptName];
    if (fallback) {
      // Cache the fallback so we don't log the warning every call
      cache.set(promptName, { prompt: fallback, fetchedAt: Date.now() });
      return this.interpolate(fallback, vars);
    }

    logger.error({ promptName }, "No default prompt found — returning empty string");
    return "";
  }

  /**
   * Replace {{variable}} placeholders in a prompt template.
   */
  private interpolate(template: string, vars?: Record<string, string>): string {
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (t, [k, v]) => t.split(`{{${k}}}`).join(v),
      template
    );
  }

  /** Invalidate the cache for a specific prompt (useful in tests). */
  invalidate(promptName: string) {
    cache.delete(promptName);
  }

  /** Invalidate all cached prompts. */
  invalidateAll() {
    cache.clear();
  }
}

export const promptService = new PromptService();
