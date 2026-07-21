import { aiService } from "./ai.service";
import { noteValidatorService } from "./noteValidator.service";
import { buildNoteGenerationPrompt, NOTE_GENERATION_PROMPT_VERSION } from "../prompts";
import { generatedNotesSchema, GeneratedNotesPayload } from "../types";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";

const MAX_RETRIES = 1; // generate -> validate -> (fail) -> retry once -> store or fail

export class NoteGenerationService {
  /**
   * Generate -> validate -> retry once on failure -> store. Keeps the
   * loop simple and bounded rather than a multi-stage feedback system.
   */
  async generate(cleanTranscript: string, jobId: string): Promise<GeneratedNotesPayload> {
    let feedback: string[] | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { system, user } = buildNoteGenerationPrompt(cleanTranscript, feedback);

      const completion = await aiService.complete(user, {
        systemPrompt: system,
        temperature: 0.3,
        maxTokens: 8192,
        jsonMode: true,
        jobId,
        stage: "GENERATING_NOTES",
      });

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

export const noteGenerationService = new NoteGenerationService();
