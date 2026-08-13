import { Request, Response } from "express";
import { MessageRole, SourceBadge } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { chatService } from "../services/chat.service";
import { knowledgeSaveService } from "../services/knowledgeSave.service";
import { knowledgeIndexingService } from "../services/knowledgeIndexing.service";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";
import { ChatRequestInput, ConversationListQuery, SaveAnswerInput } from "../validators/chat.validator";

/**
 * POST /chat — streams the answer back as Server-Sent Events. Uses a POST
 * body (question, conversationId, knowledgeScope) rather than EventSource
 * (which only supports GET); the frontend consumes this with fetch() +
 * a ReadableStream reader, which also lets it abort generation.
 */
export const streamChat = asyncHandler(async (req: Request, res: Response) => {
  const { question, conversationId, knowledgeScope } = req.body as ChatRequestInput;

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
      { question, conversationId, knowledgeScope: knowledgeScope ?? null },
      {
        onDelta: (delta) => send("delta", { delta }),
        onDone: (summary) => {
          send("done", summary);
          endStream();
        },
        onError: (message) => {
          send("error", { message });
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

  const message = await chatService.getMessage(messageId);
  if (message.role !== MessageRole.ASSISTANT || message.sourceBadge !== SourceBadge.EXTERNAL_AI) {
    throw AppError.badRequest("Only External AI answers can be saved to the knowledge base.");
  }

  // Fetches the conversation directly (for its `knowledgeScope`, inherited
  // as the saved note's category) and the preceding question via a
  // targeted query — not by loading the conversation's full/paginated
  // message list and scanning it, so this keeps working correctly no
  // matter how far back in a long conversation this message is.
  const conversation = await chatService.getConversationById(message.conversationId);
  const precedingQuestion = await chatService.getPrecedingUserMessage(message);

  if (!precedingQuestion) throw AppError.badRequest("Could not find the question for this answer.");

  const knowledge = await knowledgeSaveService.saveExternalAnswer(
    precedingQuestion.content,
    message.content,
    conversation.knowledgeScope
  );
  await chatService.markSaved(messageId);

  sendResponse({
    res,
    statusCode: 201,
    message: "Answer saved to knowledge library.",
    data: { knowledgeId: knowledge.id, title: knowledge.title },
  });
});

/** POST /chat/index/:knowledgeId — (re)index a Knowledge entry for RAG. */
export const reindexKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const result = await knowledgeIndexingService.indexKnowledge(req.params.knowledgeId);
  sendResponse({ res, message: "Knowledge indexed for RAG.", data: result });
});