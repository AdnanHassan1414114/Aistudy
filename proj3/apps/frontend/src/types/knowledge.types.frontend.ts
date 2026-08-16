// Mirrors apps/backend/prisma/schema.prisma (Knowledge, ProcessingJob,
// KnowledgeVersion) and apps/backend/src/constants/jobStatus.ts.
// Frontend-only presentation types -- no logic, just the response shape.

export type KnowledgeStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type JobStep =
  | "QUEUED"
  | "DOWNLOADING_AUDIO"
  | "OPTIMIZING_AUDIO"
  | "SPLITTING_AUDIO"
  | "TRANSCRIBING"
  | "MERGING_TRANSCRIPT"
  | "CLEANING_TRANSCRIPT"
  | "GENERATING_NOTES"
  | "VALIDATING_NOTES"
  | "SAVING_KNOWLEDGE"
  | "CLEANING_TEMP_FILES"
  | "COMPLETED"
  | "FAILED";

export interface Knowledge {
  id: string;
  title: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  thumbnail: string | null;
  channelName: string | null;
  channelUrl: string | null;
  description: string | null;
  duration: number | null;
  publishedAt: string | null;
  language: string | null;
  transcriptRaw: string | null;
  transcriptClean: string | null;
  notes: string | null;
  status: KnowledgeStatus;
  processingTime: number | null;
  version: number;
  category: string | null;
  origin: "LECTURE" | "CHAT_SAVE";
  /** When RAG indexing (chunk + embed + store) last succeeded/failed.
   *  `status === "COMPLETED"` only means the lecture pipeline finished --
   *  it says nothing about whether these notes are actually searchable
   *  in chat/interview retrieval, which is what these two track. Both
   *  null means indexing hasn't run yet. */
  indexedAt: string | null;
  indexingFailedAt: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  promptVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingJob {
  id: string;
  knowledgeId: string;
  status: JobStep;
  currentStep: JobStep;
  progressPercentage: number;
  retryCount: number;
  estimatedRemainingSeconds: number | null;
  workerId: string | null;
  executionTime: number | null;
  failureReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeVersion {
  id: string;
  knowledgeId: string;
  version: number;
  notes: string;
  editedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: KnowledgeStatus;
  sortBy?: "createdAt" | "updatedAt" | "title";
  sortOrder?: "asc" | "desc";
}