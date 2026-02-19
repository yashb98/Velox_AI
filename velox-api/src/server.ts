// velox-api/src/server.ts
import "dotenv/config";
import { app } from "./app";
import { logger } from "./utils/logger";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import voiceRoutes from "./routes/voice";
import { handleAudioStream } from "./websocket/streamHandler";
import { TtsService } from "./services/ttsService";

const PORT = process.env.PORT || 8080; // Cloud Run defaults to 8080

// Register voice webhook routes (Twilio signature validation applied per-route
// inside voiceRoutes itself via validateTwilioWebhook middleware)
app.use("/voice", voiceRoutes);

// Create HTTP server
const server = createServer(app);

// Create WebSocket server — Twilio Media Streams connect here
const wss = new WebSocketServer({ server, path: "/media-stream" });

wss.on("connection", (ws, req) => {
  logger.info("New WebSocket connection established");
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
