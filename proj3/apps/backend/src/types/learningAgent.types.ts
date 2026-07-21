import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 6 — Intelligent Learning Agent.
// Pure data-shape types for the LangGraph Learning Agent workflow. No
// business logic lives here — mirrors the convention set by revision.types.ts.
// The agent itself performs zero new business logic: it only classifies
// intent and dispatches to the already-existing Chat / Interview / Revision
// services.
// ─────────────────────────────────────────────────────────────────────────

/** The three (and only three) workflows the agent can route a request to. */
export const learningAgentIntentSchema = z.enum(["CHAT", "INTERVIEW", "REVISION"]);
export type LearningAgentIntent = z.infer<typeof learningAgentIntentSchema>;

/** Structured output contract for the lightweight intent-detection LLM
 *  call — mirrors the generate/validate pattern used elsewhere (e.g.
 *  generatedRevisionPlanPayload), just with a single-field payload. */
export const learningAgentIntentPayloadSchema = z.object({
  intent: learningAgentIntentSchema,
});
export type LearningAgentIntentPayload = z.infer<typeof learningAgentIntentPayloadSchema>;

/** POST /learning-agent request body. */
export interface LearningAgentRequestInput {
  message: string;
  conversationId?: string;
  interviewId?: string;
}

/** A reference surfaced back to the frontend. Chat/Interview nodes return
 *  flat KnowledgeReference[]; the Revision node returns TopicKnowledge[]
 *  (notes already grouped by weak topic). The agent doesn't reshape either
 *  — it passes through whatever the underlying service already returns. */
export type LearningAgentReference = Record<string, unknown>;

/** POST /learning-agent response payload. */
export interface LearningAgentResult {
  workflowSelected: LearningAgentIntent;
  response: string;
  references: LearningAgentReference[];
  conversationId: string | null;
  interviewId: string | null;
}
