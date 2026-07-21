import { aiService } from "./ai.service";
import { buildRevisionPlanPrompt } from "../prompts";
import { revisionPlanSchema, GeneratedRevisionPlanPayload, RevisionPriorityItem, WeakTopicItem } from "../types";
import { RetrievedChunk } from "../repositories";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";

const MAX_RETRIES = 1; // generate -> validate -> (fail) -> retry once -> store or fail

/** One weak topic's retrieved notes, still carrying chunk `content` — this
 *  is the internal (non-persisted) shape used only to ground the LLM
 *  prompt. What gets persisted/returned to the frontend (TopicKnowledge)
 *  deliberately drops `content` to keep the stored JSON small. */
export interface RetrievedTopicChunks {
  topic: string;
  chunks: RetrievedChunk[];
}

/**
 * Generates the structured priority list for the Revision Plan node.
 * Mirrors AnswerEvaluationService's generate/validate/retry loop exactly,
 * applied to revision-plan generation instead of answer evaluation.
 */
export class RevisionPlanGenerationService {
  async generate(params: {
    interviewId: string;
    topic: string;
    weakTopics: WeakTopicItem[];
    retrievedByTopic: RetrievedTopicChunks[];
  }): Promise<GeneratedRevisionPlanPayload> {
    const { interviewId, topic, weakTopics, retrievedByTopic } = params;

    const chunks = retrievedByTopic.flatMap((tk) =>
      tk.chunks.map((c) => ({
        topic: tk.topic,
        knowledgeTitle: c.knowledgeTitle,
        heading: c.heading,
        section: c.section,
        content: c.content,
      }))
    );

    let feedback: string | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const { system, user } = buildRevisionPlanPrompt({ topic, weakTopics, chunks });

      const completion = await aiService.complete(feedback ? `${user}\n\n(Note: ${feedback})` : user, {
        systemPrompt: system,
        temperature: env.REVISION_PLAN_TEMPERATURE,
        maxTokens: env.REVISION_PLAN_MAX_TOKENS,
        jsonMode: true,
      });

      const parsed = this.parseJson(completion.content);
      if (parsed.success) {
        return parsed.data;
      }

      logger.warn("Revision plan generation returned invalid JSON, retrying", {
        interviewId,
        attempt,
        error: parsed.error,
      });
      feedback = `Response was not valid JSON matching the schema: ${parsed.error}`;
    }

    throw AppError.internal(`Revision plan generation failed validation after ${MAX_RETRIES + 1} attempt(s).`);
  }

  /** Deterministically renders the LLM's structured priorities into the
   *  concise markdown structure the spec calls for (Priority N / Topic /
   *  Reason / Suggested Revision) — keeps formatting consistent regardless
   *  of what the LLM returns, and lets the frontend just render markdown. */
  renderMarkdown(priorities: RevisionPriorityItem[]): string {
    return priorities
      .map(
        (p, i) =>
          `### Priority ${i + 1}\n**Topic:** ${p.topic}\n**Reason:** ${p.reason}\n**Suggested Revision:** ${p.suggestedRevision}`
      )
      .join("\n\n");
  }

  private parseJson(
    raw: string
  ): { success: true; data: GeneratedRevisionPlanPayload } | { success: false; error: string } {
    try {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const json = JSON.parse(cleaned);
      const result = revisionPlanSchema.safeParse(json);
      if (!result.success) {
        return { success: false, error: result.error.message };
      }
      return { success: true, data: result.data };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const revisionPlanGenerationService = new RevisionPlanGenerationService();
