import { randomUUID } from "crypto";
import { Knowledge } from "@prisma/client";
import { aiService } from "./ai.service";
import { knowledgeIndexingService } from "./knowledgeIndexing.service";
import { knowledgeRepository } from "../repositories";
import { buildSaveToKnowledgePrompt } from "../prompts";
import { saveToKnowledgeSchema, SaveToKnowledgePayload } from "../types";
import { logger } from "../utils/logger";

/**
 * Implements "External Answer -> Convert into structured notes -> Generate
 * Embeddings -> Store in PostgreSQL -> Store in pgvector -> Knowledge Base
 * Updated". Reuses aiService, knowledgeRepository and
 * knowledgeIndexingService rather than re-implementing any of them.
 */
export class KnowledgeSaveService {
  async saveExternalAnswer(question: string, answer: string, category?: string | null): Promise<Knowledge> {
    const structured = await this.convertToStructuredNotes(question, answer);

    const uniqueSuffix = randomUUID();
    const knowledge = await knowledgeRepository.createCompletedFromChat({
      title: structured.title,
      youtubeVideoId: `chat-save-${uniqueSuffix}`,
      youtubeUrl: `internal://chat-save/${uniqueSuffix}`,
      notes: structured.markdown,
      category: category ?? null,
    });

    try {
      await knowledgeIndexingService.indexKnowledge(knowledge.id);
    } catch (err) {
      // The knowledge row is still valid/visible even if embedding failed —
      // log and let a manual re-index endpoint recover it later.
      logger.error("Failed to index chat-saved knowledge", {
        knowledgeId: knowledge.id,
        error: (err as Error).message,
      });
    }

    return knowledge;
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
