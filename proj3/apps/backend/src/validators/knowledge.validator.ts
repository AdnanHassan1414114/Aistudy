import { z } from "zod";
import { isValidYouTubeUrl } from "../utils/youtubeUrl";

export const createKnowledgeSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .min(1, "youtubeUrl is required")
    .refine(isValidYouTubeUrl, "Must be a valid YouTube video URL"),
});

export const updateKnowledgeNotesSchema = z.object({
  notes: z.string().min(1, "notes cannot be empty"),
  editedBy: z.string().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid("Invalid id format"),
});

export const knowledgeListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type CreateKnowledgeInput = z.infer<typeof createKnowledgeSchema>;
export type UpdateKnowledgeNotesInput = z.infer<typeof updateKnowledgeNotesSchema>;
export type KnowledgeListQuery = z.infer<typeof knowledgeListQuerySchema>;
