import { JobStatus } from "@prisma/client";
import { jobEventBus, JobProgressEvent } from "./jobEvents";
import { knowledgeIndexingService } from "../services/knowledgeIndexing.service";
import { logger } from "../utils/logger";

/**
 * Milestone 2 addition. Subscribes to the existing job-progress event bus
 * (unchanged from Milestone 1) and kicks off RAG indexing once a lecture
 * finishes processing. Fire-and-forget by design: indexing failures must
 * never fail or retry the Milestone 1 pipeline job itself, so the worker
 * file only needs one new import line — nothing about its logic changes.
 */
jobEventBus.on("job:*", (event: JobProgressEvent) => {
  if (event.status !== JobStatus.COMPLETED) return;

  knowledgeIndexingService
    .indexKnowledge(event.knowledgeId)
    .then(({ chunkCount }) => {
      logger.info("Auto-indexed newly completed knowledge for RAG", {
        knowledgeId: event.knowledgeId,
        chunkCount,
      });
    })
    .catch((err) => {
      logger.error("Auto-indexing failed for completed knowledge", {
        knowledgeId: event.knowledgeId,
        error: (err as Error).message,
      });
    });
});

logger.info("Knowledge indexing listener registered");
