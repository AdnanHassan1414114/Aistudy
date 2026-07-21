// Mirrors apps/backend/src/types/learningAgent.types.ts. Frontend-only
// presentation types -- no logic, just the response shape.

export type LearningAgentIntent = "CHAT" | "INTERVIEW" | "REVISION";

export type LearningAgentReference = Record<string, unknown>;

export interface LearningAgentRequestInput {
  message: string;
  conversationId?: string;
  interviewId?: string;
}

export interface LearningAgentResult {
  workflowSelected: LearningAgentIntent;
  response: string;
  references: LearningAgentReference[];
  conversationId: string | null;
  interviewId: string | null;
}

/** One turn in the agent page's local conversation log. Purely a frontend
 *  presentation concept -- the backend has no notion of this shape, it's
 *  just how the page renders a running back-and-forth. */
export interface LearningAgentTurn {
  id: string;
  role: "USER" | "AGENT";
  content: string;
  workflow?: LearningAgentIntent;
  references?: LearningAgentReference[];
}
