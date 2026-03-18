"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallOrchestrator = void 0;
const ws_1 = __importDefault(require("ws"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
const transcriptionService_1 = require("./transcriptionService");
const llmService_1 = require("./llmService");
const ttsService_1 = require("./ttsService");
const sessionService_1 = require("./sessionService");
const metricsService_1 = require("./metricsService");
const retrievalService_1 = require("./retrievalService");
const tracingService_1 = require("./tracingService");
const client_1 = require("@prisma/client");
const redis_1 = __importDefault(require("../config/redis"));
const prisma = new client_1.PrismaClient();
// ─── ADK service URL (set ADK_SERVICE_URL=http://agents:8000 in prod) ───────
const ADK_SERVICE_URL = process.env.ADK_SERVICE_URL || "";
class CallOrchestrator {
    constructor(ws, callSid, streamSid, agentId, conversationId = "", voiceId = "aura-asteria-en") {
        // Services
        this.transcriptionService = null;
        // State
        this.currentInteractionId = 0;
        this.isAlive = true;
        this.ws = ws;
        this.callSid = callSid;
        this.streamSid = streamSid;
        this.agentId = agentId;
        this.conversationId = conversationId;
        this.metrics = new metricsService_1.MetricsService();
        this.retrievalService = new retrievalService_1.RetrievalService();
        // Initialize services
        this.llmService = new llmService_1.LLMService();
        this.ttsService = new ttsService_1.TtsService(voiceId);
        // Initialize Redis session
        sessionService_1.SessionService.initSession(this.callSid, this.agentId);
        this.setupPipeline();
    }
    setupPipeline() {
        this.transcriptionService = new transcriptionService_1.TranscriptionService(
        // 1. User finished speaking — confidence forwarded for LangFuse STT span (Item 5)
        async (text, confidence) => this.handleUserMessage(text, confidence), 
        // 2. User interrupted (SpeechStarted event — fixed in 3.1)
        () => this.handleInterruption());
    }
    // ─── Core Logic Loop: Ear → Brain → Mouth ──────────────────────────────
    // Post-MVP Item 5 — confidence: Deepgram word-level confidence (0.0–1.0)
    //   passed through from TranscriptionService for LangFuse STT span output.
    async handleUserMessage(userText, confidence = 0) {
        if (!this.isAlive)
            return;
        this.currentInteractionId++;
        const myId = this.currentInteractionId;
        // ⏱️ Start turn timer
        this.metrics.startTurn(myId);
        // 3.3 — Transition to THINKING stage in Redis
        await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.THINKING);
        // Post-MVP Item 5 — forward Deepgram confidence to LangFuse STT span
        // The sttSpan.end() output is visible in the LangFuse "output" column
        // for every STT stage, enabling quality monitoring per call.
        const callTrace = tracingService_1.tracingService.startTrace(this.callSid, this.agentId, this.conversationId, myId);
        const sttSpan = callTrace.sttSpan();
        sttSpan.end({
            transcript: userText,
            confidence,
            words: userText.split(" ").length,
        });
        // 3.8 — Persist user message to DB (fire-and-forget; don't block pipeline)
        this.persistMessage("user", userText).catch((err) => logger_1.logger.error({ err }, "Failed to persist user message"));
        try {
            // Search the knowledge base for relevant context
            const context = await this.retrievalService.search(userText);
            if (context) {
                logger_1.logger.info(`🔍 Found ${context.length} relevant chunks`);
            }
            this.metrics.mark(myId, "llmStart");
            // A1 — Route through ADK Python service if configured, else fall back
            //       to the local LLMService.
            let aiResponse = "";
            if (ADK_SERVICE_URL) {
                aiResponse = await this.callAdkService(userText, context || "");
                if (myId !== this.currentInteractionId)
                    return;
                this.metrics.mark(myId, "llmFirstToken");
                // 3.3 — Transition to SPEAKING before sending audio
                await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.SPEAKING);
                this.metrics.mark(myId, "ttsStart");
                const audio = await this.ttsService.generateAudio(aiResponse);
                if (myId !== this.currentInteractionId)
                    return;
                this.metrics.mark(myId, "ttsFirstByte");
                if (audio)
                    this.sendAudio(audio);
                // 3.8 — Persist assistant response
                this.persistMessage("assistant", aiResponse).catch((err) => logger_1.logger.error({ err }, "Failed to persist assistant message"));
                // 3.3 — Back to LISTENING after speaking
                await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.LISTENING);
            }
            else {
                // Local LLMService path (streaming sentence-by-sentence)
                let firstSentence = true;
                const sentenceBuffer = [];
                await this.llmService.generateResponse(userText, async (aiSentence) => {
                    if (myId !== this.currentInteractionId)
                        return;
                    if (firstSentence) {
                        this.metrics.mark(myId, "llmFirstToken");
                        firstSentence = false;
                        // 3.3 — Transition to SPEAKING on first sentence
                        await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.SPEAKING);
                    }
                    sentenceBuffer.push(aiSentence);
                    this.metrics.mark(myId, "ttsStart");
                    const audio = await this.ttsService.generateAudio(aiSentence);
                    this.metrics.mark(myId, "ttsFirstByte");
                    if (myId !== this.currentInteractionId)
                        return;
                    if (audio)
                        this.sendAudio(audio);
                }, context || "");
                // 3.8 — Persist full assistant response (joined sentences)
                if (sentenceBuffer.length > 0) {
                    const fullResponse = sentenceBuffer.join(" ");
                    this.persistMessage("assistant", fullResponse).catch((err) => logger_1.logger.error({ err }, "Failed to persist assistant message"));
                }
                // 3.3 — Back to LISTENING after all sentences sent
                await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.LISTENING);
            }
        }
        catch (error) {
            logger_1.logger.error({ error }, "Pipeline error");
            await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.LISTENING);
            this.playFallbackError();
        }
    }
    // ─── A1 — ADK service call ───────────────────────────────────────────────
    /**
     * POST userText + context to the Python ADK service.
     * The ADK pipeline handles model routing (Phi-3 / Flash / Pro) internally.
     * Falls back to empty string on network errors so the caller can handle it.
     */
    async callAdkService(userText, context) {
        try {
            const response = await axios_1.default.post(`${ADK_SERVICE_URL}/generate`, {
                user_message: userText,
                context,
                agent_id: this.agentId,
                conversation_id: this.conversationId,
                call_sid: this.callSid,
            }, { timeout: 15000 });
            return response.data?.response ?? "";
        }
        catch (err) {
            logger_1.logger.error({ err: err.message }, "ADK service call failed — falling back to local LLM");
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
    async persistMessage(role, content) {
        if (!this.conversationId)
            return;
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
    async handleInterruption() {
        logger_1.logger.info("Interruption detected");
        // 3.4 — Abort any in-flight TTS immediately
        this.ttsService.abort();
        // Invalidate pending pipeline actions
        this.currentInteractionId++;
        // Clear any audio queued in Twilio
        this.sendClearMessage();
        // 3.3 — Increment interrupt_count in Redis + return to LISTENING
        try {
            await redis_1.default.hincrby(`call:${this.callSid}`, "interrupt_count", 1);
            await sessionService_1.SessionService.setStage(this.callSid, sessionService_1.CallStage.LISTENING);
        }
        catch (err) {
            logger_1.logger.warn({ err }, "Redis interrupt_count update failed (non-fatal)");
        }
    }
    // ─── Error recovery ──────────────────────────────────────────────────────
    async playFallbackError() {
        logger_1.logger.warn("Triggering fallback audio");
        try {
            const audio = await this.ttsService.generateAudio("I'm having trouble connecting. One moment.");
            if (audio)
                this.sendAudio(audio);
        }
        catch (e) {
            logger_1.logger.error("Critical: even fallback TTS failed");
        }
    }
    // ─── WebSocket helpers ───────────────────────────────────────────────────
    handleAudio(payload) {
        if (this.transcriptionService) {
            this.transcriptionService.send(payload);
        }
    }
    sendAudio(audio) {
        const mediaMessage = {
            event: "media",
            streamSid: this.streamSid,
            media: { payload: audio.toString("base64") },
        };
        if (this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(mediaMessage));
        }
    }
    sendClearMessage() {
        const clearMessage = { event: "clear", streamSid: this.streamSid };
        if (this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(clearMessage));
        }
    }
    cleanup() {
        this.isAlive = false;
        this.ttsService.abort(); // cancel any pending TTS on hangup
        if (this.transcriptionService)
            this.transcriptionService.close();
        logger_1.logger.info(`Orchestrator cleaned up for ${this.callSid}`);
    }
}
exports.CallOrchestrator = CallOrchestrator;
