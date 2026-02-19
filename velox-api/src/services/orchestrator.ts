import WebSocket from "ws";
import axios from "axios";
import { logger } from "../utils/logger";
import { TranscriptionService } from "./transcriptionService";
import { LLMService } from "./llmService";
import { TtsService } from "./ttsService";
import { SessionService, CallStage } from "./sessionService";
import { MetricsService } from "./metricsService";
import { RetrievalService } from "./retrievalService";
import { PrismaClient } from "@prisma/client";
import redis from "../config/redis";

const prisma = new PrismaClient();

// ─── ADK service URL (set ADK_SERVICE_URL=http://agents:8000 in prod) ───────
const ADK_SERVICE_URL = process.env.ADK_SERVICE_URL || "";

export class CallOrchestrator {
  private ws: WebSocket;
  private callSid: string;
  private streamSid: string;
  private agentId: string;
  private conversationId: string;
  private metrics: MetricsService;
  private retrievalService: RetrievalService;

  // Services
  private transcriptionService: TranscriptionService | null = null;
  private llmService: LLMService;
  private ttsService: TtsService;

  // State
  private currentInteractionId = 0;
  private isAlive = true;

  constructor(
    ws: WebSocket,
    callSid: string,
    streamSid: string,
    agentId: string,
    conversationId = "",
    voiceId = "aura-asteria-en"
  ) {
    this.ws = ws;
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.agentId = agentId;
    this.conversationId = conversationId;
    this.metrics = new MetricsService();
    this.retrievalService = new RetrievalService();

    // Initialize services
    this.llmService = new LLMService();
    this.ttsService = new TtsService(voiceId);

    // Initialize Redis session
    SessionService.initSession(this.callSid, this.agentId);

    this.setupPipeline();
  }

  private setupPipeline() {
    this.transcriptionService = new TranscriptionService(
      // 1. User finished speaking
      async (text) => this.handleUserMessage(text),
      // 2. User interrupted (SpeechStarted event — fixed in 3.1)
      () => this.handleInterruption()
    );
  }

  // ─── Core Logic Loop: Ear → Brain → Mouth ──────────────────────────────

  private async handleUserMessage(userText: string) {
    if (!this.isAlive) return;

    this.currentInteractionId++;
    const myId = this.currentInteractionId;

    // ⏱️ Start turn timer
    this.metrics.startTurn(myId);

    // 3.3 — Transition to THINKING stage in Redis
    await SessionService.setStage(this.callSid, CallStage.THINKING);

    // 3.8 — Persist user message to DB (fire-and-forget; don't block pipeline)
    this.persistMessage("user", userText).catch((err) =>
      logger.error({ err }, "Failed to persist user message")
    );

    try {
      // Search the knowledge base for relevant context
      const context = await this.retrievalService.search(userText);
      if (context) {
        logger.info(`🔍 Found ${context.length} relevant chunks`);
      }

      this.metrics.mark(myId, "llmStart");

      // A1 — Route through ADK Python service if configured, else fall back
      //       to the local LLMService.
      let aiResponse = "";

      if (ADK_SERVICE_URL) {
        aiResponse = await this.callAdkService(userText, context || "");
        if (myId !== this.currentInteractionId) return;

        this.metrics.mark(myId, "llmFirstToken");

        // 3.3 — Transition to SPEAKING before sending audio
        await SessionService.setStage(this.callSid, CallStage.SPEAKING);
        this.metrics.mark(myId, "ttsStart");

        const audio = await this.ttsService.generateAudio(aiResponse);
        if (myId !== this.currentInteractionId) return;

        this.metrics.mark(myId, "ttsFirstByte");
        if (audio) this.sendAudio(audio);

        // 3.8 — Persist assistant response
        this.persistMessage("assistant", aiResponse).catch((err) =>
          logger.error({ err }, "Failed to persist assistant message")
        );

        // 3.3 — Back to LISTENING after speaking
        await SessionService.setStage(this.callSid, CallStage.LISTENING);
      } else {
        // Local LLMService path (streaming sentence-by-sentence)
        let firstSentence = true;
        const sentenceBuffer: string[] = [];

        await this.llmService.generateResponse(userText, async (aiSentence) => {
          if (myId !== this.currentInteractionId) return;

          if (firstSentence) {
            this.metrics.mark(myId, "llmFirstToken");
            firstSentence = false;

            // 3.3 — Transition to SPEAKING on first sentence
            await SessionService.setStage(this.callSid, CallStage.SPEAKING);
          }

          sentenceBuffer.push(aiSentence);
          this.metrics.mark(myId, "ttsStart");

          const audio = await this.ttsService.generateAudio(aiSentence);
          this.metrics.mark(myId, "ttsFirstByte");

          if (myId !== this.currentInteractionId) return;
          if (audio) this.sendAudio(audio);
        }, context || "");

        // 3.8 — Persist full assistant response (joined sentences)
        if (sentenceBuffer.length > 0) {
          const fullResponse = sentenceBuffer.join(" ");
          this.persistMessage("assistant", fullResponse).catch((err) =>
            logger.error({ err }, "Failed to persist assistant message")
          );
        }

        // 3.3 — Back to LISTENING after all sentences sent
        await SessionService.setStage(this.callSid, CallStage.LISTENING);
      }
    } catch (error) {
      logger.error({ error }, "Pipeline error");
      await SessionService.setStage(this.callSid, CallStage.LISTENING);
      this.playFallbackError();
    }
  }

  // ─── A1 — ADK service call ───────────────────────────────────────────────

  /**
   * POST userText + context to the Python ADK service.
   * The ADK pipeline handles model routing (Phi-3 / Flash / Pro) internally.
   * Falls back to empty string on network errors so the caller can handle it.
   */
  private async callAdkService(userText: string, context: string): Promise<string> {
    try {
      const response = await axios.post(
        `${ADK_SERVICE_URL}/generate`,
        {
          user_message: userText,
          context,
          agent_id: this.agentId,
          conversation_id: this.conversationId,
          call_sid: this.callSid,
        },
        { timeout: 15_000 }
      );
      return response.data?.response ?? "";
    } catch (err: any) {
      logger.error({ err: err.message }, "ADK service call failed — falling back to local LLM");
      // Fallback: use local LLM inline
      let text = "";
      await this.llmService.generateResponse(userText, (s) => { text += s + " "; }, context);
      return text.trim();
    }
  }

  // ─── 3.8 — DB message persistence ───────────────────────────────────────

  /**
   * Persists a conversation message to PostgreSQL.
   * Only runs when a valid conversationId is available.
   */
  private async persistMessage(role: "user" | "assistant", content: string): Promise<void> {
    if (!this.conversationId) return;
    await prisma.message.create({
      data: {
        role,
        content,
        conversation_id: this.conversationId,
      },
    });
  }

  // ─── Barge-in handler ────────────────────────────────────────────────────

  /**
   * 3.4 — Handle barge-in: abort TTS + cancel pending pipeline actions.
   *       Now also increments interrupt_count in Redis (3.3).
   */
  private async handleInterruption() {
    logger.info("Interruption detected");

    // 3.4 — Abort any in-flight TTS immediately
    this.ttsService.abort();

    // Invalidate pending pipeline actions
    this.currentInteractionId++;

    // Clear any audio queued in Twilio
    this.sendClearMessage();

    // 3.3 — Increment interrupt_count in Redis + return to LISTENING
    try {
      await redis.hincrby(`call:${this.callSid}`, "interrupt_count", 1);
      await SessionService.setStage(this.callSid, CallStage.LISTENING);
    } catch (err) {
      logger.warn({ err }, "Redis interrupt_count update failed (non-fatal)");
    }
  }

  // ─── Error recovery ──────────────────────────────────────────────────────

  private async playFallbackError() {
    logger.warn("Triggering fallback audio");
    try {
      const audio = await this.ttsService.generateAudio(
        "I'm having trouble connecting. One moment."
      );
      if (audio) this.sendAudio(audio);
    } catch (e) {
      logger.error("Critical: even fallback TTS failed");
    }
  }

  // ─── WebSocket helpers ───────────────────────────────────────────────────

  public handleAudio(payload: string) {
    if (this.transcriptionService) {
      this.transcriptionService.send(payload);
    }
  }

  private sendAudio(audio: Buffer) {
    const mediaMessage = {
      event: "media",
      streamSid: this.streamSid,
      media: { payload: audio.toString("base64") },
    };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(mediaMessage));
    }
  }

  private sendClearMessage() {
    const clearMessage = { event: "clear", streamSid: this.streamSid };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(clearMessage));
    }
  }

  public cleanup() {
    this.isAlive = false;
    this.ttsService.abort(); // cancel any pending TTS on hangup
    if (this.transcriptionService) this.transcriptionService.close();
    logger.info(`Orchestrator cleaned up for ${this.callSid}`);
  }
}
