import fs from "fs";
import Groq from "groq-sdk";
import { env } from "../../config/env";
import { ISpeechProvider, TranscriptionResult } from "../../interfaces";
import { logger } from "../../utils/logger";

/**
 * Concrete ISpeechProvider backed by Groq's hosted Whisper endpoint.
 * Nothing outside this file should import the `groq-sdk` package.
 */
export class GroqWhisperProvider implements ISpeechProvider {
  private client: Groq;

  constructor() {
    this.client = new Groq({ apiKey: env.GROQ_API_KEY });
  }

  async transcribe(
    filePath: string,
    options?: { language?: string }
  ): Promise<TranscriptionResult> {
    logger.debug("Groq transcription started", { filePath });

    const response = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: env.GROQ_WHISPER_MODEL,
      language: options?.language,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    // The SDK types the verbose_json shape loosely; narrow it defensively.
    const raw = response as unknown as {
      text: string;
      language?: string;
      duration?: number;
      segments?: Array<{ text: string; start: number; end: number }>;
    };

    return {
      text: raw.text,
      language: raw.language,
      durationSeconds: raw.duration,
      segments: (raw.segments ?? []).map((s) => ({
        text: s.text,
        start: s.start,
        end: s.end,
      })),
    };
  }
}
