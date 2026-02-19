// src/services/metricsService.ts
//
// Post-MVP Item 2 — Prometheus metrics via prom-client.
//
// Registers all velox_* metrics on a private Registry so the main
// defaultRegister is untouched.  The /metrics HTTP route in app.ts
// serves this registry for Prometheus scraping.
//
// Existing MetricsService.mark() calls are preserved and now also
// .observe() the matching prom-client histogram so latency data flows
// into Grafana without changing any call-sites.

import { logger } from "../utils/logger";
import {
  Counter,
  Histogram,
  Gauge,
  Registry,
} from "prom-client";

// ─── Prometheus registry (separate from the default global one) ───────────────

export const metricsRegistry = new Registry();
metricsRegistry.setDefaultLabels({ service: "velox-api" });

// ── Counters ──────────────────────────────────────────────────────────────────

export const callsTotal = new Counter({
  name: "velox_calls_total",
  help: "Total number of calls handled, labelled by terminal status",
  labelNames: ["status"] as const, // COMPLETED | FAILED | ABANDONED
  registers: [metricsRegistry],
});

export const tokenUsageTotal = new Counter({
  name: "velox_token_usage_total",
  help: "Cumulative LLM tokens consumed, labelled by model",
  labelNames: ["model"] as const,
  registers: [metricsRegistry],
});

// ── Histograms ────────────────────────────────────────────────────────────────

export const llmLatency = new Histogram({
  name: "velox_llm_latency_seconds",
  help: "Time from LLM request to first token (seconds)",
  labelNames: ["model"] as const,
  buckets: [0.1, 0.3, 0.5, 1, 2, 5],
  registers: [metricsRegistry],
});

export const ttsLatency = new Histogram({
  name: "velox_tts_latency_seconds",
  help: "Time from TTS request to first audio byte (seconds)",
  labelNames: ["provider"] as const,
  buckets: [0.1, 0.3, 0.5, 1, 2],
  registers: [metricsRegistry],
});

export const e2eLatency = new Histogram({
  name: "velox_e2e_latency_seconds",
  help: "End-to-end latency: silence detected → first audio byte played (seconds)",
  buckets: [0.5, 1, 2, 3, 5, 10],
  registers: [metricsRegistry],
});

// ── Gauge ─────────────────────────────────────────────────────────────────────

export const activeCalls = new Gauge({
  name: "velox_active_calls",
  help: "Number of WebSocket calls currently in progress",
  registers: [metricsRegistry],
});

// ─── In-memory turn-level latency tracking (unchanged public API) ─────────────

interface InteractionMetrics {
  id: number;
  startTime: number;      // When user finished speaking (STT Final)
  llmStartTime?: number;  // When we sent text to Gemini
  llmFirstToken?: number; // When Gemini sent the first chunk
  ttsStartTime?: number;  // When we sent text to Deepgram Aura
  ttsFirstByte?: number;  // When Audio came back
}

export class MetricsService {
  private metrics: Map<number, InteractionMetrics> = new Map();

  startTurn(interactionId: number) {
    this.metrics.set(interactionId, {
      id: interactionId,
      startTime: Date.now(),
    });
  }

  mark(
    interactionId: number,
    stage: "llmStart" | "llmFirstToken" | "ttsStart" | "ttsFirstByte"
  ) {
    const m = this.metrics.get(interactionId);
    if (!m) return;

    if (stage === "llmStart") m.llmStartTime = Date.now();
    if (stage === "llmFirstToken" && !m.llmFirstToken) {
      m.llmFirstToken = Date.now();
    }
    if (stage === "ttsStart") m.ttsStartTime = Date.now();
    if (stage === "ttsFirstByte" && !m.ttsFirstByte) {
      m.ttsFirstByte = Date.now();
      this.logReport(interactionId); // Log + observe Prometheus metrics
    }
  }

  private logReport(interactionId: number) {
    const m = this.metrics.get(interactionId);
    if (!m || !m.ttsFirstByte || !m.llmStartTime || !m.llmFirstToken) return;

    const llmMs = m.llmFirstToken - m.llmStartTime;
    const ttsMs = m.ttsFirstByte - (m.ttsStartTime || 0);
    const e2eMs = m.ttsFirstByte - m.startTime;

    const report = {
      event: "latency_report",
      interactionId: m.id,
      llm_latency_ms: llmMs,
      tts_latency_ms: ttsMs,
      total_e2e_latency_ms: e2eMs,
    };

    logger.info(report, "Performance Metrics");

    // ── Push into Prometheus histograms (convert ms → seconds) ────────────
    llmLatency.observe({ model: "gemini" }, llmMs / 1000);
    ttsLatency.observe({ provider: "deepgram" }, ttsMs / 1000);
    e2eLatency.observe(e2eMs / 1000);

    // Clean up memory
    this.metrics.delete(interactionId);
  }
}
