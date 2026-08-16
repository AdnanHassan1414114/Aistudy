import { ConfidenceLevel, Conversation, Message, MessageRole, MessageStatus, SourceBadge } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { retrievalService } from "./retrieval.service";
import { aiService } from "./ai.service";
import { buildContinuationPrompt, buildExternalFallbackPrompt, buildPersonalKnowledgePrompt } from "../prompts";
import { calculateConfidence } from "../utils/confidence";
import { normalizeWhitespace, truncateText } from "../utils/text";
import { sleep, backoffDelay } from "../utils/retry";
import { env } from "../config/env";
import { DEFAULT_USER_ID } from "../constants";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { AIStreamEvent, PaginatedResult } from "../interfaces";
import { KnowledgeReference, RetrievedContextChunk } from "../types";

export interface ChatRequest {
  question: string;
  conversationId?: string;
  knowledgeScope?: string | null;
  /** Required client-generated idempotency key (a fresh UUID per send). A
   *  retried request with the same key is rejected instead of creating a
   *  duplicate message pair — see the unique constraint on
   *  Message.clientRequestId. Required (not optional) precisely because an
   *  optional key gave zero protection to any caller that forgot to send
   *  one. */
  clientRequestId: string;
}

export interface ChatErrorOptions {
  /**
   * True when the failure happened AFTER a full answer was already
   * generated and streamed to the client (e.g. the DB save failed) —
   * the frontend must not discard what it already rendered, because the
   * generation itself succeeded. False/omitted for a genuine generation
   * failure, where there is nothing worth preserving.
   */
  preserveContent?: boolean;
}

export interface ChatStreamHandlers {
  onDelta: (delta: string) => void;
  onDone: (summary: ChatAnswerSummary) => void;
  onError: (message: string, options?: ChatErrorOptions) => void;
}

export interface ChatAnswerSummary {
  conversationId: string;
  messageId: string;
  sourceBadge: SourceBadge;
  confidence: ConfidenceLevel | null;
  topSimilarity: number;
  sourcesUsed: KnowledgeReference[];
  externalReason: string | null;
  /** True when `content` is the generic "couldn't generate an answer"
   *  placeholder, or when generation was interrupted mid-stream — the
   *  frontend uses this to hide "Save to Knowledge Base" and skip the
   *  confidence/source badges rather than presenting a non-answer as a
   *  grounded one. */
  isFallbackAnswer: boolean;
  /** Explicit lifecycle state. The frontend shows a "Continue" button only
   *  when this is TRUNCATED — every other non-COMPLETE state is
   *  deliberately not continuable (see MessageStatus in schema.prisma). */
  status: MessageStatus;
  continuationDepth: number;
}

const EXTERNAL_REASON = "This topic was not found in your personal knowledge.";
const EMPTY_ANSWER_FALLBACK =
  "I wasn't able to generate an answer for that. Please try rephrasing your question.";

/** Caps how many times a single answer can be extended via Continue —
 *  without this, a pathological "always truncated" loop could run
 *  unbounded generation cost against one message. */
const MAX_CONTINUATION_DEPTH = 3;

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
  /** In-process guard against two concurrent "Continue" requests for the
   *  same message. Deliberately in-memory, not DB-backed: this app runs
   *  as a single Node process (see architecture notes elsewhere), so a
   *  Set is sufficient here and avoids adding a distributed lock for a
   *  guarantee a single instance doesn't need yet. If this service is
   *  ever horizontally scaled, this guard stops being sufficient and
   *  would need to move to Redis (already used elsewhere in this app for
   *  BullMQ) — noted rather than silently left as a false guarantee.
   */
  private readonly continuingMessageIds = new Set<string>();

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

  /** `knowledgeId` is set once this message has actually been converted
   *  into a Knowledge entry (see KnowledgeSaveService / chat.controller's
   *  idempotent save-check) — recording it here is what lets a repeat
   *  "Save to Knowledge Base" request return the existing record instead
   *  of creating a duplicate one. */
  async markSaved(messageId: string, knowledgeId: string): Promise<void> {
    await prisma.message.update({
      where: { id: messageId },
      data: { savedToKnowledge: true, savedKnowledgeId: knowledgeId },
    });
  }

  /**
   * Creates the ASSISTANT message and bumps the conversation's
   * `updatedAt` as a single atomic unit (a message can't exist without
   * its conversation being touched, and vice versa is pointless), with
   * retry+backoff on top — mirrors the same jittered-retry pattern
   * AIService/EmbeddingService already use for their own external calls.
   * A transient DB blip immediately after a fully-generated answer must
   * not be treated the same as "generation failed"; retrying here gives
   * it a real chance to succeed before that distinction has to be made
   * by the caller.
   */
  private async persistAssistantMessage(
    conversationId: string,
    data: {
      content: string;
      sourceBadge?: SourceBadge | null;
      confidence?: ConfidenceLevel | null;
      topSimilarity?: number | null;
      knowledgeRefs?: KnowledgeReference[] | null;
      externalReason?: string | null;
      isFallbackAnswer?: boolean;
      status: MessageStatus;
      retrievedContext?: RetrievedContextChunk[] | null;
    },
    maxRetries = 2
  ): Promise<Message> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const message = await tx.message.create({
            data: {
              conversationId,
              role: MessageRole.ASSISTANT,
              content: data.content,
              sourceBadge: data.sourceBadge ?? null,
              confidence: data.confidence ?? null,
              topSimilarity: data.topSimilarity ?? null,
              knowledgeRefs: (data.knowledgeRefs ?? null) as unknown as object,
              externalReason: data.externalReason ?? null,
              isFallbackAnswer: data.isFallbackAnswer ?? false,
              status: data.status,
              retrievedContext: (data.retrievedContext ?? null) as unknown as object,
            },
          });
          await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
          return message;
        });
      } catch (err) {
        lastError = err;
        logger.warn("Failed to persist assistant message, retrying", {
          conversationId,
          attempt,
          maxRetries,
          error: (err as Error).message,
        });
        if (attempt < maxRetries) await sleep(backoffDelay(attempt));
      }
    }

    logger.error("Failed to persist assistant message after all retries", {
      conversationId,
      error: (lastError as Error)?.message,
    });
    throw lastError;
  }

  /** Persists whatever content had already streamed to the client when
   *  generation was stopped mid-flight, so it isn't lost on reload. Best
   *  effort: the client is already gone by the time this runs, so a
   *  failure here (even after persistAssistantMessage's own retries) just
   *  gets logged rather than surfaced anywhere — there's no one left to
   *  tell. Status is STOPPED, not TRUNCATED — a user-initiated stop is
   *  deliberately NOT continuable (see MessageStatus). */
  private async persistStoppedMessage(conversationId: string, content: string): Promise<void> {
    try {
      await this.persistAssistantMessage(conversationId, {
        content,
        externalReason: "Generation was stopped before it finished.",
        isFallbackAnswer: true,
        status: MessageStatus.STOPPED,
      });
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

    try {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: MessageRole.USER,
          content: question,
          clientRequestId: request.clientRequestId ?? null,
        },
      });
    } catch (err) {
      // Unique constraint violation on clientRequestId means this exact
      // request was already submitted and processed (e.g. a client-level
      // network retry that resent the same POST) — reject it instead of
      // creating a second user/assistant message pair. This does not
      // replay the original streamed answer; the caller should read it
      // back from conversation history instead of resubmitting.
      if (request.clientRequestId && isUniqueConstraintError(err)) {
        log.info("Duplicate chat request rejected", { clientRequestId: request.clientRequestId });
        handlers.onError(
          "This message was already submitted. Check your conversation history before sending it again."
        );
        return;
      }
      throw err;
    }
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

    // Captured verbatim (not just knowledgeId references) so a later
    // "Continue" on this exact message can reuse the identical grounding
    // material instead of re-running retrieval and risking drift onto
    // different chunks the second time.
    const retrievedContext: RetrievedContextChunk[] = retrieval.chunks.map((c) => ({
      knowledgeTitle: c.knowledgeTitle,
      heading: c.heading,
      section: c.section,
      content: c.content,
    }));

    const { system, user } = usePersonalKnowledge
      ? buildPersonalKnowledgePrompt(question, retrievedContext)
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

      // A genuine provider failure (rate limit, connection drop, etc.),
      // not a user cancellation. If the model had already streamed some
      // content before dying, that content is real and already visible
      // to the client — discarding it here (as the previous version did)
      // meant a partially-good answer vanished for no reason. Persist it
      // and report success-with-a-caveat via onDone, the same way a
      // user-stopped answer is handled, rather than onError wiping it.
      if (fullContent.trim()) {
        log.warn("Chat generation failed mid-stream, preserving partial content", {
          conversationId: conversation.id,
          partialLength: fullContent.length,
          error: (err as Error).message,
        });
        try {
          const partialMessage = await this.persistAssistantMessage(conversation.id, {
            content: fullContent,
            externalReason: "Generation was interrupted before finishing. This answer may be incomplete.",
            isFallbackAnswer: true, // incomplete generation — don't treat as a saveable, grounded answer
            status: MessageStatus.INTERRUPTED, // deliberately NOT continuable — see MessageStatus
          });
          handlers.onDone({
            conversationId: conversation.id,
            messageId: partialMessage.id,
            sourceBadge: usePersonalKnowledge ? SourceBadge.PERSONAL_KNOWLEDGE : SourceBadge.EXTERNAL_AI,
            confidence: null,
            topSimilarity: 0,
            sourcesUsed: [],
            externalReason: "Generation was interrupted before finishing. This answer may be incomplete.",
            isFallbackAnswer: true,
            status: MessageStatus.INTERRUPTED,
            continuationDepth: 0,
          });
        } catch (persistErr) {
          // Couldn't even save the partial content — nothing left to do
          // but tell the client, while making clear the content it's
          // already showing on screen is real and shouldn't be discarded.
          log.error("Failed to persist partial chat message after provider failure", {
            conversationId: conversation.id,
            error: (persistErr as Error).message,
          });
          handlers.onError(
            "The answer was generated but could not be saved. Copy it now if you need to keep it.",
            { preserveContent: true }
          );
        }
        return;
      }

      log.error("Chat completion failed", { conversationId: conversation.id, error: (err as Error).message });
      handlers.onError("The AI provider failed to respond. Please try again.");
      return;
    }

    // True when there's no real answer to persist as grounded content —
    // covers only the "model returned nothing" case now. Truncation is
    // real, usable content with its own status (TRUNCATED) — it must NOT
    // set this flag, or a cut-off-but-otherwise-good answer would be
    // wrongly excluded from Save-to-Knowledge and from confidence display.
    let isFallbackAnswer = false;
    let status: MessageStatus = MessageStatus.COMPLETE;

    if (!fullContent.trim()) {
      fullContent = EMPTY_ANSWER_FALLBACK;
      isFallbackAnswer = true;
      status = MessageStatus.EMPTY;
      handlers.onDelta(fullContent);
    } else if (wasTruncated) {
      status = MessageStatus.TRUNCATED;
      // No static "cut off" notice appended anymore — with Continue now
      // available for exactly this state, a permanent note baked into
      // the saved content would look wrong once the user continues it
      // and the two halves read as one seamless answer. The frontend
      // shows the "cut off, tap Continue" affordance itself, driven by
      // `status`, instead of it being embedded in the text.
    }

    const sourceBadge = usePersonalKnowledge ? SourceBadge.PERSONAL_KNOWLEDGE : SourceBadge.EXTERNAL_AI;
    // A placeholder "I couldn't answer that" is not a real grounded
    // answer — showing a confidence badge on it would misrepresent it as
    // one, so confidence is only computed for a real personal-knowledge
    // answer.
    const confidence =
      usePersonalKnowledge && !isFallbackAnswer
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

    let assistantMessage: Message;
    try {
      assistantMessage = await this.persistAssistantMessage(conversation.id, {
        content: fullContent,
        sourceBadge,
        confidence,
        topSimilarity: retrieval.topSimilarity,
        knowledgeRefs: sourcesUsed,
        externalReason,
        isFallbackAnswer,
        status,
        // Only worth keeping for a personal-knowledge, non-fallback
        // answer — nothing else is ever continuable, so there's nothing
        // for INTERRUPTED/EMPTY/external-AI messages to reuse it for.
        retrievedContext: usePersonalKnowledge ? retrievedContext : null,
      });
    } catch (err) {
      // Generation succeeded and was fully streamed to the client — this
      // is purely a persistence failure (DB down/timeout/etc.), after
      // retries were already exhausted inside persistAssistantMessage.
      // That is a materially different situation from "generation
      // failed" and must not be reported as one: the content on screen
      // is real, it just isn't safely saved.
      log.error("Failed to persist assistant message after streaming completed", {
        conversationId: conversation.id,
        error: (err as Error).message,
      });
      handlers.onError(
        "Your answer was generated but could not be saved. Copy it now if you need to keep it.",
        { preserveContent: true }
      );
      return;
    }

    log.info("Chat answer generated", {
      conversationId: conversation.id,
      sourceBadge,
      confidence,
      status,
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
      isFallbackAnswer,
      status,
      continuationDepth: 0,
    });
  }

  /**
   * "Continue" — extends a TRUNCATED message with the missing remainder,
   * rather than regenerating the whole answer. There is no provider-level
   * "resume this exact generation" API for either OpenAI or Groq (neither
   * offers a server-side handle into a finished stream), so this is a
   * semantic continuation: original question + the exact chunks already
   * used (Message.retrievedContext, not a fresh retrieval) + the exact
   * text already produced, with an explicit instruction not to repeat it.
   *
   * Deltas are streamed the same way as a normal answer, but the backend
   * APPENDS to the existing message row instead of creating a new one —
   * the frontend is expected to append the streamed deltas onto the
   * existing bubble (matched by `messageId`, which is unchanged), not
   * replace or re-fetch it.
   */
  async continueAnswer(messageId: string, handlers: ChatStreamHandlers, signal?: AbortSignal): Promise<void> {
    const log = logger.child({ scope: "chat.continue" });

    // Guards "Continue" clicked twice before the first click's disabled
    // state has round-tripped to the UI — see continuingMessageIds' doc
    // comment for why this is in-process only.
    if (this.continuingMessageIds.has(messageId)) {
      handlers.onError("This answer is already being continued.");
      return;
    }
    this.continuingMessageIds.add(messageId);

    try {
      const message = await this.getMessage(messageId);

      if (message.role !== MessageRole.ASSISTANT) {
        handlers.onError("Only an assistant answer can be continued.");
        return;
      }
      // The only continuable state, by design — see MessageStatus. A
      // completed, stopped, or provider-interrupted message is
      // deliberately rejected here rather than silently continuing
      // something that was never meant to be extended.
      if (message.status !== MessageStatus.TRUNCATED) {
        handlers.onError("This answer isn't waiting on a continuation.");
        return;
      }
      if (message.continuationDepth >= MAX_CONTINUATION_DEPTH) {
        handlers.onError("This answer has reached its continuation limit.");
        return;
      }

      const precedingQuestion = await this.getPrecedingUserMessage(message);
      if (!precedingQuestion) {
        handlers.onError("Could not find the original question for this answer.");
        return;
      }

      const usePersonalKnowledge = message.sourceBadge === SourceBadge.PERSONAL_KNOWLEDGE;
      const retrievedContext = (message.retrievedContext as unknown as RetrievedContextChunk[] | null) ?? [];

      const { system, user } = buildContinuationPrompt(
        precedingQuestion.content,
        message.content,
        retrievedContext,
        usePersonalKnowledge
      );

      let continuationContent = "";
      let wasTruncatedAgain = false;

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
              continuationContent += event.delta;
              handlers.onDelta(event.delta);
            }
          },
          signal
        );
        continuationContent = result.content || continuationContent;
        wasTruncatedAgain = result.finishReason === "length";
      } catch (err) {
        if (signal?.aborted) {
          // Stopped mid-continuation: whatever new text streamed is real
          // and already visible, so append it and mark COMPLETE (not
          // TRUNCATED) — a user-initiated stop should not silently
          // re-offer Continue as if nothing happened.
          if (continuationContent.trim()) {
            await this.appendContinuation(message, continuationContent, MessageStatus.STOPPED);
          }
          return;
        }
        log.warn("Continuation generation failed", { messageId, error: (err as Error).message });
        if (continuationContent.trim()) {
          // Partial continuation content is real; preserve it the same
          // way a partial first-generation is preserved, but mark
          // INTERRUPTED so a second Continue click isn't offered on an
          // already-degraded continuation.
          const updated = await this.appendContinuation(message, continuationContent, MessageStatus.INTERRUPTED);
          handlers.onDone(this.toSummary(updated));
        } else {
          handlers.onError("The AI provider failed to continue this answer. Please try again.");
        }
        return;
      }

      if (!continuationContent.trim()) {
        // Nothing new was generated — leave the message exactly as it
        // was (still TRUNCATED, still continuable) rather than silently
        // "completing" an answer that never actually got the rest of its
        // content.
        handlers.onError("No additional content was generated. You can try Continue again.");
        return;
      }

      const nextStatus = wasTruncatedAgain ? MessageStatus.TRUNCATED : MessageStatus.COMPLETE;

      let updated: Message;
      try {
        updated = await this.appendContinuation(message, continuationContent, nextStatus);
      } catch (err) {
        log.error("Failed to persist continuation after generation completed", {
          messageId,
          error: (err as Error).message,
        });
        handlers.onError(
          "The continuation was generated but could not be saved. Copy it now if you need to keep it.",
          { preserveContent: true }
        );
        return;
      }

      handlers.onDone(this.toSummary(updated));
    } finally {
      this.continuingMessageIds.delete(messageId);
    }
  }

  /** Appends new text to an existing message's content and advances its
   *  lifecycle state — used only by continueAnswer. Wrapped in the same
   *  retry+transaction helper the original generation uses, for the same
   *  reason: a DB blip right after a successful continuation generation
   *  must not lose it. */
  private async appendContinuation(
    message: Message,
    additionalContent: string,
    nextStatus: MessageStatus,
    maxRetries = 2
  ): Promise<Message> {
    let lastError: unknown;
    const newContent = `${message.content}${additionalContent}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const updated = await tx.message.update({
            where: { id: message.id },
            data: {
              content: newContent,
              status: nextStatus,
              continuationDepth: { increment: 1 },
            },
          });
          await tx.conversation.update({
            where: { id: message.conversationId },
            data: { updatedAt: new Date() },
          });
          return updated;
        });
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) await sleep(backoffDelay(attempt));
      }
    }
    throw lastError;
  }

  private toSummary(message: Message): ChatAnswerSummary {
    return {
      conversationId: message.conversationId,
      messageId: message.id,
      sourceBadge: (message.sourceBadge ?? SourceBadge.EXTERNAL_AI) as SourceBadge,
      confidence: message.confidence,
      topSimilarity: message.topSimilarity ?? 0,
      sourcesUsed: (message.knowledgeRefs as unknown as KnowledgeReference[] | null) ?? [],
      externalReason: message.externalReason,
      isFallbackAnswer: message.isFallbackAnswer,
      status: message.status ?? MessageStatus.COMPLETE,
      continuationDepth: message.continuationDepth,
    };
  }
}

/** Prisma unique-constraint violations surface as error code "P2002". */
function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export const chatService = new ChatService();