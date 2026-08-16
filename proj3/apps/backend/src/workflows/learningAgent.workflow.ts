import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { randomUUID } from "crypto";
import { InterviewStatus } from "@prisma/client";
import { chatService } from "../services/chat.service";
import { interviewService } from "../services/interview.service";
import { revisionService } from "../services/revision.service";
import { aiService } from "../services/ai.service";
import { interviewRepository } from "../repositories";
import { buildIntentDetectionPrompt, detectIntentHeuristically } from "../prompts";
import { learningAgentIntentPayloadSchema, LearningAgentIntent, LearningAgentReference } from "../types";
import { DEFAULT_USER_ID } from "../constants";
import { env } from "../config/env";
import { logger } from "../utils/logger";

const log = logger.child({ scope: "learningAgentWorkflow" });

/**
 * Milestone 6 — Intelligent Learning Agent.
 *
 * LangGraph is used ONLY as the workflow orchestrator here, exactly like
 * Milestone 5's revisionPlan.workflow.ts: every node below is a thin
 * wrapper that calls an existing service; no business logic is duplicated
 * or reimplemented inside a node. This is a single linear StateGraph with
 * one decision point — not a multi-agent system. There is no Supervisor,
 * no Planner, no autonomous multi-step reasoning: one intent classification,
 * one dispatch, done.
 *
 * Graph shape (per spec):
 *   START -> readRequest -> detectIntent -> (decision) -> chat | interview | revision -> END
 */
const LearningAgentState = Annotation.Root({
  userRequest: Annotation<string>(),
  conversationId: Annotation<string | undefined>(),
  interviewId: Annotation<string | undefined>(),

  intent: Annotation<LearningAgentIntent>(),

  response: Annotation<string>(),
  references: Annotation<LearningAgentReference[]>(),

  // May be created/resolved by the interview or chat node even if the
  // caller didn't pass one in (e.g. a brand-new chat conversation, or a
  // freshly-started interview) — the controller reads these back out so
  // the frontend can continue the same thread on the next turn.
  resultConversationId: Annotation<string | undefined>(),
  resultInterviewId: Annotation<string | undefined>(),
});

type LearningAgentStateType = typeof LearningAgentState.State;

/** READ USER REQUEST NODE — normalizes the incoming request. No business
 *  logic; just guarantees downstream nodes see a trimmed, non-empty string
 *  (validation already rejected empty input at the API boundary). */
async function readRequestNode(state: LearningAgentStateType): Promise<Partial<LearningAgentStateType>> {
  return { userRequest: state.userRequest.trim() };
}

/** DETECT INTENT NODE — a single lightweight LLM call classifies the
 *  request into CHAT | INTERVIEW | REVISION. Not a trained classifier
 *  model: one prompt, one JSON object back, same convention as every
 *  other structured-output call in this codebase. Falls back to a
 *  deterministic keyword heuristic if the LLM call fails or returns
 *  something unparseable, so a transient AI-provider hiccup never blocks
 *  routing entirely. */
async function detectIntentNode(state: LearningAgentStateType): Promise<Partial<LearningAgentStateType>> {
  const { system, user } = buildIntentDetectionPrompt(state.userRequest, Boolean(state.interviewId));

  try {
    const completion = await aiService.complete(user, {
      systemPrompt: system,
      temperature: env.LEARNING_AGENT_INTENT_TEMPERATURE,
      maxTokens: env.LEARNING_AGENT_INTENT_MAX_TOKENS,
      jsonMode: true,
    });

    const parsed = learningAgentIntentPayloadSchema.safeParse(JSON.parse(completion.content));
    if (parsed.success) {
      log.info("Intent detected", { intent: parsed.data.intent });
      return { intent: parsed.data.intent };
    }

    log.warn("Intent detection returned invalid payload, falling back to heuristic", {
      error: parsed.error.message,
    });
  } catch (err) {
    log.warn("Intent detection LLM call failed, falling back to heuristic", { error: (err as Error).message });
  }

  const intent = detectIntentHeuristically(state.userRequest);
  return { intent };
}

/** CHAT NODE — reuses the existing RAG Chat flow (ChatService.streamAnswer)
 *  exactly as-is. The agent isn't a streaming caller, so it collects the
 *  deltas into one final string rather than reimplementing any of the
 *  retrieval / grounding / fallback logic that already lives in ChatService. */
async function chatNode(state: LearningAgentStateType): Promise<Partial<LearningAgentStateType>> {
  let content = "";
  let references: LearningAgentReference[] = [];
  let resultConversationId: string | undefined;
  let errorMessage: string | null = null;

  await chatService.streamAnswer(
    {
      question: state.userRequest,
      conversationId: state.conversationId,
      // The Learning Agent isn't a retry-prone HTTP caller in the same
      // sense the /chat route is (no client resubmitting this exact
      // request), so a fresh id per call satisfies the now-required field
      // without needing real cross-request dedupe here.
      clientRequestId: randomUUID(),
    },
    {
      onDelta: (delta) => {
        content += delta;
      },
      onDone: (summary) => {
        resultConversationId = summary.conversationId;
        references = summary.sourcesUsed as unknown as LearningAgentReference[];
      },
      onError: (message) => {
        errorMessage = message;
      },
    }
  );

  if (errorMessage) {
    return { response: errorMessage, references: [], resultConversationId: state.conversationId };
  }

  return { response: content, references, resultConversationId };
}

/** INTERVIEW NODE — reuses the existing Interview Engine APIs as-is:
 *  - an interviewId in context resumes that interview (current question).
 *  - no interviewId starts a new Quick Interview from the free-text
 *    request (InterviewService already derives the topic via
 *    extractTopicFromMessage — no duplicated parsing here).
 *  Structured "Custom Interview" (explicit difficulty/type/count) stays
 *  available through the existing POST /interviews/start endpoint; this
 *  node's natural-language entry point maps onto Quick + Resume, which
 *  covers everything expressible as a single free-text sentence. */
async function interviewNode(state: LearningAgentStateType): Promise<Partial<LearningAgentStateType>> {
  if (state.interviewId) {
    const question = await interviewService.resume(state.interviewId);
    const response = `Resuming your interview — Question ${question.questionNumber}:\n\n${question.content}`;
    return {
      response,
      references: (question.knowledgeRefs ?? []) as unknown as LearningAgentReference[],
      resultInterviewId: state.interviewId,
    };
  }

  const result = await interviewService.start({ mode: "QUICK", message: state.userRequest });
  const response = `Started a new interview on **${result.interview.topic}**.\n\nQuestion 1:\n\n${result.firstQuestion.content}`;

  return {
    response,
    references: (result.firstQuestion.knowledgeRefs ?? []) as unknown as LearningAgentReference[],
    resultInterviewId: result.interview.id,
  };
}

/** REVISION NODE — reuses the existing LangGraph Revision workflow
 *  (via RevisionService, which wraps runRevisionPlanWorkflow) with no
 *  duplication. If no interviewId is in context, resolves one from the
 *  user's completed interviews — preferring one whose topic is mentioned
 *  in the request, falling back to the most recently completed. */
async function revisionNode(state: LearningAgentStateType): Promise<Partial<LearningAgentStateType>> {
  const resolvedInterviewId = state.interviewId ?? (await resolveInterviewIdForRevision(state.userRequest));

  if (!resolvedInterviewId) {
    return {
      response:
        "You don't have any completed interviews yet, so there's nothing to build a revision plan from. " +
        "Complete an interview first, then ask me to help you revise.",
      references: [],
    };
  }

  // The plan is auto-generated right after an interview completes, so a
  // read usually suffices; generate on demand if it isn't there yet.
  const plan = await revisionService
    .get(resolvedInterviewId)
    .catch(() => revisionService.generate(resolvedInterviewId));

  return {
    response: plan.planMarkdown,
    references: plan.relatedNotes as unknown as LearningAgentReference[],
    resultInterviewId: resolvedInterviewId,
  };
}

/** Resolves which completed interview to revise when the caller didn't
 *  supply one: prefers a completed interview whose topic is mentioned in
 *  the request, falling back to the most recently completed one. Returns
 *  null if the user has no completed interviews at all. */
async function resolveInterviewIdForRevision(userRequest: string): Promise<string | null> {
  const completed = await interviewRepository.list({
    page: 1,
    pageSize: 20,
    userId: DEFAULT_USER_ID,
    status: InterviewStatus.COMPLETED,
  });

  if (completed.items.length === 0) return null;

  const requestLower = userRequest.toLowerCase();
  const matched = completed.items.find((i) => requestLower.includes(i.topic.toLowerCase()));
  return (matched ?? completed.items[0]).id;
}

function routeFromIntent(state: LearningAgentStateType): "chat" | "interview" | "revision" {
  if (state.intent === "INTERVIEW") return "interview";
  if (state.intent === "REVISION") return "revision";
  return "chat";
}

const graph = new StateGraph(LearningAgentState)
  .addNode("readRequest", readRequestNode)
  .addNode("detectIntent", detectIntentNode)
  .addNode("chat", chatNode)
  .addNode("interview", interviewNode)
  .addNode("revision", revisionNode)
  .addEdge(START, "readRequest")
  .addEdge("readRequest", "detectIntent")
  .addConditionalEdges("detectIntent", routeFromIntent, {
    chat: "chat",
    interview: "interview",
    revision: "revision",
  })
  .addEdge("chat", END)
  .addEdge("interview", END)
  .addEdge("revision", END);

export const learningAgentWorkflow = graph.compile();

export async function runLearningAgentWorkflow(input: {
  message: string;
  conversationId?: string;
  interviewId?: string;
}): Promise<LearningAgentStateType> {
  const result = await learningAgentWorkflow.invoke({
    userRequest: input.message,
    conversationId: input.conversationId,
    interviewId: input.interviewId,
  });
  return result as LearningAgentStateType;
}