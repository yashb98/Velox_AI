import { createClient } from "@deepgram/sdk";
import { logger } from "../utils/logger";

export class TtsService {
  private deepgram: any;

  // Shared filler audio buffer, pre-loaded at server startup to eliminate
  // cold-start latency on the very first call of the day.
  private static fillerAudio: Buffer | null = null;

  constructor() {
    this.deepgram = createClient(process.env.DEEPGRAM_API_KEY || "");
  }

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

  /**
   * Converts text to mulaw 8000 Hz audio suitable for Twilio Media Streams.
   */
  async generateAudio(text: string): Promise<Buffer | null> {
    try {
      const response = await this.deepgram.speak.request(
        { text },
        {
          model: "aura-asteria-en", // Fast female voice; use 'aura-helios-en' for male
          encoding: "mulaw",        // Twilio requires mulaw
          sample_rate: 8000,        // Twilio requires 8000 Hz
          container: "none",        // Raw bytes — no WAV header
        }
      );

      const stream = await response.getStream();
      if (stream) {
        return this.streamToBuffer(stream);
      }
      return null;
    } catch (error) {
      logger.error({ error }, "TTS generation error");
      return null;
    }
  }

  // Converts a Web ReadableStream to a Node.js Buffer
  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  }
}
