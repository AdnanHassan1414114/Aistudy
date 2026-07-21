/**
 * Milestone 6 — Intelligent Learning Agent.
 *
 * A single, lightweight LLM prompt used to classify a free-text user
 * request into exactly one of the three existing workflows. Deliberately
 * NOT a trained classifier model and NOT a multi-step planner — one prompt,
 * one JSON object back, same "structured output" convention used by
 * chat/interview/revision prompts elsewhere in this codebase.
 */
export function buildIntentDetectionPrompt(
  message: string,
  hasActiveInterview: boolean
): { system: string; user: string } {
  const system = `You are the intent router for a learning agent that has exactly three workflows available: CHAT, INTERVIEW, REVISION.

Definitions:
- CHAT: the user is asking a question, wants an explanation, or wants to discuss/learn about a topic conversationally.
- INTERVIEW: the user wants to be quizzed or tested, wants to start, resume, or continue a mock interview.
- REVISION: the user wants a revision/study plan, wants to review or study their weak areas from a past interview.

Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{"intent": "CHAT" | "INTERVIEW" | "REVISION"}`;

  const user = `User request: "${message}"${
    hasActiveInterview ? "\n\n(Note: an interview is currently in context for this request.)" : ""
  }`;

  return { system, user };
}

/**
 * Deterministic keyword fallback, used only if the LLM call fails or
 * returns something that doesn't parse as valid JSON. Keeps the agent
 * available even when the AI provider has a transient failure, rather than
 * failing the whole request over a routing decision.
 */
export function detectIntentHeuristically(message: string): "CHAT" | "INTERVIEW" | "REVISION" {
  const text = message.toLowerCase();

  const revisionKeywords = ["revise", "revision", "weak area", "study plan", "brush up", "review my"];
  if (revisionKeywords.some((kw) => text.includes(kw))) return "REVISION";

  const interviewKeywords = ["interview", "quiz me", "test me", "question me", "mock interview", "resume my"];
  if (interviewKeywords.some((kw) => text.includes(kw))) return "INTERVIEW";

  return "CHAT";
}
