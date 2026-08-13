import { z } from "zod";
import { isValidYouTubeUrl } from "../utils/youtubeUrl";

export const createKnowledgeSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .min(1, "youtubeUrl is required")
    .refine(isValidYouTubeUrl, "Must be a valid YouTube video URL"),
  // Optional at the type level, but the repository/DB column has always
  // accepted it (CreateKnowledgeData.category) — it just had no way to
  // reach that layer from this endpoint until now. Free-text like
  // Conversation.knowledgeScope rather than a hard enum, so the same
  // string on both sides is what makes chat's scope filter match a note.
  category: z.string().trim().min(1).max(50).optional(),
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