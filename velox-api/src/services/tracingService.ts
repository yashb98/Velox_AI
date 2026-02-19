// src/services/tracingService.ts
//
// 5.1 — LangFuse observability integration.
//
// Wraps each call through the voice pipeline in a LangFuse trace with
// dedicated spans for every stage:
//   STT  → Deepgram transcription latency
//   RAG  → vector-search retrieval time + chunk count
//   LLM  → model chosen, token usage, first-token latency
//   Tool → individual tool-call execution
//   TTS  → synthesis latency + provider (Deepgram/ElevenLabs)
//
// Usage in orchestrator:
//   const trace = tracingService.startTrace(callSid, agentId, conversationId);
//   const sttSpan = trace.startSpan("stt");
//   sttSpan.end({ transcript });
//   trace.end();

import { Langfuse, LangfuseTraceClient, LangfuseSpanClient } from "langfuse";
import { logger } from "../utils/logger";

// Langfuse is initialised lazily (first call) so missing env vars in dev
// don't crash the server — tracing simply becomes a no-op.
let _langfuse: Langfuse | null = null;

function getLangfuse(): Langfuse | null {
  if (_langfuse) return _langfuse;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl   = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";

  if (!publicKey || !secretKey) {
    // Tracing disabled — warn once then stay silent
    logger.warn("LangFuse env vars missing (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY) — tracing disabled");
    return null;
  }

  _langfuse = new Langfuse({ publicKey, secretKey, baseUrl, flushAt: 10, flushInterval: 5000 });
  logger.info("LangFuse tracing enabled");
  return _langfuse;
}

// ─── CallTrace ───────────────────────────────────────────────────────────────

/**
 * Thin wrapper around a LangFuse trace for one voice call turn.
 * Provides typed helpers for each pipeline stage so callers don't need to
 * know the LangFuse API surface.
 */
export class CallTrace {
  private trace: LangfuseTraceClient | null;
  private callSid: string;

  constructor(trace: LangfuseTraceClient | null, callSid: string) {
    this.trace  = trace;
    this.callSid = callSid;
  }

  // ── STT span ──────────────────────────────────────────────────────────────
  sttSpan(): SpanWrapper {
    return new SpanWrapper(
      this.trace?.span({ name: "stt", input: { provider: "deepgram" } }) ?? null
    );
  }

  // ── RAG span ──────────────────────────────────────────────────────────────
  ragSpan(query: string): SpanWrapper {
    return new SpanWrapper(
      this.trace?.span({ name: "rag", input: { query } }) ?? null
    );
  }

  // ── LLM generation span ───────────────────────────────────────────────────
  llmSpan(model: string, userText: string): SpanWrapper {
    return new SpanWrapper(
      this.trace?.span({ name: "llm", input: { model, userText } }) ?? null
    );
  }

  // ── Tool-call span ────────────────────────────────────────────────────────
  toolSpan(toolName: string, args: Record<string, unknown>): SpanWrapper {
    return new SpanWrapper(
      this.trace?.span({ name: `tool:${toolName}`, input: args }) ?? null
    );
  }

  // ── TTS span ──────────────────────────────────────────────────────────────
  ttsSpan(provider: "deepgram" | "elevenlabs", text: string): SpanWrapper {
    return new SpanWrapper(
      this.trace?.span({ name: "tts", input: { provider, textLength: text.length } }) ?? null
    );
  }

  /** Call when the entire turn (user message → AI audio) is complete. */
  end(output?: Record<string, unknown>) {
    if (this.trace) {
      this.trace.update({ output: output ?? {} });
    }
  }
}

// ─── SpanWrapper ─────────────────────────────────────────────────────────────

export class SpanWrapper {
  private span: LangfuseSpanClient | null;
  private startMs: number;

  constructor(span: LangfuseSpanClient | null) {
    this.span    = span;
    this.startMs = Date.now();
  }

  /** Mark the span as finished and attach output metadata. */
  end(output?: Record<string, unknown>) {
    const latencyMs = Date.now() - this.startMs;
    if (this.span) {
      this.span.end({ output: { ...(output ?? {}), latencyMs } });
    }
  }
}

// ─── TracingService ───────────────────────────────────────────────────────────

export class TracingService {
  /**
   * Start a new LangFuse trace for one voice call turn.
   *
   * @param callSid        - Twilio call SID (used as trace ID for correlation)
   * @param agentId        - Agent UUID
   * @param conversationId - DB Conversation UUID
   * @param turnIndex      - Sequential turn counter within the call
   */
  startTrace(
    callSid: string,
    agentId: string,
    conversationId: string,
    turnIndex = 0
  ): CallTrace {
    const lf = getLangfuse();
    if (!lf) return new CallTrace(null, callSid);

    const trace = lf.trace({
      id: `${callSid}-turn-${turnIndex}`,
      name: "velox-voice-turn",
      metadata: { callSid, agentId, conversationId, turnIndex },
      tags: ["voice", "production"],
    });

    return new CallTrace(trace, callSid);
  }

  /** Flush pending spans to LangFuse (call at process shutdown). */
  async flush(): Promise<void> {
    if (_langfuse) {
      await _langfuse.flushAsync();
    }
  }
}

export const tracingService = new TracingService();
