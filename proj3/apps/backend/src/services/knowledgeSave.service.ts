import { randomUUID } from "crypto";
import { Knowledge } from "@prisma/client";
import { aiService } from "./ai.service";
import { knowledgeIndexingService } from "./knowledgeIndexing.service";
import { knowledgeRepository, knowledgeChunkRepository } from "../repositories";
import { buildSaveToKnowledgePrompt } from "../prompts";
import { saveToKnowledgeSchema, SaveToKnowledgePayload } from "../types";
import { logger } from "../utils/logger";

export interface SaveExternalAnswerResult {
  knowledge: Knowledge;
  /** False when the Knowledge row was created but indexing (chunk + embed
   *  + store) failed — the note exists and is visible, but will NOT show
   *  up in any RAG search until it's reindexed. The caller must surface
   *  this rather than reporting a flat "saved successfully". */
  indexed: boolean;
  indexError?: string;
}

/**
 * Implements "External Answer -> Convert into structured notes -> Generate
 * Embeddings -> Store in PostgreSQL -> Store in pgvector -> Knowledge Base
 * Updated". Reuses aiService, knowledgeRepository and
 * knowledgeIndexingService rather than re-implementing any of them.
 */
export class KnowledgeSaveService {
  /**
   * `sourceMessageId`, when provided, makes this call idempotent under
   * concurrency: Knowledge.sourceMessageId has a unique DB constraint, so
   * two near-simultaneous save requests for the same message can't both
   * succeed in creating a row — the loser's unique-constraint violation is
   * caught below and the winner's already-created row is returned instead.
   * A message-ID-based fast-path check belongs at the controller layer
   * (avoids paying for the LLM conversion call at all in the common case);
   * this is the guarantee that holds even when that fast-path race loses.
   */
  async saveExternalAnswer(
    question: string,
    answer: string,
    category?: string | null,
    sourceMessageId?: string | null
  ): Promise<SaveExternalAnswerResult> {
    const structured = await this.convertToStructuredNotes(question, answer);

    const uniqueSuffix = randomUUID();
    let knowledge: Knowledge;
    try {
      knowledge = await knowledgeRepository.createCompletedFromChat({
        title: structured.title,
        youtubeVideoId: `chat-save-${uniqueSuffix}`,
        youtubeUrl: `internal://chat-save/${uniqueSuffix}`,
        notes: structured.markdown,
        category: category ?? null,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch (err) {
      if (sourceMessageId && isUniqueConstraintError(err)) {
        const existing = await knowledgeRepository.findBySourceMessageId(sourceMessageId);
        if (existing) {
          logger.info("Duplicate save-to-knowledge request; returning existing knowledge", {
            knowledgeId: existing.id,
            sourceMessageId,
          });
          // Whatever the winning concurrent request determined about
          // indexing isn't passed to us — check chunk count directly
          // rather than assuming it succeeded.
          const chunkCount = await knowledgeChunkRepository.countForKnowledge(existing.id);
          return { knowledge: existing, indexed: chunkCount > 0 };
        }
      }
      throw err;
    }

    try {
      await knowledgeIndexingService.indexKnowledge(knowledge.id);
      return { knowledge, indexed: true };
    } catch (err) {
      // The knowledge row is still valid/visible even if embedding
      // failed, but it must NOT be reported as fully saved — the caller
      // (chat.controller) is responsible for telling the user this note
      // isn't searchable yet and can offer a retry via
      // POST /chat/index/:knowledgeId.
      logger.error("Failed to index chat-saved knowledge", {
        knowledgeId: knowledge.id,
        error: (err as Error).message,
      });
      return { knowledge, indexed: false, indexError: (err as Error).message };
    }
  }

  private async convertToStructuredNotes(question: string, answer: string): Promise<SaveToKnowledgePayload> {
    const { system, user } = buildSaveToKnowledgePrompt(question, answer);

    const completion = await aiService.complete(user, {
      systemPrompt: system,
      temperature: 0.2,
      maxTokens: 2048,
      jsonMode: true,
    });

    try {
      const cleaned = completion.content.replace(/```json|```/g, "").trim();
      const parsed = saveToKnowledgeSchema.parse(JSON.parse(cleaned));
      return parsed;
    } catch (err) {
      logger.error("Failed to parse save-to-knowledge conversion", { error: (err as Error).message });
      // Fall back to a minimal but valid note rather than failing the save.
      return {
        title: question.slice(0, 80),
        markdown: `# ${question.slice(0, 80)}\n\n## Answer\n\n${answer}`,
      };
    }
  }
}

export const knowledgeSaveService = new KnowledgeSaveService();

/** Prisma unique-constraint violations surface as error code "P2002". */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}