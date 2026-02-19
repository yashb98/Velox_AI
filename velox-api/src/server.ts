// velox-api/src/server.ts
import "dotenv/config";
import { app } from "./app";
import { logger } from "./utils/logger";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import voiceRoutes from "./routes/voice";
import { handleAudioStream } from "./websocket/streamHandler";
import { TtsService } from "./services/ttsService";
import { billingService } from "./services/billingService";
import { activeCalls } from "./services/metricsService";

const PORT = process.env.PORT || 8080; // Cloud Run defaults to 8080

// Register voice webhook routes (Twilio signature validation applied per-route
// inside voiceRoutes itself via validateTwilioWebhook middleware)
app.use("/voice", voiceRoutes);

// Create HTTP server
const server = createServer(app);

// ─── Post-MVP Item 4 — WebSocket pre-auth gate ────────────────────────────────
//
// Switch to noServer mode so we can intercept the HTTP Upgrade event and
// validate billing credit BEFORE the WebSocket handshake completes.
//
// Twilio passes orgId as a TwiML stream parameter which it forwards on the
// WS URL query string (voice.ts line 101: stream.parameter({name:"orgId",…})).
// An org with 0 credit is rejected with HTTP 402 — Twilio will then hang up
// gracefully rather than getting a free 30-second call.

const wss = new WebSocketServer({ noServer: true });

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
    logger.warn({ url: rawUrl }, "WS upgrade rejected — missing orgId");
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  try {
    const hasCredit = await billingService.hasMinutes(orgId, 1);
    if (!hasCredit) {
      logger.warn({ orgId }, "WS upgrade rejected — insufficient credit balance");
      socket.write("HTTP/1.1 402 Payment Required\r\n\r\n");
      socket.destroy();
      return;
    }
  } catch (err) {
    // Don't block the call on a billing DB error — let it through and log
    logger.error({ err, orgId }, "Billing pre-auth check failed — allowing upgrade");
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    activeCalls.inc(); // Post-MVP Item 2: track active calls in Prometheus
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws, req) => {
  logger.info("New WebSocket connection established");

  // Decrement active-call gauge when the WS closes (Item 2)
  ws.on("close", () => activeCalls.dec());

  handleAudioStream(ws, req);
});

// Pre-warm filler audio so the first call doesn't incur cold-start TTS latency,
// then begin listening for connections.
TtsService.preloadFiller()
  .then(() => {
    server.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    // Non-fatal — log and start anyway so the service isn't blocked by a TTS outage
    logger.error({ err }, "Failed to pre-load filler audio — starting anyway");
    server.listen(PORT, () => {
      logger.info(`Server listening on port ${PORT}`);
    });
  });

// Graceful Shutdown (Handle Cloud Run SIGTERM)
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    logger.info("Server closed.");
    process.exit(0);
  });
});
