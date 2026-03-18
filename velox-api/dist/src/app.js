"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = require("pino-http");
const uuid_1 = require("uuid"); // Sync import — eliminates the race condition
const rateLimiter_1 = require("./middleware/rateLimiter");
const logger_1 = require("./utils/logger");
const auth_1 = require("./middleware/auth");
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const documentRoutes_1 = __importDefault(require("./routes/documentRoutes"));
const playground_1 = __importDefault(require("./routes/playground"));
const billing_1 = __importDefault(require("./routes/billing"));
const agents_1 = __importDefault(require("./routes/agents"));
const conversations_1 = __importDefault(require("./routes/conversations"));
const admin_1 = __importDefault(require("./routes/admin"));
const metricsService_1 = require("./services/metricsService");
const app = (0, express_1.default)();
exports.app = app;
// 1. Security
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.DASHBOARD_URL || "http://localhost:5173",
    credentials: true,
}));
// 2. Stripe webhook MUST come before express.json() — it needs the raw body
//    for HMAC signature verification.
app.use("/stripe/webhook", webhooks_1.default);
// 3. Body parsing & rate limiting
app.use(express_1.default.json());
app.use(rateLimiter_1.rateLimiter);
// 4. Request ID middleware — no async import race, uuid is available immediately
app.use((req, res, next) => {
    req.id = req.headers["x-request-id"] || (0, uuid_1.v4)();
    res.setHeader("X-Request-ID", req.id);
    next();
});
// 5. Structured request logging
app.use((0, pino_http_1.pinoHttp)({
    logger: logger_1.logger,
    genReqId: (req) => req.id,
}));
// 6. Health check — includes uptime so load-balancers can detect slow restarts
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "ok",
        uptime: process.uptime(),
        version: process.env.npm_package_version,
    });
});
// 7. Prometheus metrics — unauthenticated, intended for internal scraper only
//    Post-MVP Item 2: expose velox_* counters/histograms/gauges for Grafana
app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", metricsService_1.metricsRegistry.contentType);
    res.end(await metricsService_1.metricsRegistry.metrics());
});
// 8. Protected API routes — requireAuth validates Clerk JWT on every request
app.use("/api/documents", auth_1.requireAuth, documentRoutes_1.default);
app.use("/api/playground", auth_1.requireAuth, playground_1.default);
app.use("/api/billing", auth_1.requireAuth, billing_1.default);
app.use("/api/agents", auth_1.requireAuth, agents_1.default);
app.use("/api/conversations", auth_1.requireAuth, conversations_1.default);
// 9. Admin routes — protected by ADMIN_API_KEY header (not Clerk)
//    Post-MVP Item 6: used by Cloud Scheduler to trigger LLM eval runs
app.use("/api/admin", admin_1.default);
// 10. Global error handler — catches anything thrown inside route handlers
app.use((err, req, res, _next) => {
    logger_1.logger.error({ err, reqId: req.id }, "Unhandled error");
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === "production"
            ? "Internal Server Error"
            : err.message,
        reqId: req.id,
    });
});
