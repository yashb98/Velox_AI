import { createClient, LiveClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import { logger } from "../utils/logger";

type TranscriptCallback = (text: string) => void;
type InterruptCallback = () => void;

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 1000; // 1s, 2s, 3s (linear backoff)

export class TranscriptionService {
  private deepgramLive: LiveClient | null = null;
  private onTranscript: TranscriptCallback;
  private onInterrupt: InterruptCallback;
  private reconnectAttempts = 0;
  private closed = false; // set to true when caller explicitly closes us

  constructor(onTranscript: TranscriptCallback, onInterrupt: InterruptCallback) {
    this.onTranscript = onTranscript;
    this.onInterrupt = onInterrupt;
    this.connect();
  }

  // ─── Connection helpers ─────────────────────────────────────────────────────

  private connect() {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY || "");

    // 3.7 — utterance_end_ms: 1000 added so Deepgram waits 1 s of silence
    //         before firing UtteranceEnd (reduces spurious turn-end fires).
    this.deepgramLive = deepgram.listen.live({
      model: "nova-2",
      language: "en",
      encoding: "mulaw",          // Twilio's format
      sample_rate: 8000,          // Phone quality
      endpointing: 300,           // 300 ms silence → "Final"
      utterance_end_ms: 1000,     // 3.7 — hard VAD guard: 1 s of silence
      smart_format: true,
      interim_results: true,      // words AS they are spoken
      vad_events: true,           // Voice Activity Detection events
    });

    this.setupEventListeners();
  }

  // ─── Event listeners ────────────────────────────────────────────────────────

  private setupEventListeners() {
    if (!this.deepgramLive) return;

    this.deepgramLive.on(LiveTranscriptionEvents.Open, () => {
      logger.info("Deepgram connection opened");
      this.reconnectAttempts = 0; // reset on successful open
    });

    // 3.1 — Barge-in fix: onInterrupt() is ONLY fired here (when the user
    //         STARTS speaking), NOT on every Transcript word event.
    this.deepgramLive.on(LiveTranscriptionEvents.SpeechStarted, () => {
      logger.info("SpeechStarted — triggering interrupt");
      this.onInterrupt();
    });

    this.deepgramLive.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript;

      // 'is_final' means the user paused long enough (300 ms endpointing)
      if (transcript && data.is_final) {
        logger.info(`USER (Final): ${transcript}`);
        this.onTranscript(transcript);
      }
      // interim results are available here but we deliberately ignore them
      // (the SpeechStarted event already handles barge-in)
    });

    // 3.7 — UtteranceEnd is the hard VAD signal fired after utterance_end_ms
    this.deepgramLive.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      logger.info("Silence detected — utterance end");
    });

    this.deepgramLive.on(LiveTranscriptionEvents.Error, (err) => {
      logger.error({ err }, "Deepgram error");
    });

    // 3.2 — Auto-reconnect on unexpected Close events
    this.deepgramLive.on(LiveTranscriptionEvents.Close, () => {
      if (this.closed) {
        logger.info("Deepgram connection closed (intentional)");
        return;
      }

      if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logger.error(
          { attempts: this.reconnectAttempts },
          "Deepgram max reconnect attempts reached — giving up"
        );
        return;
      }

      const delay = RECONNECT_DELAY_MS * (this.reconnectAttempts + 1);
      this.reconnectAttempts++;

      logger.warn(
        { attempt: this.reconnectAttempts, delayMs: delay },
        "Deepgram connection closed unexpectedly — reconnecting"
      );

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
  public send(payload: string) {
    const audioBuffer = Buffer.from(payload, "base64");

    if (this.deepgramLive && this.deepgramLive.getReadyState() === 1 /* OPEN */) {
      this.deepgramLive.send(audioBuffer as any);
    }
  }

  /**
   * Intentionally close the Deepgram connection (called at call end).
   * Sets the `closed` flag so the reconnect logic knows not to retry.
   */
  public close() {
    this.closed = true;
    logger.info("Closing Deepgram connection");
    if (this.deepgramLive) {
      this.deepgramLive.finish();
      this.deepgramLive = null;
    }
  }
}
