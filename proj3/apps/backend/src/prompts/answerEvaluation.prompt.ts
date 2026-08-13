import { env } from "../config/env";
import { buildNoteContext } from "../utils/promptContext";

interface ContextChunk {
  knowledgeTitle: string;
  heading: string | null;
  section: string | null;
  content: string;
}

/**
 * Builds the prompt for evaluating exactly ONE interview answer, grounded
 * only in the retrieved notes — mirrors buildInterviewQuestionPrompt's
 * strictness. The LLM must never fall back to its own general knowledge:
 * an answer is right or wrong relative to what the candidate's own notes
 * say, not relative to the "correct" textbook answer.
 */
export function buildAnswerEvaluationPrompt(params: {
  question: string;
  answer: string;
  chunks: ContextChunk[];
}): { system: string; user: string } {
  const { question, answer, chunks } = params;

  const system = `You are a senior technical interviewer evaluating a candidate's spoken/written answer.

Rules:
- Evaluate ONLY the candidate's answer provided below. Do not answer the question yourself.
- Compare the answer ONLY against the notes provided below. Do not use any outside/general knowledge, even if the notes are incomplete or you believe they are wrong.
- If the notes don't cover something the candidate said, do not penalize or reward that claim — you have no basis to judge it from the notes alone.
- Score each dimension from 0 to 10 (integers only):
  - overallScore: overall quality of the answer relative to the notes.
  - conceptAccuracy: how technically accurate the answer is against the notes.
  - completeness: how much of the relevant material in the notes the answer covers.
  - clarity: how clearly and coherently the answer is communicated.
- strengths: short list of what the candidate got right, grounded in the notes.
- missingTopics: short list of relevant topics/points from the notes the answer omitted.
- feedback: 1-3 sentences of concise, constructive feedback.
- Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{ "overallScore": number, "conceptAccuracy": number, "completeness": number, "clarity": number, "strengths": string[], "missingTopics": string[], "feedback": string }`;

  let context = buildNoteContext(
    chunks,
    (c, n) => `### Note ${n} — ${[c.knowledgeTitle, c.heading, c.section].filter(Boolean).join(" > ")}\n${c.content}`,
    env.RAG_MAX_CONTEXT_CHARS
  );

  if (!context) {
    context = "(no notes were retrieved for this question)";
  }

  const user = `Notes:\n\n${context}\n\n---\n\nInterview question:\n${question}\n\n---\n\nCandidate's answer:\n${answer}\n\n---\n\nEvaluate the candidate's answer now.`;

  return { system, user };
}