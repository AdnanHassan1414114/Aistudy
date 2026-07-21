import { knowledgeChunkRepository, knowledgeRepository } from "../repositories";
import { chunkMarkdownNotes } from "../utils/chunking";
import { embeddingService } from "./embedding.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";

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

    const chunks = chunkMarkdownNotes(knowledge.notes);
    if (chunks.length === 0) {
      log.warn("Chunking produced zero chunks; skipping index");
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

    log.info("Knowledge indexed for RAG", { chunkCount: stored, embeddingModel: env.EMBEDDING_MODEL });
    return { chunkCount: stored };
  }
}

export const knowledgeIndexingService = new KnowledgeIndexingService();
