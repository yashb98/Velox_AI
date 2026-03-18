"use strict";
// src/services/transcriptionService.ts
//
// Post-MVP Item 5 — Forward Deepgram word-confidence scores to LangFuse.
//
// The `onTranscript` callback now receives a second argument `confidence`
// (0.0–1.0) extracted from `data.channel.alternatives[0].confidence`.
// Callers (orchestrator.ts) pass this into sttSpan.end({ transcript, confidence })
// so the LangFuse dashboard surfaces STT quality per turn.
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionService = void 0;
const sdk_1 = require("@deepgram/sdk");
const logger_1 = require("../utils/logger");
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000; // 1s, 2s, 3s (linear backoff)
class TranscriptionService {
    constructor(onTranscript, onInterrupt) {
        this.deepgramLive = null;
        this.reconnectAttempts = 0;
        this.closed = false; // set to true when caller explicitly closes us
        this.onTranscript = onTranscript;
        this.onInterrupt = onInterrupt;
        this.connect();
    }
    // ─── Connection helpers ─────────────────────────────────────────────────────
    connect() {
        const deepgram = (0, sdk_1.createClient)(process.env.DEEPGRAM_API_KEY || "");
        // 3.7 — utterance_end_ms: 1000 added so Deepgram waits 1 s of silence
        //         before firing UtteranceEnd (reduces spurious turn-end fires).
        this.deepgramLive = deepgram.listen.live({
            model: "nova-2",
            language: "en",
            encoding: "mulaw", // Twilio's format
            sample_rate: 8000, // Phone quality
            endpointing: 300, // 300 ms silence → "Final"
            utterance_end_ms: 1000, // 3.7 — hard VAD guard: 1 s of silence
            smart_format: true,
            interim_results: true, // words AS they are spoken
            vad_events: true, // Voice Activity Detection events
        });
        this.setupEventListeners();
    }
    // ─── Event listeners ────────────────────────────────────────────────────────
    setupEventListeners() {
        if (!this.deepgramLive)
            return;
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.Open, () => {
            logger_1.logger.info("Deepgram connection opened");
            this.reconnectAttempts = 0; // reset on successful open
        });
        // 3.1 — Barge-in fix: onInterrupt() is ONLY fired here (when the user
        //         STARTS speaking), NOT on every Transcript word event.
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.SpeechStarted, () => {
            logger_1.logger.info("SpeechStarted — triggering interrupt");
            this.onInterrupt();
        });
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.Transcript, (data) => {
            const alt = data.channel.alternatives[0];
            const transcript = alt.transcript;
            // Post-MVP Item 5 — extract word-level confidence (0.0–1.0)
            // Deepgram returns per-word confidence in `alt.confidence`
            const confidence = alt.confidence ?? 0;
            // 'is_final' means the user paused long enough (300 ms endpointing)
            if (transcript && data.is_final) {
                logger_1.logger.info({ transcript, confidence }, "USER (Final)");
                // Pass confidence to orchestrator so it reaches the LangFuse STT span
                this.onTranscript(transcript, confidence);
            }
            // interim results are available here but we deliberately ignore them
            // (the SpeechStarted event already handles barge-in)
        });
        // 3.7 — UtteranceEnd is the hard VAD signal fired after utterance_end_ms
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.UtteranceEnd, () => {
            logger_1.logger.info("Silence detected — utterance end");
        });
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.Error, (err) => {
            logger_1.logger.error({ err }, "Deepgram error");
        });
        // 3.2 — Auto-reconnect on unexpected Close events
        this.deepgramLive.on(sdk_1.LiveTranscriptionEvents.Close, () => {
            if (this.closed) {
                logger_1.logger.info("Deepgram connection closed (intentional)");
                return;
            }
            if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                logger_1.logger.error({ attempts: this.reconnectAttempts }, "Deepgram max reconnect attempts reached — giving up");
                return;
            }
            const delay = RECONNECT_DELAY_MS * (this.reconnectAttempts + 1);
            this.reconnectAttempts++;
            logger_1.logger.warn({ attempt: this.reconnectAttempts, delayMs: delay }, "Deepgram connection closed unexpectedly — reconnecting");
            setTimeout(() => {
                if (!this.closed) {
                    this.connect();
                }
            }, delay);
        });
    }
    // ─── Public API ─────────────────────────────────────────────────────────────
    /**
     * Send raw audio chunks from Twilio to Deepgram.
     * Twilio sends base64; Deepgram expects a Buffer.
     */
    send(payload) {
        const audioBuffer = Buffer.from(payload, "base64");
        if (this.deepgramLive && this.deepgramLive.getReadyState() === 1 /* OPEN */) {
            this.deepgramLive.send(audioBuffer);
        }
    }
    /**
     * Intentionally close the Deepgram connection (called at call end).
     * Sets the `closed` flag so the reconnect logic knows not to retry.
     */
    close() {
        this.closed = true;
        logger_1.logger.info("Closing Deepgram connection");
        if (this.deepgramLive) {
            this.deepgramLive.finish();
            this.deepgramLive = null;
        }
    }
}
exports.TranscriptionService = TranscriptionService;
