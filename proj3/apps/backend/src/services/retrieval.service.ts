import { knowledgeChunkRepository, RetrievedChunk } from "../repositories";
import { embeddingService } from "./embedding.service";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  topSimilarity: number;
  averageSimilarity: number;
  meetsThreshold: boolean;
}

/**
 * Question -> embedding -> pgvector -> top K -> threshold check. Scoping
 * to "the user's personal knowledge" is implicit for now (single-user, no
 * auth) — knowledgeChunkRepository.similaritySearch already restricts to
 * non-deleted, COMPLETED knowledge only.
 */
export class RetrievalService {
  async retrieve(
    question: string,
    options: { category?: string | null; signal?: AbortSignal } = {}
  ): Promise<RetrievalResult> {
    const embedded = await embeddingService.embedQuery(question, options.signal);

    const chunks = await knowledgeChunkRepository.similaritySearch(embedded.embedding, {
      topK: env.RAG_TOP_K,
      category: options.category ?? null,
    });

    const topSimilarity = chunks.length > 0 ? chunks[0].similarity : 0;
    const averageSimilarity =
      chunks.length > 0 ? chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length : 0;
    const meetsThreshold = chunks.length > 0 && topSimilarity >= env.RAG_SIMILARITY_THRESHOLD;

    logger.info("RAG retrieval completed", {
      retrievedChunks: chunks.length,
      topSimilarity,
      averageSimilarity,
      meetsThreshold,
    });

    return { chunks, topSimilarity, averageSimilarity, meetsThreshold };
  }
}

export const retrievalService = new RetrievalService();