import { ConfidenceLevel, Conversation, Message, MessageRole, SourceBadge } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { retrievalService } from "./retrieval.service";
import { aiService } from "./ai.service";
import { buildExternalFallbackPrompt, buildPersonalKnowledgePrompt } from "../prompts";
import { calculateConfidence } from "../utils/confidence";
import { normalizeWhitespace } from "../utils/text";
import { env } from "../config/env";
import { DEFAULT_USER_ID } from "../constants";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { AIStreamEvent, PaginatedResult } from "../interfaces";
import { KnowledgeReference } from "../types";

export interface ChatRequest {
  question: string;
  conversationId?: string;
  knowledgeScope?: string | null;
}

export interface ChatStreamHandlers {
  onDelta: (delta: string) => void;
  onDone: (summary: ChatAnswerSummary) => void;
  onError: (message: string) => void;
}

export interface ChatAnswerSummary {
  conversationId: string;
  messageId: string;
  sourceBadge: SourceBadge;
  confidence: ConfidenceLevel | null;
  topSimilarity: number;
  sourcesUsed: KnowledgeReference[];
  externalReason: string | null;
}

const EXTERNAL_REASON = "This topic was not found in your personal knowledge.";
const EMPTY_ANSWER_FALLBACK =
  "I wasn't able to generate an answer for that. Please try rephrasing your question.";

/**
 * Orchestrates the RAG chat flow: embed question -> search pgvector ->
 * enough relevant chunks? -> personal-knowledge answer OR external-AI
 * fallback -> persist -> stream tokens back to the caller.
 *
 * Conversation/Message persistence is plain single-table CRUD, so it's
 * inlined here via Prisma directly rather than behind a repository — the
 * part with real complexity (pgvector search) lives in RetrievalService /
 * KnowledgeChunkRepository instead.
 */
export class ChatService {
  private async getOrCreateConversation(
    conversationId: string | undefined,
    knowledgeScope: string | null | undefined
  ): Promise<Conversation> {
    if (conversationId) {
      const existing = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!existing) throw AppError.notFound("Conversation not found.");
      return existing;
    }
    return prisma.conversation.create({
      data: { userId: DEFAULT_USER_ID, knowledgeScope: knowledgeScope ?? null },
    });
  }

  async listConversations(page: number, pageSize: number): Promise<PaginatedResult<Conversation>> {
    const [items, totalItems] = await Promise.all([
      prisma.conversation.findMany({
        where: { userId: DEFAULT_USER_ID },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.conversation.count({ where: { userId: DEFAULT_USER_ID } }),
    ]);
    return { items, page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) };
  }

  async getConversationWithMessages(
    conversationId: string
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw AppError.notFound("Conversation not found.");
    const messages = await this.getMessagesForConversation(conversationId);
    return { conversation, messages };
  }

  async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    return prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  }

  async getMessage(messageId: string): Promise<Message> {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw AppError.notFound("Message not found.");
    return message;
  }

  async markSaved(messageId: string): Promise<void> {
    await prisma.message.update({ where: { id: messageId }, data: { savedToKnowledge: true } });
  }

  async streamAnswer(request: ChatRequest, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
    const question = normalizeWhitespace(request.question);
    if (!question) {
      handlers.onError("Question cannot be empty.");
      return;
    }

    const log = logger.child({ scope: "chat" });
    const startedAt = Date.now();

    let conversation: Conversation;
    try {
      conversation = await this.getOrCreateConversation(request.conversationId, request.knowledgeScope);
    } catch (err) {
      handlers.onError((err as AppError).message ?? "Failed to start conversation.");
      return;
    }

    await prisma.message.create({
      data: { conversationId: conversation.id, role: MessageRole.USER, content: question },
    });
    if (conversation.title === "New chat") {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { title: question.slice(0, 60) },
      });
    }

    // ── Retrieval ────────────────────────────────────────────────────────
    let retrieval;
    try {
      retrieval = await retrievalService.retrieve(question, { category: request.knowledgeScope });
    } catch (err) {
      log.error("Retrieval failed", { conversationId: conversation.id, error: (err as Error).message });
      handlers.onError("Vector search failed. Please try again.");
      return;
    }

    // Retrieval returning nothing is not an error — it's how the External
    // AI fallback gets triggered automatically.
    const usePersonalKnowledge = retrieval.meetsThreshold;

    const { system, user } = usePersonalKnowledge
      ? buildPersonalKnowledgePrompt(
          question,
          retrieval.chunks.map((c) => ({
            knowledgeTitle: c.knowledgeTitle,
            heading: c.heading,
            section: c.section,
            content: c.content,
          }))
        )
      : buildExternalFallbackPrompt(question);

    let fullContent = "";
    let usage: AIStreamEvent["usage"] | undefined;

    try {
      const result = await aiService.streamComplete(
        user,
        {
          systemPrompt: system,
          temperature: usePersonalKnowledge ? 0.1 : env.CHAT_TEMPERATURE,
          maxTokens: env.CHAT_MAX_TOKENS,
        },
        (event) => {
          if (event.delta) {
            fullContent += event.delta;
            handlers.onDelta(event.delta);
          }
          if (event.done) usage = event.usage;
        },
        signal
      );
      fullContent = result.content || fullContent;
    } catch (err) {
      log.error("Chat completion failed", { conversationId: conversation.id, error: (err as Error).message });
      handlers.onError("The AI provider failed to respond. Please try again.");
      return;
    }

    if (!fullContent.trim()) {
      fullContent = EMPTY_ANSWER_FALLBACK;
      handlers.onDelta(fullContent);
    }

    const sourceBadge = usePersonalKnowledge ? SourceBadge.PERSONAL_KNOWLEDGE : SourceBadge.EXTERNAL_AI;
    const confidence = usePersonalKnowledge
      ? calculateConfidence(retrieval.topSimilarity, retrieval.averageSimilarity)
      : null;
    const sourcesUsed: KnowledgeReference[] = usePersonalKnowledge
      ? retrieval.chunks.map((c) => ({
          knowledgeId: c.knowledgeId,
          title: c.knowledgeTitle,
          heading: c.heading,
          section: c.section,
          similarity: c.similarity,
        }))
      : [];
    const externalReason = usePersonalKnowledge ? null : EXTERNAL_REASON;

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.ASSISTANT,
        content: fullContent,
        sourceBadge,
        confidence,
        topSimilarity: retrieval.topSimilarity,
        knowledgeRefs: sourcesUsed as unknown as object,
        externalReason,
      },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    log.info("Chat answer generated", {
      conversationId: conversation.id,
      sourceBadge,
      confidence,
      retrievedChunks: retrieval.chunks.length,
      totalTokens: usage?.totalTokens ?? 0,
      processingTimeMs: Date.now() - startedAt,
    });

    handlers.onDone({
      conversationId: conversation.id,
      messageId: assistantMessage.id,
      sourceBadge,
      confidence,
      topSimilarity: retrieval.topSimilarity,
      sourcesUsed,
      externalReason,
    });
  }
}

export const chatService = new ChatService();
