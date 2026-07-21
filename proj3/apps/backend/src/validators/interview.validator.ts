import { InterviewDifficulty, InterviewStatus, InterviewType } from "@prisma/client";
import { z } from "zod";

export const startInterviewSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("QUICK"),
    message: z.string().trim().min(1, "message is required").max(300),
  }),
  z.object({
    mode: z.literal("CUSTOM"),
    topic: z.string().trim().min(1, "topic is required").max(200),
    difficulty: z.nativeEnum(InterviewDifficulty),
    interviewType: z.nativeEnum(InterviewType),
    numberOfQuestions: z.coerce.number().int().min(1).max(20),
  }),
]);
export type StartInterviewInput = z.infer<typeof startInterviewSchema>;

export const submitAnswerSchema = z.object({
  answer: z.string().trim().min(1, "answer is required").max(4000),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const interviewIdParamSchema = z.object({
  id: z.string().uuid("Invalid interview id"),
});

export const interviewListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.nativeEnum(InterviewStatus).optional(),
});
export type InterviewListQuery = z.infer<typeof interviewListQuerySchema>;
