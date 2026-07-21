import { z } from "zod";

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1, "question is required").max(4000),
  conversationId: z.string().uuid().optional(),
  knowledgeScope: z.string().trim().min(1).optional(),
});
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;

export const saveAnswerSchema = z.object({
  messageId: z.string().uuid(),
});
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;

export const conversationListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const conversationIdParamSchema = z.object({
  id: z.string().uuid("Invalid conversation id"),
});

export const knowledgeIdParamSchema = z.object({
  knowledgeId: z.string().uuid("Invalid knowledge id"),
});
