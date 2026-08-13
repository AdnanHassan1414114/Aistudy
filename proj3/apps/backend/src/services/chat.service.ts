import { ConfidenceLevel, Conversation, Message, MessageRole, SourceBadge } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { retrievalService } from "./retrieval.service";
import { aiService } from "./ai.service";
import { buildExternalFallbackPrompt, buildPersonalKnowledgePrompt } from "../prompts";
import { calculateConfidence } from "../utils/confidence";
import { normalizeWhitespace, truncateText } from "../utils/text";
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
  private async getOrCreateConversation(    conversationId: string | undefined,
    knowledgeScope: string | null | undefined
  ): Promise<Conversation> {
    if (conversationId) {
      // Scoped by userId even though it's a single implicit user today —
      // findUnique-by-id-alone here is a latent IDOR: the day real auth
      // lands, any authenticated user could pass any conversationId and
      // read/continue someone else's chat. findFirst + userId keeps this
      // safe by construction instead of relying on someone remembering to
      // add the check later.
      const existing = await prisma.conversation.findFirst({
        where: { id: conversationId, userId: DEFAULT_USER_ID },
      });
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

  /** Default cap for `getConversationWithMessages` (used by the "open a
   *  conversation" endpoint). Without a cap, opening a very long-running
   *  conversation loads and renders every message it has ever had, in one
   *  request — no "load older messages" UI exists yet, so this is a
   *  partial fix: it stops the worst case (an ever-growing conversation
   *  getting slower to open every single time) without yet adding
   *  pagination controls to the UI. 200 is generous for normal chat use. */
  private static readonly RECENT_MESSAGES_LIMIT = 200;

  async getConversationWithMessages(
    conversationId: string,
    messageLimit: number = ChatService.RECENT_MESSAGES_LIMIT
  ): Promise<{ conversation: Conversation; messages: Message[] }> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: DEFAULT_USER_ID },
    });
    if (!conversation) throw AppError.notFound("Conversation not found.");
    const messages = await this.getRecentMessagesForConversation(conversationId, messageLimit);
    return { conversation, messages };
  }

  /** Fetches at most `limit` messages, newest-first under the hood so the
   *  cap keeps the *most recent* history, then returned oldest-first so
   *  callers can render them top-to-bottom without re-sorting. */
  private async getRecentMessagesForConversation(conversationId: string, limit: number): Promise<Message[]> {
    const recent = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return recent.reverse();
  }

  async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    return prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
  }

  /** Finds the USER message immediately preceding `message` in its
   *  conversation — a direct, targeted query rather than loading the
   *  whole (possibly paginated/capped) message list and scanning it, so
   *  "Save to Knowledge Base" keeps working correctly for a message deep
   *  in a long conversation regardless of `getConversationWithMessages`'s
   *  display cap above. */
  async getPrecedingUserMessage(message: Message): Promise<Message | null> {
    return prisma.message.findFirst({
      where: { conversationId: message.conversationId, role: MessageRole.USER, createdAt: { lt: message.createdAt } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMessage(messageId: string): Promise<Message> {
    const message = await prisma.message.findFirst({
      where: { id: messageId, conversation: { userId: DEFAULT_USER_ID } },
    });
    if (!message) throw AppError.notFound("Message not found.");
    return message;
  }

  /** Conversation only, no messages — used by callers (like "Save to
   *  Knowledge Base") that only need conversation-level fields such as
   *  `knowledgeScope`, without paying for a message fetch they don't need. */
  async getConversationById(conversationId: string): Promise<Conversation> {
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: DEFAULT_USER_ID },
    });
    if (!conversation) throw AppError.notFound("Conversation not found.");
    return conversation;
  }

  async markSaved(messageId: string): Promise<void> {
    await prisma.message.update({ where: { id: messageId }, data: { savedToKnowledge: true } });
  }

  /** Persists whatever content had already streamed to the client when
   *  generation was stopped mid-flight, so it isn't lost on reload. Best
   *  effort: the client is already gone by the time this runs, so a
   *  failure here just gets logged rather than surfaced anywhere. */
  private async persistStoppedMessage(conversationId: string, content: string): Promise<void> {
    try {
      await prisma.message.create({
        data: {
          conversationId,
          role: MessageRole.ASSISTANT,
          content,
          externalReason: "Generation was stopped before it finished.",
        },
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    } catch (err) {
      logger.error("Failed to persist stopped chat message", {
        conversationId,
        error: (err as Error).message,
      });
    }
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
        data: { title: truncateText(question, 60) },
      });
    }

    // The client may have already disconnected while we were persisting
    // the user message above — check before paying for an embedding call
    // and a pgvector search nobody will see the result of.
    if (signal?.aborted) return;

    // ── Retrieval ────────────────────────────────────────────────────────
    let retrieval;
    try {
      retrieval = await retrievalService.retrieve(question, { category: request.knowledgeScope, signal });
    } catch (err) {
      if (signal?.aborted) return; // cancelled, not a real retrieval failure
      log.error("Retrieval failed", { conversationId: conversation.id, error: (err as Error).message });
      handlers.onError("Vector search failed. Please try again.");
      return;
    }

    // Same check again before the (much more expensive) LLM call.
    if (signal?.aborted) return;

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
    let wasTruncated = false;

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
      // Prefer the provider's own final `content` when present — it's
      // built the same way as the accumulated deltas above and should
      // always match, but this guards against a provider whose returned
      // `result.content` legitimately diverges from what it streamed.
      fullContent = result.content || fullContent;
      // "length" means the provider cut the answer off to stay under
      // CHAT_MAX_TOKENS, not because it was actually finished — without
      // this check a truncated answer renders identically to a complete
      // one, with nothing telling the user more was on the way.
      wasTruncated = result.finishReason === "length";
    } catch (err) {
      if (signal?.aborted) {
        // The user clicked "Stop" (or navigated away) — this is not a
        // provider failure, so it must never be reported as one. Whatever
        // was already streamed to the client is persisted here so it
        // survives a reload/conversation switch instead of only existing
        // in the frontend's local, non-persisted "stopped" bubble.
        log.info("Chat generation stopped by client", {
          conversationId: conversation.id,
          partialLength: fullContent.length,
        });
        if (fullContent.trim()) {
          await this.persistStoppedMessage(conversation.id, fullContent);
        }
        return;
      }
      log.error("Chat completion failed", { conversationId: conversation.id, error: (err as Error).message });
      handlers.onError("The AI provider failed to respond. Please try again.");
      return;
    }

    if (!fullContent.trim()) {
      fullContent = EMPTY_ANSWER_FALLBACK;
      handlers.onDelta(fullContent);
    } else if (wasTruncated) {
      const notice = "\n\n*(This answer was cut off because it hit the response length limit.)*";
      fullContent += notice;
      handlers.onDelta(notice);
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