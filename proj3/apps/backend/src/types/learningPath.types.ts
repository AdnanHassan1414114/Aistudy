// ─────────────────────────────────────────────────────────────────────────
// Milestone 7 — Personalized Learning Path.
// Pure data-shape types for the LangGraph learning-path workflow. No
// business logic lives here — mirrors the convention set by
// revision.types.ts. Steps are built deterministically (simple
// priority-based ordering over the existing RevisionPlan) — there is no
// LLM call and no new recommendation algorithm.
// ─────────────────────────────────────────────────────────────────────────
import { RelatedKnowledgeItem } from "./revision.types";

/** The four step kinds a learning path can contain, in the order they're
 *  produced for each weak topic, with a single closing retake-interview
 *  step at the end. */
export type LearningPathStepType = "REVIEW_TOPIC" | "READ_NOTES" | "ASK_CHAT" | "RETAKE_INTERVIEW";

/** One step in the path. `priority` mirrors the WeakTopicItem.priority it
 *  was built from (1 = most urgent); the closing RETAKE_INTERVIEW step
 *  carries the lowest priority so it always sorts/renders last. */
export interface LearningPathStep {
  stepNumber: number;
  type: LearningPathStepType;
  title: string;
  description: string;
  priority: number;
  topic: string | null;
  relatedNotes: RelatedKnowledgeItem[];
}

// ─────────────────────────────────────────────────────────────────────────
// Persisted / API response shape (LearningPath model, reshaped).
// ─────────────────────────────────────────────────────────────────────────
export interface LearningPathResult {
  interviewId: string;
  steps: LearningPathStep[];
  generatedAt: string;
}
