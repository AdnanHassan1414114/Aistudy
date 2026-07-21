import type { JobStep } from "../types/knowledge";

/** Condenses the backend's granular JobStep enum into the step vocabulary
 *  the Knowledge Detail page shows: Queued, Downloading, Optimizing,
 *  Transcribing, Cleaning, Generating Notes, Completed, Failed. */
export const JOB_STEP_LABEL: Record<JobStep, string> = {
  QUEUED: "Queued",
  DOWNLOADING_AUDIO: "Downloading",
  OPTIMIZING_AUDIO: "Optimizing",
  SPLITTING_AUDIO: "Optimizing",
  TRANSCRIBING: "Transcribing",
  MERGING_TRANSCRIPT: "Transcribing",
  CLEANING_TRANSCRIPT: "Cleaning",
  GENERATING_NOTES: "Generating notes",
  VALIDATING_NOTES: "Generating notes",
  SAVING_KNOWLEDGE: "Generating notes",
  CLEANING_TEMP_FILES: "Generating notes",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatEta(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 60) return `~${seconds}s remaining`;
  const m = Math.round(seconds / 60);
  return `~${m} min remaining`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}
