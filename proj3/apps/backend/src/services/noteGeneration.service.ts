import { aiService } from "./ai.service";
import { noteValidatorService } from "./noteValidator.service";
import { buildNoteGenerationPrompt, NOTE_GENERATION_PROMPT_VERSION } from "../prompts";
import { generatedNotesSchema, GeneratedNotesPayload, NoteSection } from "../types";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { splitTextByCharBudget } from "../utils/textSegmentation";

const MAX_RETRIES = 1; // generate -> validate -> (fail) -> retry once -> store or fail
const GENERATION_MAX_TOKENS = 8192;

/**
 * Conservative input budget per note-generation call, in characters.
 * Unlike CLEANING_MAX_TOKENS (which only bounds output), a lecture
 * transcript is fed in as INPUT here, and the smallest model this
 * pipeline can be pointed at (AI_PROVIDER=groq) may have a context
 * window well under gpt-4.1's. ~15k tokens (~60k chars at a
 * pessimistic 4 chars/token for English prose) leaves comfortable room
 * for the system prompt + JSON schema description + up to
 * GENERATION_MAX_TOKENS of output inside even a 32k-token context,
 * while still keeping most real lecture transcripts (a dense 2-hour
 * technical talk is roughly 15-20k words / ~90-110k chars) to just a
 * couple of segments rather than dozens.
 */
const SAFE_TRANSCRIPT_CHARS = 60_000;

export class NoteGenerationService {
  /**
   * Long transcripts are split into SAFE_TRANSCRIPT_CHARS-sized segments
   * (same splitter the cleaning stage uses) so a single call never risks
   * overflowing the model's context — the same problem the cleaning
   * stage solves on its output side, solved here on the input side.
   * Each segment goes through the full generate -> validate -> retry
   * loop independently, then the segment results are merged into one
   * document and validated again as a whole.
   */
  async generate(cleanTranscript: string, jobId: string): Promise<GeneratedNotesPayload> {
    const segments = splitTextByCharBudget(cleanTranscript, SAFE_TRANSCRIPT_CHARS);

    if (segments.length === 1) {
      return this.generateForSegment(segments[0], jobId);
    }

    logger.info("Transcript exceeds single-call budget, generating notes in segments", {
      jobId,
      segmentCount: segments.length,
    });

    const segmentResults: GeneratedNotesPayload[] = [];
    for (let i = 0; i < segments.length; i++) {
      segmentResults.push(await this.generateForSegment(segments[i], jobId, { index: i, total: segments.length }));
    }

    const merged = this.mergeSegments(segmentResults);

    const result = noteValidatorService.validate(merged);
    if (!result.valid) {
      logger.error("Merged multi-segment notes failed validation", { jobId, errors: result.errors });
      throw AppError.internal(`Merged note generation failed validation: ${result.errors.join("; ")}`);
    }

    return merged;
  }

  /**
   * Generate -> validate -> retry once on failure -> store, for a
   * single transcript segment (which may be the whole transcript when
   * it already fits in one call).
   */
  private async generateForSegment(
    transcriptSegment: string,
    jobId: string,
    partInfo?: { index: number; total: number }
  ): Promise<GeneratedNotesPayload> {
    let feedback: string[] | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { system, user } = buildNoteGenerationPrompt(transcriptSegment, feedback, partInfo);

      const completion = await aiService.complete(user, {
        systemPrompt: system,
        temperature: 0.3,
        maxTokens: GENERATION_MAX_TOKENS,
        jsonMode: true,
        jobId,
        stage: "GENERATING_NOTES",
      });

      // Mirrors the same check transcriptCleaning.service.ts does: a
      // truncated response can still be non-empty (valid-looking JSON
      // prefix), so a naive JSON.parse failure is often the only signal
      // — check finishReason directly so truncation is diagnosed as
      // truncation instead of being misreported as "invalid JSON" and
      // burning a retry on a problem the schema can't fix.
      if (completion.finishReason === "length") {
        logger.error("Note generation response was truncated by maxTokens", {
          jobId,
          attempt,
          partIndex: partInfo?.index,
          partTotal: partInfo?.total,
        });
        throw AppError.internal(
          `Note generation was truncated${
            partInfo ? ` (part ${partInfo.index + 1}/${partInfo.total})` : ""
          } — output exceeded the token limit.`
        );
      }

      const parsed = this.parseJson(completion.content);
      if (!parsed.success) {
        logger.warn("Note generation returned invalid JSON, retrying", { jobId, attempt, error: parsed.error });
        feedback = [`Response was not valid JSON matching the schema: ${parsed.error}`];
        continue;
      }

      const result = noteValidatorService.validate(parsed.data);
      if (result.valid) {
        return parsed.data;
      }

      logger.warn("Note validation failed, retrying", { jobId, attempt, errors: result.errors });
      feedback = result.errors;
    }

    throw AppError.internal(`Note generation failed validation after ${MAX_RETRIES + 1} attempt(s).`);
  }

  /**
   * Combines per-segment notes into one document. Sections are merged
   * by heading (case-insensitive) rather than concatenated verbatim —
   * each segment independently produces headings like "Core Concepts",
   * and keeping every copy would both duplicate the heading (which
   * noteValidatorService explicitly rejects) and fragment content that
   * belongs together into separate blocks.
   */
  private mergeSegments(segmentResults: GeneratedNotesPayload[]): GeneratedNotesPayload {
    const first = segmentResults[0];

    const sections: NoteSection[] = [];
    const sectionIndexByHeading = new Map<string, number>();
    for (const segment of segmentResults) {
      for (const section of segment.sections) {
        const key = section.heading.trim().toLowerCase();
        const existingIndex = sectionIndexByHeading.get(key);
        if (existingIndex === undefined) {
          sectionIndexByHeading.set(key, sections.length);
          sections.push({ heading: section.heading, content: section.content });
        } else {
          sections[existingIndex] = {
            heading: sections[existingIndex].heading,
            content: `${sections[existingIndex].content}\n\n${section.content}`,
          };
        }
      }
    }

    const interviewQuestions = dedupePreservingOrder(segmentResults.flatMap((s) => s.interviewQuestions ?? []));
    const keyTakeaways = dedupePreservingOrder(segmentResults.flatMap((s) => s.keyTakeaways ?? []));

    // Distinct segment summaries strung together, rather than only
    // keeping the first segment's — later segments cover material the
    // first segment's summary has no way to describe.
    const summary = dedupePreservingOrder(segmentResults.map((s) => s.summary.trim())).join(" ");

    const markdown = this.assembleMarkdown(first.title, sections, interviewQuestions, keyTakeaways);

    return {
      title: first.title,
      summary,
      sections,
      interviewQuestions,
      keyTakeaways,
      markdown,
    };
  }

  /**
   * Rebuilds the final markdown from the merged structured fields
   * rather than concatenating each segment's raw markdown blob — the
   * latter would produce multiple "# Title" headers and duplicated
   * Overview/Interview Questions/Key Takeaways sections, one per
   * segment.
   *
   * Note: `summary` is NOT re-injected as its own "## Overview" block
   * here — every segment's `sections` array already contains an actual
   * "Overview" entry (required by the prompt schema), and mergeSegments
   * already folds those into one merged "Overview" section. Adding a
   * second, separately-worded Overview block from the top-level
   * `summary` field would duplicate the heading in the rendered
   * markdown even though it wouldn't trip the sections-array duplicate
   * check (that check only scans `sections`, not raw markdown text).
   */
  private assembleMarkdown(
    title: string,
    sections: NoteSection[],
    interviewQuestions: string[],
    keyTakeaways: string[]
  ): string {
    const parts: string[] = [`# ${title}`];

    for (const section of sections) {
      parts.push(`## ${section.heading}\n\n${section.content}`);
    }

    if (interviewQuestions.length > 0) {
      parts.push(`## Interview Questions\n\n${interviewQuestions.map((q) => `- ${q}`).join("\n")}`);
    }

    if (keyTakeaways.length > 0) {
      parts.push(`## Key Takeaways\n\n${keyTakeaways.map((t) => `- ${t}`).join("\n")}`);
    }

    return parts.join("\n\n");
  }

  private parseJson(
    raw: string
  ): { success: true; data: GeneratedNotesPayload } | { success: false; error: string } {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      const result = generatedNotesSchema.safeParse(json);
      if (!result.success) {
        return { success: false, error: result.error.message };
      }
      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  get promptVersion(): string {
    return NOTE_GENERATION_PROMPT_VERSION;
  }
}

/** Dedupes strings case/whitespace-insensitively while keeping first-seen order and original casing. */
function dedupePreservingOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export const noteGenerationService = new NoteGenerationService();