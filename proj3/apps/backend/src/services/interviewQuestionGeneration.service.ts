import { Interview } from "@prisma/client";
import { aiService } from "./ai.service";
import { interviewQuestionValidatorService } from "./interviewQuestionValidator.service";
import { buildInterviewQuestionPrompt } from "../prompts";
import { generatedQuestionSchema, GeneratedQuestionPayload, PreviousQA } from "../types";
import { RetrievedChunk } from "../repositories";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";

const MAX_RETRIES = 1; // generate -> validate -> (fail) -> retry once -> store or fail

/**
 * Generate -> validate -> retry once on failure. Mirrors
 * NoteGenerationService's loop exactly, applied to a single interview
 * question instead of a full note document.
 */
export class InterviewQuestionGenerationService {
  async generateNext(
    interview: Interview,
    questionNumber: number,
    chunks: RetrievedChunk[],
    previousQA: PreviousQA[]
  ): Promise<GeneratedQuestionPayload> {
    let feedback: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { system, user } = buildInterviewQuestionPrompt({
        topic: interview.topic,
        difficulty: interview.difficulty,
        interviewType: interview.interviewType,
        questionNumber,
        totalQuestions: interview.totalQuestions,
        chunks: chunks.map((c) => ({
          knowledgeTitle: c.knowledgeTitle,
          heading: c.heading,
          section: c.section,
          content: c.content,
        })),
        previousQA,
      });

      const completion = await aiService.complete(feedback ? `${user}\n\n(Note: ${feedback})` : user, {
        systemPrompt: system,
        temperature: env.INTERVIEW_TEMPERATURE,
        maxTokens: env.INTERVIEW_MAX_TOKENS,
        jsonMode: true,
      });

      const parsed = this.parseJson(completion.content);
      if (!parsed.success) {
        logger.warn("Interview question generation returned invalid JSON, retrying", {
          interviewId: interview.id,
          attempt,
          error: parsed.error,
        });
        feedback = `Response was not valid JSON matching the schema: ${parsed.error}`;
        continue;
      }

      const result = interviewQuestionValidatorService.validate(parsed.data, previousQA);
      if (result.valid) {
        return parsed.data;
      }

      logger.warn("Interview question validation failed, retrying", {
        interviewId: interview.id,
        attempt,
        errors: result.errors,
      });
      feedback = result.errors.join(" ");
    }

    throw AppError.internal(`Interview question generation failed validation after ${MAX_RETRIES + 1} attempt(s).`);
  }

  private parseJson(
    raw: string
  ): { success: true; data: GeneratedQuestionPayload } | { success: false; error: string } {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      const result = generatedQuestionSchema.safeParse(json);
      if (!result.success) {
        return { success: false, error: result.error.message };
      }
      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const interviewQuestionGenerationService = new InterviewQuestionGenerationService();
