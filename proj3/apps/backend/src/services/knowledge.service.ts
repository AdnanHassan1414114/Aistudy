import { Knowledge } from "@prisma/client";
import { extractYouTubeVideoId, normalizeYouTubeUrl } from "../utils/youtubeUrl";
import {
  knowledgeRepository,
  knowledgeVersionRepository,
  KnowledgeListFilters,
} from "../repositories";
import { processingJobRepository } from "../repositories";
import { processingQueue } from "../queues";
import { JOB_NAMES } from "../constants";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";
import { PaginatedResult } from "../interfaces";
import { YtDlpVideoProvider } from "../providers";

export class KnowledgeService {
  private videoProvider = new YtDlpVideoProvider();

  /**
   * Entry point for POST /knowledge. Validates + normalizes the URL,
   * checks for an existing record (duplicate detection), fetches
   * metadata, creates the Knowledge + ProcessingJob rows, and enqueues
   * the background worker. Returns immediately — never blocks on the
   * pipeline itself.
   */
  async submitForProcessing(youtubeUrl: string): Promise<{ knowledgeId: string; jobId: string }> {
    const normalizedUrl = normalizeYouTubeUrl(youtubeUrl);
    if (!normalizedUrl) {
      throw AppError.badRequest("Invalid YouTube URL.");
    }

    const videoId = extractYouTubeVideoId(normalizedUrl)!;

    const existing = await knowledgeRepository.findByVideoId(videoId);
    if (existing && !existing.deletedAt) {
      const latestJob = await processingJobRepository.findLatestForKnowledge(existing.id);
      if (latestJob) {
        logger.info("Duplicate submission detected, returning existing job", { videoId });
        return { knowledgeId: existing.id, jobId: latestJob.id };
      }
    }

    const metadata = await this.videoProvider.fetchMetadata(normalizedUrl);

    const knowledgeData = {
      title: metadata.title,
      youtubeVideoId: metadata.videoId,
      youtubeUrl: normalizedUrl,
      thumbnail: metadata.thumbnail,
      channelName: metadata.channelName,
      channelUrl: metadata.channelUrl,
      description: metadata.description,
      duration: metadata.durationSeconds,
      publishedAt: metadata.publishedAt ? new Date(metadata.publishedAt) : null,
      language: metadata.language,
    };

    // `youtubeVideoId` is globally unique, so a soft-deleted row for the
    // same video would otherwise cause a Prisma unique constraint error
    // here. Reuse/restore it instead of creating a duplicate.
    const knowledge = existing?.deletedAt
      ? await knowledgeRepository.restoreForReprocessing(existing.id, knowledgeData)
      : await knowledgeRepository.create(knowledgeData);

    const job = await processingJobRepository.create(knowledge.id);

    await processingQueue.add(
      JOB_NAMES.PROCESS_LECTURE,
      { processingJobId: job.id, knowledgeId: knowledge.id, youtubeUrl: normalizedUrl },
      { jobId: job.id }
    );

    logger.info("Knowledge submitted for processing", { knowledgeId: knowledge.id, jobId: job.id });
    return { knowledgeId: knowledge.id, jobId: job.id };
  }

  async getById(id: string): Promise<Knowledge> {
    const knowledge = await knowledgeRepository.findById(id);
    if (!knowledge) throw AppError.notFound("Knowledge not found.");
    return knowledge;
  }

  /** Used by the frontend to show real (not placeholder) pipeline progress while processing. */
  async getLatestJob(id: string) {
    await this.getById(id);
    return processingJobRepository.findLatestForKnowledge(id);
  }

  async list(filters: KnowledgeListFilters): Promise<PaginatedResult<Knowledge>> {
    return knowledgeRepository.list(filters);
  }

  /** Updates notes and creates a new immutable version row. */
  async updateNotes(id: string, notes: string, editedBy?: string): Promise<Knowledge> {
    const knowledge = await this.getById(id);

    const latestVersion = await knowledgeVersionRepository.latestVersionNumber(id);
    // Seed version 1 from current notes on first-ever edit so history is complete.
    if (latestVersion === 0 && knowledge.notes) {
      await knowledgeVersionRepository.create({
        knowledgeId: id,
        version: 1,
        notes: knowledge.notes,
      });
    }

    const nextVersion = Math.max(latestVersion, 1) + 1;

    await knowledgeVersionRepository.create({
      knowledgeId: id,
      version: nextVersion,
      notes,
      editedBy: editedBy ?? null,
    });

    return knowledgeRepository.updateNotes(id, notes, nextVersion);
  }

  async listVersions(id: string) {
    await this.getById(id);
    return knowledgeVersionRepository.listForKnowledge(id);
  }

  /** restores a previous version's notes as a NEW version, preserving full history. */
  async restoreVersion(id: string, version: number): Promise<Knowledge> {
    await this.getById(id);

    const target = await knowledgeVersionRepository.findVersion(id, version);
    if (!target) throw AppError.notFound(`Version ${version} not found for this knowledge.`);

    return this.updateNotes(id, target.notes, "system:restore");
  }

  async softDelete(id: string): Promise<void> {
    await this.getById(id);
    await knowledgeRepository.softDelete(id);
  }

  async permanentDelete(id: string): Promise<void> {
    await this.getById(id);
    await knowledgeVersionRepository.deleteAllForKnowledge(id);
    await knowledgeRepository.permanentDelete(id);
  }
}

export const knowledgeService = new KnowledgeService();
