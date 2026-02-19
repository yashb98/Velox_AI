// src/routes/admin.ts
//
// Post-MVP Item 6 — Internal admin endpoints, protected by ADMIN_API_KEY header.
//
// These routes are NOT protected by Clerk JWT — they're intended for:
//   • Cloud Scheduler (triggers /api/admin/run-eval weekly)
//   • Internal tooling and CI pipelines
//
// Required env var:
//   ADMIN_API_KEY  — a long random secret shared with Cloud Scheduler via
//                    Secret Manager; absent → all routes return 503
//
// POST /api/admin/run-eval
//   Runs the DeepEval quality gate (pytest tests/llm/) and logs pass/fail
//   scores to MLflow.  Returns 200 on pass, 500 on fail (so Cloud Scheduler
//   retries on failure).
//
// GET /api/admin/health
//   Lightweight liveness probe for the admin subsystem.

import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import { logger } from "../utils/logger";

const router = Router();

// ─── Auth middleware — validate x-admin-key header ───────────────────────────

function requireAdminKey(req: Request, res: Response, next: () => void) {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey) {
    logger.error("ADMIN_API_KEY not set — admin routes disabled");
    res.status(503).json({ error: "Admin API not configured" });
    return;
  }
  const provided = req.headers["x-admin-key"];
  if (!provided || provided !== adminKey) {
    logger.warn({ ip: req.ip }, "Admin route: invalid or missing x-admin-key");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

router.use(requireAdminKey as any);

// ─── GET /api/admin/health ────────────────────────────────────────────────────

router.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "admin" });
});

// ─── POST /api/admin/run-eval ─────────────────────────────────────────────────
//
// Runs `python -m pytest tests/llm/ -v --tb=short` and streams stdout/stderr
// to the server log.  Returns:
//   200  { passed: true,  exit_code: 0  }  — all quality gates passed
//   500  { passed: false, exit_code: N  }  — one or more tests failed
//
// Cloud Scheduler is configured with max-retry-attempts=1, so a 500 response
// triggers one automatic retry the following night before alerting on-call.

router.post("/run-eval", (req: Request, res: Response) => {
  logger.info({ ip: req.ip }, "Admin: triggering DeepEval quality gate");

  // Resolve the repo root — tests/llm/ lives two directories above this file
  const cwd = process.cwd();

  const child = spawn("python", ["-m", "pytest", "tests/llm/", "-v", "--tb=short"], {
    cwd,
    env: { ...process.env },
  });

  const outputLines: string[] = [];

  child.stdout.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    outputLines.push(...lines);
    lines.forEach((line) => logger.info({ source: "pytest" }, line));
  });

  child.stderr.on("data", (data: Buffer) => {
    const lines = data.toString().split("\n").filter(Boolean);
    outputLines.push(...lines);
    lines.forEach((line) => logger.warn({ source: "pytest-stderr" }, line));
  });

  child.on("close", async (exitCode) => {
    const passed = exitCode === 0;

    logger.info(
      { exitCode, passed },
      `DeepEval quality gate ${passed ? "PASSED" : "FAILED"}`
    );

    // Log results to MLflow if available
    await logEvalResultToMlflow(passed, exitCode ?? 1).catch((err) =>
      logger.warn({ err }, "MLflow logging failed (non-fatal)")
    );

    if (passed) {
      res.status(200).json({
        passed: true,
        exit_code: 0,
        lines: outputLines.length,
        message: "All DeepEval quality gates passed",
      });
    } else {
      res.status(500).json({
        passed: false,
        exit_code: exitCode ?? 1,
        lines: outputLines.length,
        message: "DeepEval quality gate failed — check logs for details",
      });
    }
  });

  child.on("error", (err) => {
    logger.error({ err }, "Failed to spawn pytest process");
    res.status(500).json({
      passed: false,
      exit_code: -1,
      message: `Failed to run eval: ${err.message}`,
    });
  });
});

// ─── MLflow helper ────────────────────────────────────────────────────────────

async function logEvalResultToMlflow(passed: boolean, exitCode: number): Promise<void> {
  const mlflowUri = process.env.MLFLOW_TRACKING_URI;
  if (!mlflowUri) return; // MLflow not configured — skip silently

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    // Create run
    const runRes = await fetch(`${mlflowUri}/api/2.0/mlflow/runs/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experiment_id: "0",
        run_name: `eval-${new Date().toISOString()}`,
        tags: [{ key: "component", value: "quality-gate" }],
      }),
      signal: controller.signal,
    });

    if (!runRes.ok) return;
    const { run } = await runRes.json() as { run: { info: { run_id: string } } };
    const runId = run.info.run_id;

    // Log metrics
    await fetch(`${mlflowUri}/api/2.0/mlflow/runs/log-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        metrics: [
          { key: "eval_passed", value: passed ? 1 : 0, timestamp: Date.now(), step: 0 },
          { key: "eval_exit_code", value: exitCode, timestamp: Date.now(), step: 0 },
        ],
      }),
      signal: controller.signal,
    });

    // Terminate run
    await fetch(`${mlflowUri}/api/2.0/mlflow/runs/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        status: passed ? "FINISHED" : "FAILED",
        end_time: Date.now(),
      }),
      signal: controller.signal,
    });

    logger.info({ runId, passed }, "Eval result logged to MLflow");
  } finally {
    clearTimeout(timeout);
  }
}

export default router;
