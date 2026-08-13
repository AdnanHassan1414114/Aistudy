import type {
  ApiEnvelope,
  Interview,
  InterviewResults,
  PaginatedResult,
  StartInterviewInput,
  StartInterviewResult,
  SubmitAnswerResult,
  InterviewQuestionWithAnswer,
} from "../types/interview";
import type { Knowledge, KnowledgeListParams, KnowledgeVersion, ProcessingJob } from "../types/knowledge";
import type { ChatAnswerSummary, Conversation, Message } from "../types/chat";
import type { RevisionPlanResult, WeakAreasResult } from "../types/revision";
import type { LearningAgentRequestInput, LearningAgentResult } from "../types/learningAgent";
import type { LearningPathResult } from "../types/learningPath";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";

class ApiError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || !body.success) {
    throw new ApiError(body.message ?? "Request failed", res.status);
  }
  return body.data;
}

/** GET /interviews -- used by the history page to list completed interviews. */
export function listInterviews(params: { page?: number; pageSize?: number; status?: string } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.status) query.set("status", params.status);
  const qs = query.toString();
  return request<PaginatedResult<Interview>>(`/interviews${qs ? `?${qs}` : ""}`);
}

/** GET /interviews/:id/results -- Milestone 4 Part 2 result dashboard payload. */
export function getInterviewResults(interviewId: string) {
  return request<InterviewResults>(`/interviews/${interviewId}/results`);
}

/** POST /interviews/start -- Quick ({ mode: "QUICK", message }) or Custom
 *  ({ mode: "CUSTOM", topic, difficulty, interviewType, numberOfQuestions }). */
export function startInterview(input: StartInterviewInput) {
  return request<StartInterviewResult>("/interviews/start", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** GET /interviews/:id -- interview plus every question/answer so far. */
export function getInterview(id: string) {
  return request<{ interview: Interview; questions: InterviewQuestionWithAnswer[] }>(`/interviews/${id}`);
}

/** POST /interviews/:id/answer -- stores the answer, evaluates it, and
 *  returns either the next question or the completed interview. */
export function submitInterviewAnswer(id: string, answer: string) {
  return request<SubmitAnswerResult>(`/interviews/${id}/answer`, {
    method: "POST",
    body: JSON.stringify({ answer }),
  });
}

/** POST /interviews/:id/resume -- the current unanswered question. */
export function resumeInterview(id: string) {
  return request<{ question: InterviewQuestionWithAnswer }>(`/interviews/${id}/resume`, { method: "POST" });
}

/** POST /interviews/:id/end -- ends an in-progress interview early (ABANDONED). */
export function endInterview(id: string) {
  return request<{ interview: Interview }>(`/interviews/${id}/end`, { method: "POST" });
}

/** GET /interviews/:id/revision-plan -- Milestone 5: the already-saved
 *  revision plan, generated automatically once the interview completed. */
export function getRevisionPlan(interviewId: string) {
  return request<RevisionPlanResult>(`/interviews/${interviewId}/revision-plan`);
}

/** POST /interviews/:id/revision-plan/regenerate -- Milestone 5: reruns the
 *  LangGraph revision workflow and returns the freshly saved plan. */
export function regenerateRevisionPlan(interviewId: string) {
  return request<RevisionPlanResult>(`/interviews/${interviewId}/revision-plan/regenerate`, {
    method: "POST",
  });
}

/** GET /interviews/:id/weak-areas -- Milestone 5: the prioritized weak-topic
 *  list on its own, independent of the generated plan. */
export function getWeakAreas(interviewId: string) {
  return request<WeakAreasResult>(`/interviews/${interviewId}/weak-areas`);
}

/** GET /interviews/:id/learning-path -- Milestone 7: the already-saved
 *  personalized learning path, built from the interview's revision plan
 *  (generated on first access if it doesn't exist yet). */
export function getLearningPath(interviewId: string) {
  return request<LearningPathResult>(`/interviews/${interviewId}/learning-path`);
}

/** POST /interviews/:id/learning-path/regenerate -- Milestone 7: reruns the
 *  LangGraph learning-path workflow and returns the freshly saved path. */
export function regenerateLearningPath(interviewId: string) {
  return request<LearningPathResult>(`/interviews/${interviewId}/learning-path/regenerate`, {
    method: "POST",
  });
}

/** POST /learning-agent -- Milestone 6: the single Learning Agent entry
 *  point. The backend detects intent and dispatches to the existing
 *  Chat / Interview / Revision workflows; this just posts the request. */
export function runLearningAgent(input: LearningAgentRequestInput) {
  return request<LearningAgentResult>("/learning-agent", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** POST /knowledge -- submits a YouTube URL for processing. */
export function createKnowledge(youtubeUrl: string, category?: string | null) {
  return request<{ knowledgeId: string; jobId: string }>("/knowledge", {
    method: "POST",
    body: JSON.stringify({ youtubeUrl, ...(category ? { category } : {}) }),
  });
}

/** GET /knowledge -- paginated, searchable, filterable, sortable library listing. */
export function listKnowledge(params: KnowledgeListParams = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);
  const qs = query.toString();
  return request<PaginatedResult<Knowledge>>(`/knowledge${qs ? `?${qs}` : ""}`);
}

/** GET /knowledge/:id -- single knowledge entry. */
export function getKnowledge(id: string) {
  return request<Knowledge>(`/knowledge/${id}`);
}

/** GET /knowledge/:id/job -- latest processing job, used for progress polling. */
export function getKnowledgeLatestJob(id: string) {
  return request<ProcessingJob | null>(`/knowledge/${id}/job`);
}

/** GET /knowledge/:id/versions -- full notes edit history. */
export function getKnowledgeVersions(id: string) {
  return request<KnowledgeVersion[]>(`/knowledge/${id}/versions`);
}

/** POST /knowledge/:id/versions/:version/restore -- restores notes as a new version. */
export function restoreKnowledgeVersion(id: string, version: number) {
  return request<Knowledge>(`/knowledge/${id}/versions/${version}/restore`, { method: "POST" });
}

/** PATCH /knowledge/:id -- updates notes, creating a new version. */
export function updateKnowledgeNotes(id: string, notes: string) {
  return request<Knowledge>(`/knowledge/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

/** DELETE /knowledge/:id -- soft delete. */
export function softDeleteKnowledge(id: string) {
  return request<null>(`/knowledge/${id}`, { method: "DELETE" });
}

/** GET /knowledge/:id/pdf -- not a JSON envelope, so this returns a direct
 *  download URL rather than going through request(). */
export function knowledgePdfUrl(id: string) {
  return `${BASE_URL}/knowledge/${id}/pdf`;
}

/** GET /chat/conversations -- paginated conversation list for the sidebar. */
export function listConversations(params: { page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const qs = query.toString();
  return request<PaginatedResult<Conversation>>(`/chat/conversations${qs ? `?${qs}` : ""}`);
}

/** GET /chat/conversations/:id -- a conversation plus its full message history. */
export function getConversation(id: string) {
  return request<{ conversation: Conversation; messages: Message[] }>(`/chat/conversations/${id}`);
}

/** POST /chat/save -- converts an External AI answer into a Knowledge entry. */
export function saveAnswerToKnowledge(messageId: string) {
  return request<{ knowledgeId: string; title: string }>("/chat/save", {
    method: "POST",
    body: JSON.stringify({ messageId }),
  });
}

export interface ChatStreamHandlers {
  onDelta: (delta: string) => void;
  onDone: (summary: ChatAnswerSummary) => void;
  onError: (message: string) => void;
}

/**
 * POST /chat -- reads the backend's Server-Sent Events stream via fetch()
 * (not EventSource, since EventSource can't send a POST body). Parses raw
 * "event: ...\ndata: ...\n\n" frames as they arrive and forwards each one
 * to the matching handler. Passing `signal` lets the caller cancel
 * generation mid-stream (Stop Generation) -- the backend already tears
 * down its AbortController on `req.on("close")`.
 */
export async function streamChat(
  payload: { question: string; conversationId?: string; knowledgeScope?: string | null },
  handlers: ChatStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError("Could not reach the server. Please try again.");
    return;
  }

  if (!res.ok || !res.body) {
    let message = "Chat request failed.";
    try {
      const body = (await res.json()) as ApiEnvelope<unknown>;
      message = body.message ?? message;
    } catch {
      // response wasn't JSON (e.g. the stream had already started) -- keep the default message
    }
    handlers.onError(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        let event = "message";
        let data = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) event = line.slice(6).trim();
          else if (line.startsWith("data:")) data += line.slice(5).trim();
        }

        if (data) {
          const parsed = JSON.parse(data);
          if (event === "delta") handlers.onDelta(parsed.delta);
          else if (event === "done") handlers.onDone(parsed as ChatAnswerSummary);
          else if (event === "error") handlers.onError(parsed.message ?? "Something went wrong.");
        }

        boundary = buffer.indexOf("\n\n");
      }
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError("Connection to the AI was interrupted. Please try again.");
  }
}

export { ApiError };