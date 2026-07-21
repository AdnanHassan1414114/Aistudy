import { Queue } from "bullmq";
import { getRedisConnection } from "../config/redis";
import { QUEUE_NAMES } from "../constants";
import { ProcessLectureJobPayload } from "../types";

const JOB_RETRY_ATTEMPTS = 3;

export const processingQueue = new Queue<ProcessLectureJobPayload>(
  QUEUE_NAMES.KNOWLEDGE_PROCESSING,
  {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: JOB_RETRY_ATTEMPTS,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { age: 60 * 60 * 24 * 7 }, // 7 days
      removeOnFail: false,
    },
  }
);
