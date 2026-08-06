import { JobStatus, LogLevel, ProcessingJob } from "@prisma/client";
import { processingJobRepository, processingLogRepository, aiUsageLogRepository } from "../repositories";
import { AppError } from "../utils/appError";
import { jobEventBus } from "../events";
import { progressForStep } from "../constants";
import { PaginatedResult, PaginationParams } from "../interfaces";

const STEP_TIME_ESTIMATES_SECONDS: Record<string, number> = {
  QUEUED: 5,
  DOWNLOADING_AUDIO: 30,
  // Optimization now happens inline during download (see
  // ytDlpVideoProvider), so this step is never actually run anymore.
  // Kept at 0 (rather than removed) so old completed jobs whose logs
  // still reference this step continue to resolve without special-casing.
  OPTIMIZING_AUDIO: 0,
  SPLITTING_AUDIO: 5,
  TRANSCRIBING: 60,
  MERGING_TRANSCRIPT: 3,
  CLEANING_TRANSCRIPT: 20,
  GENERATING_NOTES: 30,
  VALIDATING_NOTES: 5,
  SAVING_KNOWLEDGE: 2,
  CLEANING_TEMP_FILES: 2,
};

export class JobService {
  async getById(id: string): Promise<ProcessingJob> {
    const job = await processingJobRepository.findById(id);
    if (!job) throw AppError.notFound("Processing job not found.");
    return job;
  }

  async list(filters: PaginationParams & { status?: JobStatus }): Promise<PaginatedResult<ProcessingJob>> {
    return processingJobRepository.list(filters);
  }

  async getLogs(jobId: string) {
    await this.getById(jobId);
    return processingLogRepository.listForJob(jobId);
  }

  /** Returns which provider/model handled each AI call for this job — useful for debugging. */
  async getAiUsage(jobId: string) {
    await this.getById(jobId);
    return aiUsageLogRepository.listForJob(jobId);
  }

  /** Computes remaining time as the sum of estimated durations for all steps not yet reached. */
  estimateRemainingSeconds(currentStep: JobStatus): number {
    const order = Object.keys(STEP_TIME_ESTIMATES_SECONDS);
    const idx = order.indexOf(currentStep);
    if (idx === -1) return 0;
    return order.slice(idx + 1).reduce((sum, step) => sum + STEP_TIME_ESTIMATES_SECONDS[step], 0);
  }

  /**
   * Advances a job to a new step, persists it, logs the transition, and
   * publishes it on the event bus so the frontend can be notified.
   * This is the single choke point every worker stage calls through.
   */
  async advanceStep(
    jobId: string,
    knowledgeId: string,
    step: JobStatus,
    message: string
  ): Promise<void> {
    const progressPercentage = progressForStep(step);
    const estimatedRemainingSeconds = this.estimateRemainingSeconds(step);

    await processingJobRepository.updateProgress(jobId, {
      currentStep: step,
      status: step,
      progressPercentage,
      estimatedRemainingSeconds,
    });

    await processingLogRepository.create({
      jobId,
      step,
      message,
      level: LogLevel.INFO,
    });

    jobEventBus.emitProgress({
      jobId,
      knowledgeId,
      status: step,
      currentStep: step,
      progressPercentage,
    });
  }

  async logError(jobId: string, step: string, message: string): Promise<void> {
    await processingLogRepository.create({ jobId, step, message, level: LogLevel.ERROR });
  }
}

export const jobService = new JobService();