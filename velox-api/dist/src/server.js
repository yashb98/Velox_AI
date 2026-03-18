"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// velox-api/src/server.ts
require("dotenv/config");
const app_1 = require("./app");
const logger_1 = require("./utils/logger");
const http_1 = require("http");
const ws_1 = require("ws");
const voice_1 = __importDefault(require("./routes/voice"));
const streamHandler_1 = require("./websocket/streamHandler");
const ttsService_1 = require("./services/ttsService");
const billingService_1 = require("./services/billingService");
const metricsService_1 = require("./services/metricsService");
const PORT = process.env.PORT || 8080; // Cloud Run defaults to 8080
// Register voice webhook routes (Twilio signature validation applied per-route
// inside voiceRoutes itself via validateTwilioWebhook middleware)
app_1.app.use("/voice", voice_1.default);
// Create HTTP server
const server = (0, http_1.createServer)(app_1.app);
// ─── Post-MVP Item 4 — WebSocket pre-auth gate ────────────────────────────────
//
// Switch to noServer mode so we can intercept the HTTP Upgrade event and
// validate billing credit BEFORE the WebSocket handshake completes.
//
// Twilio passes orgId as a TwiML stream parameter which it forwards on the
// WS URL query string (voice.ts line 101: stream.parameter({name:"orgId",…})).
// An org with 0 credit is rejected with HTTP 402 — Twilio will then hang up
// gracefully rather than getting a free 30-second call.
const wss = new ws_1.WebSocketServer({ noServer: true });
server.on("upgrade", async (req, socket, head) => {
    // Only handle /media-stream upgrades; reject everything else
    const rawUrl = req.url ?? "";
    if (!rawUrl.startsWith("/media-stream")) {
        socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
        socket.destroy();
        return;
    }
    const url = new URL(rawUrl, `http://${req.headers.host}`);
    const orgId = url.searchParams.get("orgId");
    if (!orgId) {
        logger_1.logger.warn({ url: rawUrl }, "WS upgrade rejected — missing orgId");
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
    }
    try {
        const hasCredit = await billingService_1.billingService.hasMinutes(orgId, 1);
        if (!hasCredit) {
            logger_1.logger.warn({ orgId }, "WS upgrade rejected — insufficient credit balance");
            socket.write("HTTP/1.1 402 Payment Required\r\n\r\n");
            socket.destroy();
            return;
        }
    }
    catch (err) {
        // Don't block the call on a billing DB error — let it through and log
        logger_1.logger.error({ err, orgId }, "Billing pre-auth check failed — allowing upgrade");
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        metricsService_1.activeCalls.inc(); // Post-MVP Item 2: track active calls in Prometheus
        wss.emit("connection", ws, req);
    });
});
wss.on("connection", (ws, req) => {
    logger_1.logger.info("New WebSocket connection established");
    // Decrement active-call gauge when the WS closes (Item 2)
    ws.on("close", () => metricsService_1.activeCalls.dec());
    (0, streamHandler_1.handleAudioStream)(ws, req);
});
// Pre-warm filler audio so the first call doesn't incur cold-start TTS latency,
// then begin listening for connections.
ttsService_1.TtsService.preloadFiller()
    .then(() => {
    server.listen(PORT, () => {
        logger_1.logger.info(`Server listening on port ${PORT}`);
    });
})
    .catch((err) => {
    // Non-fatal — log and start anyway so the service isn't blocked by a TTS outage
    logger_1.logger.error({ err }, "Failed to pre-load filler audio — starting anyway");
    server.listen(PORT, () => {
        logger_1.logger.info(`Server listening on port ${PORT}`);
    });
});
// Graceful Shutdown (Handle Cloud Run SIGTERM)
process.on("SIGTERM", () => {
    logger_1.logger.info("SIGTERM received. Shutting down gracefully...");
    server.close(() => {
        logger_1.logger.info("Server closed.");
        process.exit(0);
    });
});
