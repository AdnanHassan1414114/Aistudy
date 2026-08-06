import "dotenv/config";
import { Job, Worker } from "bullmq";
import os from "os";
import { JobStatus, KnowledgeStatus } from "@prisma/client";
import { getRedisConnection } from "../config/redis";
import { QUEUE_NAMES } from "../constants";
import { ProcessLectureJobPayload } from "../types";
import { logger } from "../utils/logger";
import { audioService } from "../services/audio.service";
import { transcriptionService } from "../services/transcription.service";
import { transcriptCleaningService } from "../services/transcriptCleaning.service";
import { noteGenerationService } from "../services/noteGeneration.service";
import { jobService } from "../services/job.service";
import { knowledgeRepository, processingJobRepository } from "../repositories";
import { jobEventBus } from "../events";
import { env } from "../config/env";
// Milestone 2: registers a listener that auto-indexes knowledge for RAG
// once processing completes. Purely additive — does not change anything
// about the pipeline above.
import "../events/knowledgeIndexingListener";

const WORKER_ID = `worker-${os.hostname()}-${process.pid}`;

async function processLecture(job: Job<ProcessLectureJobPayload>): Promise<void> {
  const { processingJobId, knowledgeId, youtubeUrl } = job.data;
  const startedAt = Date.now();
  let workspaceRoot: string | undefined;

  const log = logger.child({ processingJobId, knowledgeId });

  try {
    await processingJobRepository.markStarted(processingJobId, WORKER_ID, job.attemptsMade);
    await knowledgeRepository.updateStatus(knowledgeId, KnowledgeStatus.PROCESSING);

    // Error recovery: if a previous attempt already produced a cleaned
    // transcript, resume from there instead of redoing audio download,
    // optimization, and transcription from scratch.
    const existing = await knowledgeRepository.findById(knowledgeId, true);
    let transcriptRaw = existing?.transcriptRaw ?? null;
    let transcriptClean = existing?.transcriptClean ?? null;

    if (transcriptClean) {
      log.info("Resuming from previously cleaned transcript");
    } else {
      if (transcriptRaw) {
        // A prior attempt already paid for download + transcription but
        // failed during/after cleaning — resume from the saved raw
        // transcript instead of re-downloading and re-transcribing audio.
        log.info("Resuming from previously transcribed raw transcript, skipping audio pipeline");
      } else {
        await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.DOWNLOADING_AUDIO, "Downloading audio from YouTube");
        const workspace = await audioService.createJobWorkspace(processingJobId);
        workspaceRoot = workspace.root;
        // yt-dlp now downloads audio-only (never the video track) and applies
        // the mono/16kHz/loudnorm postprocessing in the same pass, so the
        // file it returns is already transcription-ready. No separate
        // OPTIMIZING_AUDIO ffmpeg pass is needed — that used to mean reading
        // the whole audio file back off disk and writing a second full copy
        // of it just to resample/normalize.
        const downloaded = await audioService.downloadAudio(youtubeUrl, workspace.root);

        await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.SPLITTING_AUDIO, "Splitting audio into chunks");
        const chunks = await audioService.splitIfNecessary(downloaded.filePath, workspace.chunks);

        await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.TRANSCRIBING, `Transcribing ${chunks.length} chunk(s)`);
        const rawTranscriptResult = await transcriptionService.transcribeChunks(chunks.length, chunks);

        if (!rawTranscriptResult || rawTranscriptResult.trim().length === 0) {
          throw new Error("Transcription produced empty output.");
        }
        transcriptRaw = rawTranscriptResult;

        await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.MERGING_TRANSCRIPT, "Merging transcript chunks");
        // Persisted immediately so a cleaning failure below doesn't force
        // a retry to redo the (expensive) audio download + transcription.
        await knowledgeRepository.updateTranscripts(knowledgeId, { transcriptRaw });
      }

      await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.CLEANING_TRANSCRIPT, "Cleaning transcript");
      transcriptClean = await transcriptCleaningService.clean(transcriptRaw as string, processingJobId);
      await knowledgeRepository.updateTranscripts(knowledgeId, { transcriptClean });
    }

    await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.GENERATING_NOTES, "Generating structured notes");
    const notes = await noteGenerationService.generate(transcriptClean, processingJobId);

    await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.VALIDATING_NOTES, "Notes validated");
    await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.SAVING_KNOWLEDGE, "Saving knowledge package");

    const processingTime = Date.now() - startedAt;
    await knowledgeRepository.completeProcessing(knowledgeId, {
      notes: notes.markdown,
      transcriptRaw: transcriptRaw as string,
      transcriptClean,
      processingTime,
      aiProvider: env.AI_PROVIDER,
      aiModel: env.OPENAI_MODEL,
      promptVersion: noteGenerationService.promptVersion,
    });
    await processingJobRepository.markCompleted(processingJobId, processingTime);

    await jobService.advanceStep(processingJobId, knowledgeId, JobStatus.CLEANING_TEMP_FILES, "Cleaning up temporary files");
    if (workspaceRoot) {
      await audioService.cleanup(workspaceRoot);
      workspaceRoot = undefined; // already cleaned, skip the finally block
    }

    jobEventBus.emitProgress({
      jobId: processingJobId,
      knowledgeId,
      status: JobStatus.COMPLETED,
      currentStep: JobStatus.COMPLETED,
      progressPercentage: 100,
    });

    log.info("Processing completed", { processingTimeMs: processingTime });
  } catch (err) {
    const message = (err as Error).message;
    log.error("Processing failed", { error: message });

    await jobService.logError(processingJobId, "PIPELINE", message);
    await processingJobRepository.markFailed(processingJobId, message);
    await knowledgeRepository.markFailed(knowledgeId);

    jobEventBus.emitProgress({
      jobId: processingJobId,
      knowledgeId,
      status: JobStatus.FAILED,
      currentStep: JobStatus.FAILED,
      progressPercentage: 0,
      failureReason: message,
    });

    throw err; // let BullMQ handle retry/backoff per queue defaultJobOptions
  } finally {
    // Cleanup must always run: success, thrown error, or a crash that lets
    // BullMQ pick the job back up. If the happy path already cleaned up,
    // workspaceRoot is cleared and this is a no-op.
    if (workspaceRoot) {
      await audioService.cleanup(workspaceRoot);
    }
  }
}

export const processingWorker = new Worker<ProcessLectureJobPayload>(
  QUEUE_NAMES.KNOWLEDGE_PROCESSING,
  processLecture,
  {
    connection: getRedisConnection(),
    concurrency: 2,
  }
);

processingWorker.on("completed", (job) => {
  logger.info("BullMQ job completed", { jobId: job.id });
});

processingWorker.on("failed", (job, err) => {
  logger.error("BullMQ job failed", { jobId: job?.id, error: err.message, attemptsMade: job?.attemptsMade });
});

logger.info(`Processing worker started (${WORKER_ID})`);