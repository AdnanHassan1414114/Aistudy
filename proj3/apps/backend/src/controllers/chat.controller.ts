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
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const abortController = new AbortController();
  req.on("close", () => abortController.abort());

  try {
    await chatService.streamAnswer(
      { question, conversationId, knowledgeScope: knowledgeScope ?? null },
      {
        onDelta: (delta) => send("delta", { delta }),
        onDone: (summary) => {
          send("done", summary);
          res.end();
        },
        onError: (message) => {
          send("error", { message });
          res.end();
        },
      },
      abortController.signal
    );
  } catch (err) {
    logger.error("Unhandled error while streaming chat answer", { error: (err as Error).message });
    if (!res.writableEnded) {
      send("error", { message: "Something went wrong while generating the answer." });
      res.end();
    }
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

  const conversationMessages = await chatService.getMessagesForConversation(message.conversationId);
  const messageIndex = conversationMessages.findIndex((m) => m.id === messageId);
  const precedingQuestion = [...conversationMessages.slice(0, messageIndex)]
    .reverse()
    .find((m) => m.role === MessageRole.USER);

  if (!precedingQuestion) throw AppError.badRequest("Could not find the question for this answer.");

  const knowledge = await knowledgeSaveService.saveExternalAnswer(precedingQuestion.content, message.content);
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
