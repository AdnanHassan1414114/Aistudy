import { aiService } from "./ai.service";
import { buildCleaningPrompt, CLEANING_PROMPT_VERSION } from "../prompts";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

/** Output cap sent to the AI provider for each cleaning call. */
const CLEANING_MAX_TOKENS = 8192;

/**
 * Conservative char budget per cleaning call. Cleaned output is roughly
 * the same length as its input (filler/greeting removal shaves some off,
 * but the prompt explicitly forbids summarizing), so a raw segment must
 * stay well under CLEANING_MAX_TOKENS worth of output or the response
 * gets cut off mid-transcript with no error — just a shorter string.
 * ~3.5 chars/token is a safe (i.e. slightly pessimistic) estimate for
 * English technical prose; the 0.6 factor leaves headroom for the model
 * occasionally expanding text (e.g. spelling out contractions).
 */
const SAFE_SEGMENT_CHARS = Math.floor(CLEANING_MAX_TOKENS * 3.5 * 0.6);

/** Below this cleaned/raw length ratio we just log — cleaning legitimately
 *  strips filler, greetings, and sponsor segments. */
const SHRINK_WARN_RATIO = 0.75;

/** Below this ratio the drop is no longer explainable by filler removal —
 *  treat it as the model summarizing (or truncating) despite instructions
 *  and fail the job rather than silently save lossy content. */
const SHRINK_FAIL_RATIO = 0.4;

export class TranscriptCleaningService {
  /** Cleans a raw transcript for readability without summarizing or losing content. */
  async clean(rawTranscript: string, jobId: string): Promise<string> {
    if (!rawTranscript || rawTranscript.trim().length === 0) {
      throw AppError.internal("Cannot clean an empty transcript.");
    }

    const segments = this.splitForCleaning(rawTranscript.trim());
    const cleanedSegments: string[] = [];

    for (let i = 0; i < segments.length; i++) {
      cleanedSegments.push(await this.cleanSegment(segments[i], jobId, i, segments.length));
    }

    const cleaned = cleanedSegments.join(" ").replace(/\s+/g, " ").trim();

    if (cleaned.length === 0) {
      throw AppError.internal("Transcript cleaning produced empty output.");
    }

    const ratio = cleaned.length / rawTranscript.trim().length;
    if (ratio < SHRINK_FAIL_RATIO) {
      logger.error("Cleaned transcript is disproportionately short — likely summarized or truncated", {
        jobId,
        rawChars: rawTranscript.length,
        cleanedChars: cleaned.length,
        ratio,
      });
      throw AppError.internal(
        `Transcript cleaning dropped too much content (${Math.round(ratio * 100)}% of original length remained).`
      );
    }
    if (ratio < SHRINK_WARN_RATIO) {
      logger.warn("Cleaned transcript shrank more than expected", {
        jobId,
        rawChars: rawTranscript.length,
        cleanedChars: cleaned.length,
        ratio,
      });
    }

    return cleaned;
  }

  /** Cleans a single segment and validates the provider didn't cut it off. */
  private async cleanSegment(segment: string, jobId: string, index: number, total: number): Promise<string> {
    const { system, user } = buildCleaningPrompt(segment);

    const result = await aiService.complete(user, {
      systemPrompt: system,
      temperature: 0.2,
      maxTokens: CLEANING_MAX_TOKENS,
      jobId,
      stage: "CLEANING_TRANSCRIPT",
    });

    if (result.finishReason === "length") {
      logger.error("Transcript cleaning response was truncated by maxTokens", {
        jobId,
        segmentIndex: index,
        segmentCount: total,
      });
      throw AppError.internal(
        `Transcript cleaning was truncated (segment ${index + 1}/${total}) — output exceeded the token limit.`
      );
    }

    const content = result.content.trim();
    if (content.length === 0) {
      throw AppError.internal(`Transcript cleaning returned empty output for segment ${index + 1}/${total}.`);
    }

    return content;
  }

  /**
   * Splits a raw transcript into segments that each stay within
   * SAFE_SEGMENT_CHARS, so no single cleaning call risks hitting the
   * output token cap. Splits on paragraph breaks first, falling back to
   * sentence boundaries for a single oversized paragraph — never mid-word,
   * so technical terms/commands aren't sliced apart.
   */
  private splitForCleaning(rawTranscript: string): string[] {
    if (rawTranscript.length <= SAFE_SEGMENT_CHARS) {
      return [rawTranscript];
    }

    const paragraphs = rawTranscript.split(/\n{2,}/).flatMap((p) => this.splitOversizedParagraph(p));

    const segments: string[] = [];
    let current = "";

    for (const paragraph of paragraphs) {
      const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
      if (candidate.length > SAFE_SEGMENT_CHARS && current) {
        segments.push(current);
        current = paragraph;
      } else {
        current = candidate;
      }
    }
    if (current.trim().length > 0) {
      segments.push(current);
    }

    return segments.length > 0 ? segments : [rawTranscript];
  }

  /** A transcript may have no paragraph breaks at all (one long run-on
   *  block from ASR) — fall back to splitting on sentence boundaries. */
  private splitOversizedParagraph(paragraph: string): string[] {
    if (paragraph.length <= SAFE_SEGMENT_CHARS) return [paragraph];

    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    const parts: string[] = [];
    let current = "";

    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > SAFE_SEGMENT_CHARS && current) {
        parts.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current.trim().length > 0) parts.push(current);

    return parts.length > 0 ? parts : [paragraph];
  }

  get promptVersion(): string {
    return CLEANING_PROMPT_VERSION;
  }
}

export const transcriptCleaningService = new TranscriptCleaningService();