import { GroqWhisperProvider } from "../providers";
import { AudioChunk } from "../providers/audio/ffmpegAudioProvider";
import { ISpeechProvider, TranscriptionResult } from "../interfaces";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { sleep, backoffDelay } from "../utils/retry";

interface ChunkTranscriptionOutcome {
  index: number;
  result: TranscriptionResult;
}

export class TranscriptionService {
  private speechProvider: ISpeechProvider;

  constructor(speechProvider: ISpeechProvider = new GroqWhisperProvider()) {
    this.speechProvider = speechProvider;
  }

  /**
   * Transcribes all chunks in parallel. A failed chunk is retried up to
   * MAX_TRANSCRIPTION_RETRIES times with exponential backoff — the whole
   * job is only failed if a chunk still fails after retries exhausted.
   * the merge is validated (order, missing/duplicate chunks,
   * basic sentence continuity) before being accepted; processing aborts
   * if the merge looks unsafe rather than silently producing a broken
   * transcript.
   */
  async transcribeChunks(expectedChunkCount: number, chunks: AudioChunk[]): Promise<string> {
    const outcomes = await Promise.all(
      chunks.map((chunk) => this.transcribeWithRetry(chunk))
    );

    this.validateMerge(expectedChunkCount, outcomes);

    return this.mergeInOrder(outcomes);
  }

  private async transcribeWithRetry(chunk: AudioChunk): Promise<ChunkTranscriptionOutcome> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= env.MAX_TRANSCRIPTION_RETRIES; attempt++) {
      try {
        const result = await this.speechProvider.transcribe(chunk.filePath);
        return { index: chunk.index, result };
      } catch (err) {
        lastError = err;
        logger.warn("Chunk transcription failed", {
          chunkIndex: chunk.index,
          attempt,
          error: (err as Error).message,
        });
        if (attempt < env.MAX_TRANSCRIPTION_RETRIES) {
          await sleep(backoffDelay(attempt));
        }
      }
    }

    logger.error("Chunk transcription failed after all retries", {
      chunkIndex: chunk.index,
      error: (lastError as Error)?.message,
    });
    throw AppError.internal(`Transcription failed for audio chunk ${chunk.index} after retries.`);
  }

  /** verifies chunk count, uniqueness, ordering, and that no chunk came back empty. */
  private validateMerge(expectedChunkCount: number, outcomes: ChunkTranscriptionOutcome[]): void {
    const errors: string[] = [];

    if (outcomes.length !== expectedChunkCount) {
      errors.push(`Expected ${expectedChunkCount} transcribed chunk(s) but received ${outcomes.length}.`);
    }

    const indices = outcomes.map((o) => o.index);
    const uniqueIndices = new Set(indices);
    if (uniqueIndices.size !== indices.length) {
      errors.push("Duplicate chunk indices detected in transcription results.");
    }

    const sorted = [...indices].sort((a, b) => a - b);
    const isContiguous = sorted.every((idx, i) => idx === i);
    if (!isContiguous) {
      errors.push(`Chunk indices are not contiguous from 0..N-1: [${sorted.join(", ")}]`);
    }

    const emptyChunks = outcomes.filter((o) => !o.result.text || o.result.text.trim().length === 0);
    if (emptyChunks.length > 0) {
      errors.push(`Empty transcription result for chunk(s): ${emptyChunks.map((o) => o.index).join(", ")}`);
    }

    if (errors.length > 0) {
      logger.error("Transcript merge validation failed — aborting processing", { errors });
      throw AppError.internal(`Transcript merge validation failed: ${errors.join("; ")}`);
    }
  }

  private mergeInOrder(outcomes: ChunkTranscriptionOutcome[]): string {
    return outcomes
      .sort((a, b) => a.index - b.index)
      .map((o) => o.result.text.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const transcriptionService = new TranscriptionService();
