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

/** Cap on how many sub-questions a single query gets split into — bounds
 *  the extra embed+search calls a compound question triggers. */
const MAX_SUB_QUESTIONS = 4;

/**
 * Heuristic split of a compound question into independent sub-questions,
 * so a question naming several distinct topics doesn't collapse into one
 * blended embedding that's only close to whichever topic dominates it.
 * This is NOT real topic decomposition (no NLP/LLM call) — it only
 * catches the common textual patterns: multiple "?"-terminated questions,
 * semicolon-separated clauses, or 3+ clauses joined by "and". A single
 * coherent question (including one with one "and" in it) is intentionally
 * left untouched, since two-clause "and" is usually still one thought.
 */
export function splitIntoSubQuestions(question: string): string[] {
  const byQuestionMarks = question
    .split(/(?<=\?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byQuestionMarks.length > 1) return byQuestionMarks.slice(0, MAX_SUB_QUESTIONS);

  const bySemicolon = question
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (bySemicolon.length > 1) return bySemicolon.slice(0, MAX_SUB_QUESTIONS);

  const byAnd = question
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  // Require 3+ segments before treating "and" as a topic separator — a
  // single "X and Y" is normally still one coherent thought, not two
  // independent topics.
  if (byAnd.length >= 3) return byAnd.slice(0, MAX_SUB_QUESTIONS);

  return [question];
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
    const subQuestions = splitIntoSubQuestions(question);

    const chunks =
      subQuestions.length === 1
        ? await this.retrieveForSingleQuery(question, env.RAG_TOP_K, options)
        : await this.retrieveForMultipleTopics(subQuestions, options);

    const topSimilarity = chunks.length > 0 ? chunks[0].similarity : 0;
    const averageSimilarity =
      chunks.length > 0 ? chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length : 0;
    // Previously gated on topSimilarity alone: a single very-close chunk
    // could route into "personal knowledge" mode even when the rest of
    // the retrieved set was weak/off-topic (common on a multi-topic
    // question, where only one sub-topic actually has good notes). The
    // average must also clear a (deliberately lower) bar, so the mode
    // reflects the overall quality of what was retrieved, not just its
    // single best match.
    const meetsThreshold =
      chunks.length > 0 &&
      topSimilarity >= env.RAG_SIMILARITY_THRESHOLD &&
      averageSimilarity >= env.RAG_SIMILARITY_THRESHOLD * 0.6;

    logger.info("RAG retrieval completed", {
      subQuestionCount: subQuestions.length,
      retrievedChunks: chunks.length,
      topSimilarity,
      averageSimilarity,
      meetsThreshold,
    });

    return { chunks, topSimilarity, averageSimilarity, meetsThreshold };
  }

  private async retrieveForSingleQuery(
    query: string,
    topK: number,
    options: { category?: string | null; signal?: AbortSignal }
  ): Promise<RetrievedChunk[]> {
    const embedded = await embeddingService.embedQuery(query, options.signal);
    return knowledgeChunkRepository.similaritySearch(embedded.embedding, {
      topK,
      category: options.category ?? null,
    });
  }

  /**
   * One embed+search per detected sub-question, each capped to a fair
   * share of RAG_TOP_K (minimum 2, so a topic isn't starved down to a
   * single chunk), merged and deduped by chunk id (keeping the higher
   * similarity if the same chunk surfaces for more than one sub-question),
   * then re-sorted by similarity. This directly targets the case a single
   * whole-question embedding structurally cannot: a compound question
   * where each sub-topic needs its own nearest-neighbor search to be
   * found at all.
   */
  private async retrieveForMultipleTopics(
    subQuestions: string[],
    options: { category?: string | null; signal?: AbortSignal }
  ): Promise<RetrievedChunk[]> {
    const perTopicK = Math.max(2, Math.ceil(env.RAG_TOP_K / subQuestions.length));

    const results = await Promise.all(
      subQuestions.map((sq) => this.retrieveForSingleQuery(sq, perTopicK, options))
    );

    const byId = new Map<string, RetrievedChunk>();
    for (const chunkList of results) {
      for (const chunk of chunkList) {
        const existing = byId.get(chunk.id);
        if (!existing || chunk.similarity > existing.similarity) byId.set(chunk.id, chunk);
      }
    }

    // Slightly more than RAG_TOP_K so multiple genuinely distinct topics
    // each keep representation instead of all being squeezed back down to
    // the single-topic cap right after being found.
    const overallCap = env.RAG_TOP_K + subQuestions.length;
    return Array.from(byId.values())
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, overallCap);
  }
}

export const retrievalService = new RetrievalService();