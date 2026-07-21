import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 5 — Weak Area Detection & Revision Planner.
// Pure data-shape types for the LangGraph revision workflow. No business
// logic lives here — mirrors the convention set by interview.types.ts.
// ─────────────────────────────────────────────────────────────────────────

/**
 * One weak topic identified by AnalyzeWeakAreasNode. Pure arithmetic over
 * already-stored InterviewAnswer evaluations — never touches the LLM.
 * `priority` is 1-based, 1 = most urgent to revise.
 */
export interface WeakTopicItem {
  topic: string;
  missedCount: number; // times this topic appeared in a question's missingTopics
  lowScoreCount: number; // times a question on this topic scored below the low-score threshold
  averageScore: number | null; // average overallScore across questions touching this topic
  priority: number;
}

/** One note retrieved for a weak topic via RetrievalService (RAG). */
export interface RelatedKnowledgeItem {
  knowledgeId: string;
  title: string;
  heading: string | null;
  section: string | null;
  similarity: number;
}

/** Notes retrieved for a single weak topic, grouped for the frontend's
 *  "Open Related Notes" action. */
export interface TopicKnowledge {
  topic: string;
  notes: RelatedKnowledgeItem[];
}

// ─────────────────────────────────────────────────────────────────────────
// AI structured output contract for the Revision Plan node — mirrors the
// generate/validate/retry pattern used by generatedQuestionSchema /
// answerEvaluationSchema. The LLM only produces the structured priority
// list; the markdown itself is deterministically rendered from it.
// ─────────────────────────────────────────────────────────────────────────
export const revisionPriorityItemSchema = z.object({
  topic: z.string().min(1),
  reason: z.string().min(1),
  suggestedRevision: z.string().min(1),
});
export type RevisionPriorityItem = z.infer<typeof revisionPriorityItemSchema>;

export const revisionPlanSchema = z.object({
  priorities: z.array(revisionPriorityItemSchema).min(1),
});
export type GeneratedRevisionPlanPayload = z.infer<typeof revisionPlanSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Persisted / API response shape (RevisionPlan model, reshaped).
// ─────────────────────────────────────────────────────────────────────────
export interface RevisionPlanResult {
  interviewId: string;
  weakTopics: WeakTopicItem[];
  priorityList: RevisionPriorityItem[];
  planMarkdown: string;
  relatedNotes: TopicKnowledge[];
  generatedAt: string;
}

export interface WeakAreasResult {
  interviewId: string;
  weakTopics: WeakTopicItem[];
}
