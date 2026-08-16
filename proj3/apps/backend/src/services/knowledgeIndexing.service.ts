import { knowledgeChunkRepository, knowledgeRepository } from "../repositories";
import { chunkMarkdownNotes } from "../utils/chunking";
import { embeddingService } from "./embedding.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { prisma } from "../database/prismaClient";

/**
 * Turns a Knowledge's `notes` markdown into embedded, searchable chunks.
 * Called automatically after the Milestone 1 pipeline completes (via the
 * job event bus — see events/knowledgeIndexingListener.ts) and available
 * on-demand for re-indexing or backfilling knowledge created before
 * Milestone 2 existed.
 */
export class KnowledgeIndexingService {
  async indexKnowledge(knowledgeId: string): Promise<{ chunkCount: number }> {
    const knowledge = await knowledgeRepository.findById(knowledgeId);
    if (!knowledge) throw AppError.notFound("Knowledge not found.");
    if (!knowledge.notes || knowledge.notes.trim().length === 0) {
      throw AppError.badRequest("Knowledge has no notes to index yet.");
    }

    const log = logger.child({ knowledgeId, scope: "knowledgeIndexing" });

    try {
      const chunks = chunkMarkdownNotes(knowledge.notes);
      if (chunks.length === 0) {
        log.warn("Chunking produced zero chunks; skipping index");
        // Zero chunks is a distinct outcome from a failure — nothing to
        // retry, and it shouldn't be reported as "indexing failed" (there
        // was no error, there's just no indexable content). Recorded as
        // indexed-with-zero-chunks rather than left unmarked either way.
        await prisma.knowledge.update({ where: { id: knowledgeId }, data: { indexedAt: new Date() } });
        return { chunkCount: 0 };
      }

      const embeddings = await embeddingService.embedChunks(chunks.map((c) => c.content));

      // Re-indexing (e.g. after a notes edit) replaces the previous chunk set.
      // Delete + insert run inside a single DB transaction so a failure here
      // rolls back the delete too — previously indexed chunks stay intact
      // rather than leaving the Knowledge unsearchable.
      const stored = await knowledgeChunkRepository.replaceForKnowledge(
        knowledgeId,
        chunks.map((c, i) => ({
          chunkIndex: c.chunkIndex,
          heading: c.heading,
          section: c.section,
          content: c.content,
          tokenCount: c.tokenCount,
          embedding: embeddings[i].embedding,
          embeddingModel: embeddings[i].model,
        }))
      );

      await prisma.knowledge.update({
        where: { id: knowledgeId },
        data: { indexedAt: new Date(), indexingFailedAt: null },
      });

      log.info("Knowledge indexed for RAG", { chunkCount: stored, embeddingModel: env.EMBEDDING_MODEL });
      return { chunkCount: stored };
    } catch (err) {
      // Record the failure as data, not just a log line — this is what
      // lets the Knowledge Library UI show "not searchable yet" instead
      // of silently presenting a fully-processed-looking lecture that
      // will never surface in chat/interview retrieval. The caller
      // (auto-index listener, or the manual reindex controller) decides
      // whether to retry; this always rethrows so neither caller can
      // mistake a failure for success.
      await prisma.knowledge
        .update({ where: { id: knowledgeId }, data: { indexingFailedAt: new Date() } })
        .catch(() => {
          // If even this write fails, the outer catch/log below is the
          // only remaining record — nothing further to do about it here.
        });
      log.error("Knowledge indexing failed", { error: (err as Error).message });
      throw err;
    }
  }
}

export const knowledgeIndexingService = new KnowledgeIndexingService();