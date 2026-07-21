import { z } from "zod";

export const jobListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum([
      "QUEUED",
      "DOWNLOADING_AUDIO",
      "OPTIMIZING_AUDIO",
      "TRANSCRIBING",
      "CLEANING_TRANSCRIPT",
      "GENERATING_NOTES",
      "VALIDATING_NOTES",
      "COMPLETED",
      "FAILED",
    ])
    .optional(),
});

export type JobListQuery = z.infer<typeof jobListQuerySchema>;
