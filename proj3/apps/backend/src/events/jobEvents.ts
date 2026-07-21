import { EventEmitter } from "events";
import { JobStatus } from "@prisma/client";

export interface JobProgressEvent {
  jobId: string;
  knowledgeId: string;
  status: JobStatus;
  currentStep: JobStatus;
  progressPercentage: number;
  failureReason?: string | null;
}

/**
 * Central emitter for processing-job lifecycle events. Publisher
 * (job.service.ts) and subscriber (events/knowledgeIndexingListener.ts)
 * both run inside the worker process, so this in-memory EventEmitter is
 * sufficient — it does not cross the API/worker process boundary.
 * Job progress for the frontend is served via polling GET /jobs/:id.
 */
class JobEventBus extends EventEmitter {
  emitProgress(event: JobProgressEvent): void {
    this.emit(`job:${event.jobId}`, event);
    this.emit("job:*", event);
  }
}

export const jobEventBus = new JobEventBus();
jobEventBus.setMaxListeners(0);
