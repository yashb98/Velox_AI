import { createClient } from "@deepgram/sdk";
import { ElevenLabsClient } from "elevenlabs";
import { logger } from "../utils/logger";

// ─── ElevenLabs voice prefix convention ────────────────────────────────────
// Any voice_id that starts with "el_" is routed to ElevenLabs TTS.
// All other voice IDs go to Deepgram Aura.
const ELEVENLABS_VOICE_PREFIX = "el_";

export class TtsService {
  private deepgram: any;
  private elevenLabs: ElevenLabsClient;
  private voiceId: string;

  // 3.4 — AbortController: lets the orchestrator cancel an in-flight TTS
  //         request the moment the user starts speaking (barge-in).
  private abortController: AbortController | null = null;

  // Shared filler audio buffer, pre-loaded at server startup to eliminate
  // cold-start latency on the very first call of the day.
  private static fillerAudio: Buffer | null = null;

  constructor(voiceId = "aura-asteria-en") {
    this.voiceId = voiceId;
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || "");
    this.elevenLabs = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY || "",
    });
  }

  // ─── Static helpers (called once at server startup) ─────────────────────

  /**
   * Pre-loads a short filler phrase into memory so orchestrators can
   * stream it immediately while the real LLM response is being generated.
   * Called once at server startup from server.ts.
   */
  static async preloadFiller(): Promise<void> {
    const instance = new TtsService();
    TtsService.fillerAudio = await instance.generateAudio(
      "One moment, let me check that for you."
    );
    if (TtsService.fillerAudio) {
      logger.info(
        { bytes: TtsService.fillerAudio.length },
        "Filler audio pre-loaded"
      );
    } else {
      logger.warn("Filler audio pre-load returned null — Deepgram may be unavailable");
    }
  }

  /**
   * Returns the pre-loaded filler audio buffer, or null if not yet loaded.
   */
  getFillerAudio(): Buffer | null {
    return TtsService.fillerAudio;
  }

  // ─── 3.4 — Abort support ─────────────────────────────────────────────────

  /**
   * Abort the currently in-flight TTS request (called on barge-in).
   * The AbortError is swallowed inside generateAudio() so callers get null.
   */
  public abort(): void {
    if (this.abortController) {
      logger.info("TTS aborted (barge-in)");
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // ─── Main TTS entry point ─────────────────────────────────────────────────

  /**
   * Converts text to mulaw 8000 Hz audio suitable for Twilio Media Streams.
   * Routes to ElevenLabs when voice_id starts with "el_", otherwise Deepgram.
   */
  async generateAudio(text: string): Promise<Buffer | null> {
    // Create a fresh AbortController for this request
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      if (this.voiceId.startsWith(ELEVENLABS_VOICE_PREFIX)) {
        // A5 — ElevenLabs provider
        return await this.generateElevenLabs(text, signal);
      } else {
        // Default — Deepgram Aura
        return await this.generateDeepgram(text, signal);
      }
    } catch (error: any) {
      if (error?.name === "AbortError" || signal.aborted) {
        logger.info("TTS request aborted cleanly");
        return null;
      }
      logger.error({ error }, "TTS generation error");
      return null;
    } finally {
      this.abortController = null;
    }
  }

  // ─── Provider implementations ─────────────────────────────────────────────

  /**
   * Deepgram Aura TTS — fast, phone-quality, mulaw 8000 Hz output.
   */
  private async generateDeepgram(
    text: string,
    signal: AbortSignal
  ): Promise<Buffer | null> {
    const response = await this.deepgram.speak.request(
      { text },
      {
        model: this.voiceId || "aura-asteria-en",
        encoding: "mulaw",   // Twilio requires mulaw
        sample_rate: 8000,   // Twilio requires 8000 Hz
        container: "none",   // Raw bytes — no WAV header
      }
    );

    const stream = await response.getStream();
    if (!stream) return null;

    return this.readableStreamToBuffer(stream, signal);
  }

  /**
   * A5 — ElevenLabs TTS provider.
   * Strips the "el_" prefix to get the actual ElevenLabs voice ID.
   * Outputs ulaw_8000 so it drops directly into the Twilio media stream.
   */
  private async generateElevenLabs(
    text: string,
    signal: AbortSignal
  ): Promise<Buffer | null> {
    const actualVoiceId = this.voiceId.slice(ELEVENLABS_VOICE_PREFIX.length);

    const audioStream = await this.elevenLabs.textToSpeech.convertAsStream(
      actualVoiceId,
      {
        text,
        model_id: "eleven_turbo_v2",
        output_format: "ulaw_8000", // mulaw 8000 Hz — matches Twilio
      }
    );

    // audioStream is a Node.js Readable (AsyncIterable<Buffer>)
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      if (signal.aborted) {
        logger.info("ElevenLabs stream aborted mid-stream");
        return null;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  // ─── Stream utilities ─────────────────────────────────────────────────────

  /**
   * Converts a Web ReadableStream to a Node.js Buffer,
   * respecting the AbortSignal so barge-in cancels mid-download.
   */
  private async readableStreamToBuffer(
    stream: ReadableStream,
    signal: AbortSignal
  ): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      if (signal.aborted) {
        reader.cancel();
        throw Object.assign(new Error("TTS aborted"), { name: "AbortError" });
      }
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
}
