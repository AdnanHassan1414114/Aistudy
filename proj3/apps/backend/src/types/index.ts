import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// BullMQ job payload
// ─────────────────────────────────────────────────────────────────────────
export interface ProcessLectureJobPayload {
  processingJobId: string;
  knowledgeId: string;
  youtubeUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────
// AI note-generation structured output contract (validated with Zod)
// ─────────────────────────────────────────────────────────────────────────
export const noteSectionSchema = z.object({
  heading: z.string().min(1),
  content: z.string().min(1),
});

export type NoteSection = z.infer<typeof noteSectionSchema>;

export const generatedNotesSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(noteSectionSchema).min(1),
  interviewQuestions: z.array(z.string()).default([]),
  keyTakeaways: z.array(z.string()).default([]),
  markdown: z.string().min(1),
});

export type GeneratedNotesPayload = z.infer<typeof generatedNotesSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Milestone 2 — RAG chat types
// ─────────────────────────────────────────────────────────────────────────
export * from "./chat.types";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 3 — Interview Engine types
// ─────────────────────────────────────────────────────────────────────────
export * from "./interview.types";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 5 — Weak Area Detection & Revision Planner types
// ─────────────────────────────────────────────────────────────────────────
export * from "./revision.types";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 6 — Intelligent Learning Agent types
// ─────────────────────────────────────────────────────────────────────────
export * from "./learningAgent.types";

// ─────────────────────────────────────────────────────────────────────────
// Milestone 7 — Personalized Learning Path types
// ─────────────────────────────────────────────────────────────────────────
export * from "./learningPath.types";