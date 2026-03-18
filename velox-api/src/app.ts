import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { v4 as uuidv4 } from "uuid";
import swaggerUi from "swagger-ui-express";
import { rateLimiter } from "./middleware/rateLimiter";
import { logger } from "./utils/logger";
import { requireAuth } from "./middleware/auth";
import webhookRoutes from "./routes/webhooks";
import documentRoutes from "./routes/documentRoutes";
import playgroundRoutes from "./routes/playground";
import billingRoutes from "./routes/billing";
import agentRoutes from "./routes/agents";
import conversationRoutes from "./routes/conversations";
import adminRoutes from "./routes/admin";
import { metricsRegistry } from "./services/metricsService";
import { swaggerSpec } from "./config/swagger";

const app = express();

// 1. Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for Swagger UI
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(
  cors({
    origin: process.env.DASHBOARD_URL || "http://localhost:5173",
    credentials: true,
  })
);

// 2. Stripe webhook MUST come before express.json() — it needs the raw body
//    for HMAC signature verification.
app.use("/stripe/webhook", webhookRoutes);

// 3. Body parsing & rate limiting
app.use(express.json());
app.use(rateLimiter);

// 4. Request ID middleware — no async import race, uuid is available immediately
app.use((req: Request, res: Response, next: NextFunction) => {
  req.id = (req.headers["x-request-id"] as string) || uuidv4();
  res.setHeader("X-Request-ID", req.id);
  next();
});

// 5. Structured request logging
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as Request).id,
  })
);

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Service health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    version: process.env.npm_package_version,
  });
});

/**
 * @openapi
 * /metrics:
 *   get:
 *     summary: Prometheus metrics
 *     tags: [Health]
 *     description: Returns metrics in Prometheus text format for scraping
 *     responses:
 *       200:
 *         description: Metrics in Prometheus format
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
app.get("/metrics", async (_req: Request, res: Response) => {
  res.set("Content-Type", metricsRegistry.contentType);
  res.end(await metricsRegistry.metrics());
});

// 6. API Documentation (Swagger UI)
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Velox AI API Documentation",
  customCss: '.swagger-ui .topbar { display: none }',
}));

// 7. OpenAPI spec endpoint
app.get("/api-docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// 8. Protected API routes — requireAuth validates Clerk JWT on every request
app.use("/api/documents", requireAuth, documentRoutes);
app.use("/api/playground", requireAuth, playgroundRoutes);
app.use("/api/billing", requireAuth, billingRoutes);
app.use("/api/agents", requireAuth, agentRoutes);
app.use("/api/conversations", requireAuth, conversationRoutes);

// 9. Admin routes — protected by ADMIN_API_KEY header (not Clerk)
//    Post-MVP Item 6: used by Cloud Scheduler to trigger LLM eval runs
app.use("/api/admin", adminRoutes);

// 10. Global error handler — catches anything thrown inside route handlers
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, reqId: req.id }, "Unhandled error");
  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal Server Error"
        : err.message,
    reqId: req.id,
  });
});

export { app };
