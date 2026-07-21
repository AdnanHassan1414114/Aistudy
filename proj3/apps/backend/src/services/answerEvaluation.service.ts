import { aiService } from "./ai.service";
import { buildAnswerEvaluationPrompt } from "../prompts";
import { answerEvaluationSchema, AnswerEvaluationPayload } from "../types";
import { RetrievedChunk } from "../repositories";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";

const MAX_RETRIES = 1; // generate -> validate -> (fail) -> retry once -> store or fail

/**
 * Evaluates a single interview answer against retrieved notes only.
 * Mirrors InterviewQuestionGenerationService's generate/validate/retry
 * loop exactly, applied to answer evaluation instead of question
 * generation — never falls back to the LLM's general knowledge.
 */
export class AnswerEvaluationService {
  async evaluate(params: {
    interviewId: string;
    question: string;
    answer: string;
    chunks: RetrievedChunk[];
  }): Promise<AnswerEvaluationPayload> {
    const { interviewId, question, answer, chunks } = params;

    let feedback: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { system, user } = buildAnswerEvaluationPrompt({
        question,
        answer,
        chunks: chunks.map((c) => ({
          knowledgeTitle: c.knowledgeTitle,
          heading: c.heading,
          section: c.section,
          content: c.content,
        })),
      });

      const completion = await aiService.complete(feedback ? `${user}\n\n(Note: ${feedback})` : user, {
        systemPrompt: system,
        temperature: env.ANSWER_EVALUATION_TEMPERATURE,
        maxTokens: env.ANSWER_EVALUATION_MAX_TOKENS,
        jsonMode: true,
      });

      const parsed = this.parseJson(completion.content);
      if (parsed.success) {
        return parsed.data;
      }

      logger.warn("Answer evaluation returned invalid JSON, retrying", {
        interviewId,
        attempt,
        error: parsed.error,
      });
      feedback = `Response was not valid JSON matching the schema: ${parsed.error}`;
    }

    throw AppError.internal(`Answer evaluation failed validation after ${MAX_RETRIES + 1} attempt(s).`);
  }

  private parseJson(
    raw: string
  ): { success: true; data: AnswerEvaluationPayload } | { success: false; error: string } {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      const result = answerEvaluationSchema.safeParse(json);
      if (!result.success) {
        return { success: false, error: result.error.message };
      }
      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const answerEvaluationService = new AnswerEvaluationService();
