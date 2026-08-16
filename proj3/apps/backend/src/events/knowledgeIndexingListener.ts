import { JobStatus } from "@prisma/client";
import { jobEventBus, JobProgressEvent } from "./jobEvents";
import { knowledgeIndexingService } from "../services/knowledgeIndexing.service";
import { sleep, backoffDelay } from "../utils/retry";
import { logger } from "../utils/logger";

/**
 * Milestone 2 addition. Subscribes to the existing job-progress event bus
 * (unchanged from Milestone 1) and kicks off RAG indexing once a lecture
 * finishes processing. Fire-and-forget by design: indexing failures must
 * never fail or retry the Milestone 1 pipeline job itself, so the worker
 * file only needs one new import line — nothing about its logic changes.
 *
 * Previously a failed auto-index here was only ever logged: the Knowledge
 * row was already marked COMPLETED by the M1 pipeline, so a lecture could
 * finish processing successfully and still never become searchable in
 * chat/interview retrieval, with nothing anywhere (UI or DB) reflecting
 * that. knowledgeIndexingService now records indexedAt/indexingFailedAt
 * as real data the Knowledge Library UI can show, and a short retry here
 * (mirroring the retry pattern used elsewhere in this app for transient
 * failures) gives an embedding-provider blip a real chance to recover
 * before that failure is recorded at all.
 */
jobEventBus.on("job:*", (event: JobProgressEvent) => {
  if (event.status !== JobStatus.COMPLETED) return;

  void autoIndexWithRetry(event.knowledgeId);
});

async function autoIndexWithRetry(knowledgeId: string, maxRetries = 2): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const { chunkCount } = await knowledgeIndexingService.indexKnowledge(knowledgeId);
      logger.info("Auto-indexed newly completed knowledge for RAG", { knowledgeId, chunkCount });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) await sleep(backoffDelay(attempt));
    }
  }

  // All retries exhausted — knowledgeIndexingService has already recorded
  // indexingFailedAt, so this lecture will show as "not searchable yet"
  // in the Knowledge Library with a manual retry action available,
  // rather than silently disappearing from RAG results with no trace.
  logger.error("Auto-indexing failed for completed knowledge after retries", {
    knowledgeId,
    error: (lastError as Error)?.message,
  });
}

logger.info("Knowledge indexing listener registered");