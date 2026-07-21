// Mirrors apps/backend/src/types/learningPath.types.ts and the
// LearningPath Prisma model. Frontend-only presentation types -- no logic,
// just the response shape.
import type { RelatedKnowledgeItem } from "./revision";

export type LearningPathStepType = "REVIEW_TOPIC" | "READ_NOTES" | "ASK_CHAT" | "RETAKE_INTERVIEW";

export interface LearningPathStep {
  stepNumber: number;
  type: LearningPathStepType;
  title: string;
  description: string;
  priority: number;
  topic: string | null;
  relatedNotes: RelatedKnowledgeItem[];
}

export interface LearningPathResult {
  interviewId: string;
  steps: LearningPathStep[];
  generatedAt: string;
}
