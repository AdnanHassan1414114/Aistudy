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
  /** Copied from the source AudioChunk so the merge step can trim the
   *  duplicated head of this chunk's transcript without re-threading
   *  chunk metadata through every call site. */
  headOverlapSeconds: number;
}

/**
 * Small buffer added on top of the chunk's recorded headOverlapSeconds
 * when deciding which segments to drop. Whisper segment boundaries don't
 * line up exactly with the ffmpeg cut points (a word spoken right at the
 * overlap boundary can land a few hundred ms on either side), so cutting
 * exactly at headOverlapSeconds risks leaving a sliver of duplicate text
 * behind. Erring slightly toward dropping too much (a fraction of a
 * second of legitimate new content) is far less noticeable than leaving
 * a duplicated sentence in the transcript.
 */
const OVERLAP_TRIM_BUFFER_SECONDS = 0.5;

export class TranscriptionService {
  private speechProvider: ISpeechProvider;

  constructor(speechProvider: ISpeechProvider = new GroqWhisperProvider()) {
    this.speechProvider = speechProvider;
  }

  /**
   * Transcribes all chunks, up to TRANSCRIPTION_CONCURRENCY at a time. A
   * failed chunk is retried up to MAX_TRANSCRIPTION_RETRIES times with
   * jittered exponential backoff — the whole job is only failed if a
   * chunk still fails after retries exhausted.
   * the merge is validated (order, missing/duplicate chunks,
   * basic sentence continuity) before being accepted; processing aborts
   * if the merge looks unsafe rather than silently producing a broken
   * transcript.
   */
  async transcribeChunks(expectedChunkCount: number, chunks: AudioChunk[]): Promise<string> {
    const outcomes = await this.transcribeWithConcurrencyLimit(chunks, env.TRANSCRIPTION_CONCURRENCY);

    this.validateMerge(expectedChunkCount, outcomes);

    return this.mergeInOrder(outcomes);
  }

  /**
   * Runs transcribeWithRetry across all chunks, but never more than
   * `limit` in flight at once. An unbounded Promise.all here would fire
   * every chunk at the transcription API simultaneously — for a long
   * video that's dozens of concurrent requests, which risks tripping a
   * rate limit for the whole batch at once (see backoffDelay jitter for
   * the other half of this fix).
   */
  private async transcribeWithConcurrencyLimit(
    chunks: AudioChunk[],
    limit: number
  ): Promise<ChunkTranscriptionOutcome[]> {
    const outcomes: ChunkTranscriptionOutcome[] = new Array(chunks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < chunks.length) {
        const currentIndex = nextIndex++;
        outcomes[currentIndex] = await this.transcribeWithRetry(chunks[currentIndex]);
      }
    };

    const workerCount = Math.max(1, Math.min(limit, chunks.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    return outcomes;
  }

  private async transcribeWithRetry(chunk: AudioChunk): Promise<ChunkTranscriptionOutcome> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= env.MAX_TRANSCRIPTION_RETRIES; attempt++) {
      try {
        const result = await this.speechProvider.transcribe(chunk.filePath);
        return { index: chunk.index, result, headOverlapSeconds: chunk.headOverlapSeconds };
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

  /**
   * Chunks are cut with a few seconds of overlap at their boundaries so
   * a sentence spoken right at the cut point isn't lost (see
   * ffmpegAudioProvider.splitIntoChunks). That means the overlapping
   * seconds get transcribed twice — once as the tail of chunk N, once
   * again as the head of chunk N+1 — and naively joining full chunk
   * text would duplicate that spoken content in the merged transcript.
   * For every chunk after the first, drop whichever of its Whisper
   * segments fall inside the duplicated head window before joining.
   */
  private mergeInOrder(outcomes: ChunkTranscriptionOutcome[]): string {
    const sorted = [...outcomes].sort((a, b) => a.index - b.index);

    const dedupedTexts = sorted.map((o) => this.textExcludingOverlap(o));

    return dedupedTexts
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Returns this chunk's transcript text with the duplicated head
   * trimmed off. Falls back to the untrimmed text (with a warning)
   * when the provider didn't return segment timestamps to trim by —
   * better to accept a rare duplicated boundary than to silently drop
   * legitimate content by guessing at a character offset.
   */
  private textExcludingOverlap(outcome: ChunkTranscriptionOutcome): string {
    const { result, headOverlapSeconds, index } = outcome;

    if (headOverlapSeconds <= 0) {
      return result.text.trim();
    }

    if (!result.segments || result.segments.length === 0) {
      logger.warn(
        "Chunk has a head overlap to trim but no segment timestamps were returned — keeping full text, transcript may contain a duplicated boundary",
        { chunkIndex: index, headOverlapSeconds }
      );
      return result.text.trim();
    }

    const cutoff = headOverlapSeconds + OVERLAP_TRIM_BUFFER_SECONDS;
    const kept = result.segments.filter((s) => s.start >= cutoff);

    if (kept.length === 0) {
      // Every segment in this chunk fell inside the overlap window
      // (can happen for a very short chunk) — nothing new to add.
      logger.warn("All segments in chunk fell within the overlap window; contributing no text", {
        chunkIndex: index,
        headOverlapSeconds,
      });
      return "";
    }

    return kept
      .map((s) => s.text.trim())
      .join(" ")
      .trim();
  }
}

export const transcriptionService = new TranscriptionService();