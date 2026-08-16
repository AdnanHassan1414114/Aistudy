import { Request, Response } from "express";
import { MessageRole, SourceBadge } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { chatService } from "../services/chat.service";
import { knowledgeSaveService } from "../services/knowledgeSave.service";
import { knowledgeIndexingService } from "../services/knowledgeIndexing.service";
import { knowledgeRepository } from "../repositories";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";
import { ChatRequestInput, ConversationListQuery, ContinueAnswerInput, SaveAnswerInput } from "../validators/chat.validator";

/**
 * POST /chat — streams the answer back as Server-Sent Events. Uses a POST
 * body (question, conversationId, knowledgeScope) rather than EventSource
 * (which only supports GET); the frontend consumes this with fetch() +
 * a ReadableStream reader, which also lets it abort generation.
 */
export const streamChat = asyncHandler(async (req: Request, res: Response) => {
  const { question, conversationId, knowledgeScope, clientRequestId } = req.body as ChatRequestInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    // The client can disconnect at any point mid-stream (closing the tab,
    // clicking "stop", navigating away — all normal for a chat UI, and
    // exactly what req.on("close") below is listening for). Once that
    // happens the underlying socket is already gone, so writing to `res`
    // here would either throw or emit an unhandled 'error' event on the
    // response stream. Every caller of send() (onDelta/onDone/onError)
    // goes through this one guard rather than each needing its own check.
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const endStream = () => {
    if (!res.writableEnded && !res.destroyed) res.end();
  };

  // Without this listener, a write failure after the client has already
  // disconnected (e.g. a send() that raced the close event) surfaces as
  // an unhandled 'error' event on the response stream instead of a normal
  // rejected promise — log and move on rather than letting it propagate.
  res.on("error", (err) => {
    logger.warn("Chat SSE response stream error (client likely disconnected)", { error: err.message });
  });

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    await chatService.streamAnswer(
      { question, conversationId, knowledgeScope: knowledgeScope ?? null, clientRequestId },
      {
        onDelta: (delta) => send("delta", { delta }),
        onDone: (summary) => {
          send("done", summary);
          endStream();
        },
        onError: (message, options) => {
          send("error", { message, preserveContent: options?.preserveContent ?? false });
          endStream();
        },
      },
      abortController.signal
    );
  } catch (err) {
    logger.error("Unhandled error while streaming chat answer", { error: (err as Error).message });
    send("error", { message: "Something went wrong while generating the answer." });
    endStream();
  }
});

/**
 * POST /chat/continue — extends a TRUNCATED assistant message with its
 * missing remainder. Same SSE plumbing as /chat (delta/done/error frames,
 * same disconnect-abort wiring), but streams into an EXISTING message
 * instead of creating a new one — the frontend appends deltas onto the
 * message with the returned `messageId`, which is unchanged from the
 * request.
 */
export const continueChat = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.body as ContinueAnswerInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const endStream = () => {
    if (!res.writableEnded && !res.destroyed) res.end();
  };
  res.on("error", (err) => {
    logger.warn("Continue SSE response stream error (client likely disconnected)", { error: err.message });
  });

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    await chatService.continueAnswer(
      messageId,
      {
        onDelta: (delta) => send("delta", { delta }),
        onDone: (summary) => {
          send("done", summary);
          endStream();
        },
        onError: (message, options) => {
          send("error", { message, preserveContent: options?.preserveContent ?? false });
          endStream();
        },
      },
      abortController.signal
    );
  } catch (err) {
    logger.error("Unhandled error while continuing chat answer", { error: (err as Error).message });
    send("error", { message: "Something went wrong while continuing the answer." });
    endStream();
  }
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize } = req.query as unknown as ConversationListQuery;
  const result = await chatService.listConversations(page, pageSize);
  sendResponse({ res, message: "Conversations retrieved.", data: result });
});

export const getConversation = asyncHandler(async (req: Request, res: Response) => {
  const result = await chatService.getConversationWithMessages(req.params.id);
  sendResponse({ res, message: "Conversation retrieved.", data: result });
});

/**
 * POST /chat/save — implements "Save to Knowledge Base" for an External AI
 * answer. Looks up the question that preceded the given assistant message
 * within the same conversation, converts Q+A into structured notes, and
 * indexes them exactly like any other Knowledge entry.
 */
export const saveAnswerToKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const { messageId } = req.body as SaveAnswerInput;

  // Mirrors the disconnect-handling guard on the /chat SSE route — this
  // isn't a stream, but the LLM-conversion + embedding call underneath
  // can run long enough for the client to be gone by the time we'd write
  // the response.
  res.on("error", (err) => {
    logger.warn("Save-to-knowledge response stream error (client likely disconnected)", { error: err.message });
  });

  const message = await chatService.getMessage(messageId);
  if (message.role !== MessageRole.ASSISTANT || message.sourceBadge !== SourceBadge.EXTERNAL_AI) {
    throw AppError.badRequest("Only External AI answers can be saved to the knowledge base.");
  }
  if (message.isFallbackAnswer) {
    throw AppError.badRequest("This message has no real answer content to save.");
  }

  // Idempotency fast path: if this message was already converted, return
  // the existing Knowledge instead of doing the LLM conversion + embedding
  // work again (and instead of creating a duplicate row). The unique
  // constraint on Knowledge.sourceMessageId is what makes this safe even
  // when two requests land at nearly the same time and both pass this
  // check before either has written savedKnowledgeId.
  if (message.savedKnowledgeId) {
    const existing = await knowledgeRepository.findById(message.savedKnowledgeId);
    if (existing) {
      sendResponse({
        res,
        statusCode: 200,
        message: "This answer was already saved to your knowledge library.",
        data: { knowledgeId: existing.id, title: existing.title, indexed: true },
      });
      return;
    }
  }

  // Fetches the conversation directly (for its `knowledgeScope`, inherited
  // as the saved note's category) and the preceding question via a
  // targeted query — not by loading the conversation's full/paginated
  // message list and scanning it, so this keeps working correctly no
  // matter how far back in a long conversation this message is.
  const conversation = await chatService.getConversationById(message.conversationId);
  const precedingQuestion = await chatService.getPrecedingUserMessage(message);

  if (!precedingQuestion) throw AppError.badRequest("Could not find the question for this answer.");

  const result = await knowledgeSaveService.saveExternalAnswer(
    precedingQuestion.content,
    message.content,
    conversation.knowledgeScope,
    messageId
  );
  await chatService.markSaved(messageId, result.knowledge.id);

  // Report the actual outcome — a note that was created but failed to
  // index is NOT searchable yet, and telling the user "saved
  // successfully" in that case would be false. 201 still applies (a
  // Knowledge resource was created); `indexed` tells the frontend whether
  // it's ready to show up in chat/interview retrieval.
  sendResponse({
    res,
    statusCode: 201,
    message: result.indexed
      ? "Answer saved to knowledge library."
      : "Answer saved, but it isn't searchable yet — indexing failed and can be retried.",
    data: {
      knowledgeId: result.knowledge.id,
      title: result.knowledge.title,
      indexed: result.indexed,
      indexError: result.indexError ?? null,
    },
  });
});

/** POST /chat/index/:knowledgeId — (re)index a Knowledge entry for RAG. */
export const reindexKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const result = await knowledgeIndexingService.indexKnowledge(req.params.knowledgeId);
  sendResponse({ res, message: "Knowledge indexed for RAG.", data: result });
});