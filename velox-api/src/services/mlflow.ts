// src/services/mlflow.ts
//
// 6.5 — MLflow experiment tracking stub.
//
// Logs LLM inference metrics, RAG config, and DeepEval quality scores to
// an MLflow Tracking Server via its REST API.  If MLFLOW_TRACKING_URI is
// not set the service becomes a no-op — no crash in dev.
//
// MLflow REST API reference:
//   POST /api/2.0/mlflow/runs/create
//   POST /api/2.0/mlflow/runs/log-metric
//   POST /api/2.0/mlflow/runs/log-batch
//   POST /api/2.0/mlflow/runs/update
//
// Usage:
//   const run = await mlflowService.startRun("velox-production", "call-" + callSid);
//   await mlflowService.logMetrics(run.runId, { latency_ms: 320, token_count: 128 });
//   await mlflowService.endRun(run.runId);

import { logger } from "../utils/logger";

interface MlflowRun {
  runId: string;
  experimentId: string;
}

interface MetricsMap {
  [key: string]: number;
}

interface ParamsMap {
  [key: string]: string;
}

// ─── MLflow Service ───────────────────────────────────────────────────────────

export class MlflowService {
  private baseUrl: string | null;

  constructor() {
    this.baseUrl = process.env.MLFLOW_TRACKING_URI ?? null;
    if (!this.baseUrl) {
      logger.warn("MLFLOW_TRACKING_URI not set — experiment tracking disabled");
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private async post(path: string, body: unknown): Promise<any> {
    if (!this.baseUrl) return null;
    try {
      const res = await fetch(`${this.baseUrl}/api/2.0/mlflow/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, path }, "MLflow API call failed (non-fatal)");
        return null;
      }
      return res.json();
    } catch (err: any) {
      logger.warn({ err: err.message, path }, "MLflow unreachable (non-fatal)");
      return null;
    }
  }

  private async getOrCreateExperiment(name: string): Promise<string> {
    // Try to get existing experiment by name
    const getRes = await fetch(
      `${this.baseUrl}/api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(name)}`
    ).catch(() => null);

    if (getRes?.ok) {
      const data = await getRes.json();
      return data.experiment?.experiment_id ?? "0";
    }

    // Create new experiment
    const createRes = await this.post("experiments/create", { name });
    return createRes?.experiment_id ?? "0";
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Start a new MLflow run.
   *
   * @param experimentName - MLflow experiment name (e.g. "velox-production")
   * @param runName        - Human-readable run name (e.g. "call-CA1234")
   */
  async startRun(experimentName: string, runName: string): Promise<MlflowRun> {
    const noopRun: MlflowRun = { runId: "", experimentId: "" };
    if (!this.baseUrl) return noopRun;

    try {
      const experimentId = await this.getOrCreateExperiment(experimentName);
      const res = await this.post("runs/create", {
        experiment_id: experimentId,
        run_name: runName,
        start_time: Date.now(),
        tags: [
          { key: "mlflow.source.name", value: "velox-api" },
          { key: "mlflow.runName", value: runName },
        ],
      });

      const runId = res?.run?.info?.run_id ?? "";
      logger.info({ runId, experimentName, runName }, "MLflow run started");
      return { runId, experimentId };
    } catch (err: any) {
      logger.warn({ err: err.message }, "Failed to start MLflow run (non-fatal)");
      return noopRun;
    }
  }

  /**
   * Log numeric metrics to an existing run.
   *
   * @param runId   - Run ID from startRun()
   * @param metrics - Key/value map of metric names to float values
   * @param step    - Optional step counter (e.g. call turn index)
   */
  async logMetrics(runId: string, metrics: MetricsMap, step = 0): Promise<void> {
    if (!this.baseUrl || !runId) return;
    const timestamp = Date.now();
    const metricsList = Object.entries(metrics).map(([key, value]) => ({
      key,
      value,
      timestamp,
      step,
    }));
    await this.post("runs/log-batch", { run_id: runId, metrics: metricsList });
  }

  /**
   * Log string parameters (model version, RAG config, etc.) to an existing run.
   *
   * @param runId  - Run ID from startRun()
   * @param params - Key/value map of parameter names to string values
   */
  async logParams(runId: string, params: ParamsMap): Promise<void> {
    if (!this.baseUrl || !runId) return;
    const paramsList = Object.entries(params).map(([key, value]) => ({ key, value }));
    await this.post("runs/log-batch", { run_id: runId, params: paramsList });
  }

  /**
   * Log a DeepEval quality-gate result as MLflow metrics.
   *
   * @param runId   - Run ID from startRun()
   * @param scores  - Object with metric name → score (0–1 floats)
   */
  async logQualityScores(runId: string, scores: MetricsMap): Promise<void> {
    const prefixed: MetricsMap = {};
    for (const [k, v] of Object.entries(scores)) {
      prefixed[`deepeval_${k}`] = v;
    }
    await this.logMetrics(runId, prefixed);
  }

  /**
   * Mark a run as finished.
   *
   * @param runId  - Run ID from startRun()
   * @param status - "FINISHED" | "FAILED" | "KILLED"
   */
  async endRun(runId: string, status: "FINISHED" | "FAILED" | "KILLED" = "FINISHED"): Promise<void> {
    if (!this.baseUrl || !runId) return;
    await this.post("runs/update", {
      run_id: runId,
      status,
      end_time: Date.now(),
    });
    logger.info({ runId, status }, "MLflow run ended");
  }
}

export const mlflowService = new MlflowService();
