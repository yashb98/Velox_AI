import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { v4 as uuidv4 } from "uuid"; // Sync import — eliminates the race condition
import { rateLimiter } from "./middleware/rateLimiter";
import { logger } from "./utils/logger";
import { requireAuth } from "./middleware/auth";
import webhookRoutes from "./routes/webhooks";
import documentRoutes from "./routes/documentRoutes";
import playgroundRoutes from "./routes/playground";
import billingRoutes from "./routes/billing";
import agentRoutes from "./routes/agents";
import conversationRoutes from "./routes/conversations";

const app = express();

// 1. Security
app.use(helmet());
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

// 6. Health check — includes uptime so load-balancers can detect slow restarts
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    version: process.env.npm_package_version,
  });
});

// 7. Protected API routes — requireAuth validates Clerk JWT on every request
app.use("/api/documents", requireAuth, documentRoutes);
app.use("/api/playground", requireAuth, playgroundRoutes);
app.use("/api/billing", requireAuth, billingRoutes);
app.use("/api/agents", requireAuth, agentRoutes);
app.use("/api/conversations", requireAuth, conversationRoutes);

// 8. Global error handler — catches anything thrown inside route handlers
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
