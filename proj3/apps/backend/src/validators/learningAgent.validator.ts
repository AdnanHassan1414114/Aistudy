import { z } from "zod";

export const learningAgentRequestSchema = z.object({
  message: z.string().trim().min(1, "message is required").max(2000),
  conversationId: z.string().uuid().optional(),
  interviewId: z.string().uuid().optional(),
});
export type LearningAgentRequestInput = z.infer<typeof learningAgentRequestSchema>;
