import { JobStatus } from "@prisma/client";

export enum KnowledgeStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

// Ordered pipeline steps — used to compute progressPercentage.
export const PROCESSING_STEP_ORDER: JobStatus[] = [
  JobStatus.QUEUED,
  JobStatus.DOWNLOADING_AUDIO,
  JobStatus.OPTIMIZING_AUDIO,
  JobStatus.SPLITTING_AUDIO,
  JobStatus.TRANSCRIBING,
  JobStatus.MERGING_TRANSCRIPT,
  JobStatus.CLEANING_TRANSCRIPT,
  JobStatus.GENERATING_NOTES,
  JobStatus.VALIDATING_NOTES,
  JobStatus.SAVING_KNOWLEDGE,
  JobStatus.CLEANING_TEMP_FILES,
  JobStatus.COMPLETED,
];

export function progressForStep(step: JobStatus): number {
  const idx = PROCESSING_STEP_ORDER.indexOf(step);

  if (idx === -1) {
    return 0;
  }

  return Math.round((idx / (PROCESSING_STEP_ORDER.length - 1)) * 100);
}