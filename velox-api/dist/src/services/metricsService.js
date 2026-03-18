"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = exports.activeCalls = exports.e2eLatency = exports.ttsLatency = exports.llmLatency = exports.tokenUsageTotal = exports.callsTotal = exports.metricsRegistry = void 0;
const logger_1 = require("../utils/logger");
const prom_client_1 = require("prom-client");
// ─── Prometheus registry (separate from the default global one) ───────────────
exports.metricsRegistry = new prom_client_1.Registry();
exports.metricsRegistry.setDefaultLabels({ service: "velox-api" });
// ── Counters ──────────────────────────────────────────────────────────────────
exports.callsTotal = new prom_client_1.Counter({
    name: "velox_calls_total",
    help: "Total number of calls handled, labelled by terminal status",
    labelNames: ["status"], // COMPLETED | FAILED | ABANDONED
    registers: [exports.metricsRegistry],
});
exports.tokenUsageTotal = new prom_client_1.Counter({
    name: "velox_token_usage_total",
    help: "Cumulative LLM tokens consumed, labelled by model",
    labelNames: ["model"],
    registers: [exports.metricsRegistry],
});
// ── Histograms ────────────────────────────────────────────────────────────────
exports.llmLatency = new prom_client_1.Histogram({
    name: "velox_llm_latency_seconds",
    help: "Time from LLM request to first token (seconds)",
    labelNames: ["model"],
    buckets: [0.1, 0.3, 0.5, 1, 2, 5],
    registers: [exports.metricsRegistry],
});
exports.ttsLatency = new prom_client_1.Histogram({
    name: "velox_tts_latency_seconds",
    help: "Time from TTS request to first audio byte (seconds)",
    labelNames: ["provider"],
    buckets: [0.1, 0.3, 0.5, 1, 2],
    registers: [exports.metricsRegistry],
});
exports.e2eLatency = new prom_client_1.Histogram({
    name: "velox_e2e_latency_seconds",
    help: "End-to-end latency: silence detected → first audio byte played (seconds)",
    buckets: [0.5, 1, 2, 3, 5, 10],
    registers: [exports.metricsRegistry],
});
// ── Gauge ─────────────────────────────────────────────────────────────────────
exports.activeCalls = new prom_client_1.Gauge({
    name: "velox_active_calls",
    help: "Number of WebSocket calls currently in progress",
    registers: [exports.metricsRegistry],
});
class MetricsService {
    constructor() {
        this.metrics = new Map();
    }
    startTurn(interactionId) {
        this.metrics.set(interactionId, {
            id: interactionId,
            startTime: Date.now(),
        });
    }
    mark(interactionId, stage) {
        const m = this.metrics.get(interactionId);
        if (!m)
            return;
        if (stage === "llmStart")
            m.llmStartTime = Date.now();
        if (stage === "llmFirstToken" && !m.llmFirstToken) {
            m.llmFirstToken = Date.now();
        }
        if (stage === "ttsStart")
            m.ttsStartTime = Date.now();
        if (stage === "ttsFirstByte" && !m.ttsFirstByte) {
            m.ttsFirstByte = Date.now();
            this.logReport(interactionId); // Log + observe Prometheus metrics
        }
    }
    logReport(interactionId) {
        const m = this.metrics.get(interactionId);
        if (!m || !m.ttsFirstByte || !m.llmStartTime || !m.llmFirstToken)
            return;
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
        logger_1.logger.info(report, "Performance Metrics");
        // ── Push into Prometheus histograms (convert ms → seconds) ────────────
        exports.llmLatency.observe({ model: "gemini" }, llmMs / 1000);
        exports.ttsLatency.observe({ provider: "deepgram" }, ttsMs / 1000);
        exports.e2eLatency.observe(e2eMs / 1000);
        // Clean up memory
        this.metrics.delete(interactionId);
    }
}
exports.MetricsService = MetricsService;
