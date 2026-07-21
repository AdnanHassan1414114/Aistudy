import { aiService } from "./ai.service";
import { buildCleaningPrompt, CLEANING_PROMPT_VERSION } from "../prompts";

export class TranscriptCleaningService {
  /** Cleans a raw transcript for readability without summarizing or losing content. */
  async clean(rawTranscript: string, jobId: string): Promise<string> {
    const { system, user } = buildCleaningPrompt(rawTranscript);

    const result = await aiService.complete(user, {
      systemPrompt: system,
      temperature: 0.2,
      maxTokens: 8192,
      jobId,
      stage: "CLEANING_TRANSCRIPT",
    });

    return result.content.trim();
  }

  get promptVersion(): string {
    return CLEANING_PROMPT_VERSION;
  }
}

export const transcriptCleaningService = new TranscriptCleaningService();
