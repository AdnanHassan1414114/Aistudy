// Mirrors apps/backend/src/types/revision.types.ts and the RevisionPlan
// Prisma model. Frontend-only presentation types -- no logic, just the
// response shape.

export interface WeakTopicItem {
  topic: string;
  missedCount: number;
  lowScoreCount: number;
  averageScore: number | null;
  priority: number;
}

export interface RelatedKnowledgeItem {
  knowledgeId: string;
  title: string;
  heading: string | null;
  section: string | null;
  similarity: number;
}

export interface TopicKnowledge {
  topic: string;
  notes: RelatedKnowledgeItem[];
}

export interface RevisionPriorityItem {
  topic: string;
  reason: string;
  suggestedRevision: string;
}

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
