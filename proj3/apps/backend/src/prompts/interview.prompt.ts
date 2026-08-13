import { InterviewDifficulty, InterviewType } from "@prisma/client";
import { env } from "../config/env";
import { PreviousQA } from "../types";
import { buildNoteContext } from "../utils/promptContext";

interface ContextChunk {
  knowledgeTitle: string;
  heading: string | null;
  section: string | null;
  content: string;
}

const DIFFICULTY_GUIDANCE: Record<InterviewDifficulty, string> = {
  EASY: "Keep questions foundational — definitions, basic usage, and simple \"what/why\" questions.",
  MEDIUM: "Ask questions that require applying the concept, not just recalling it — comparisons, trade-offs, \"how would you\".",
  HARD: "Ask questions that probe edge cases, internals, failure modes, and design trade-offs in depth.",
};

const TYPE_GUIDANCE: Record<InterviewType, string> = {
  THEORY: "Ask only conceptual/theory questions. Do not ask the candidate to write code.",
  CODING: "Ask only coding/practical questions — ask the candidate to write or trace through code, or solve a small problem.",
  MIXED: "Alternate between conceptual/theory questions and coding/practical questions across the interview.",
};

/**
 * Builds the prompt for generating exactly ONE interview question, grounded
 * only in the retrieved notes. Mirrors buildPersonalKnowledgePrompt's
 * strictness — an interview question drawn from outside the user's own
 * notes would defeat the entire point of this milestone.
 */
export function buildInterviewQuestionPrompt(params: {
  topic: string;
  difficulty: InterviewDifficulty;
  interviewType: InterviewType;
  questionNumber: number;
  totalQuestions: number;
  chunks: ContextChunk[];
  previousQA: PreviousQA[];
}): { system: string; user: string } {
  const { topic, difficulty, interviewType, questionNumber, totalQuestions, chunks, previousQA } = params;

  const system = `You are conducting a technical interview on "${topic}".

Rules:
- Act as a technical interviewer, not a tutor or chatbot.
- Generate the question ONLY from the notes provided below. Do not use any outside/general knowledge.
- Ask exactly ONE question. Do not ask multiple questions in one turn.
- Do not answer the question yourself. Do not include hints or the answer.
- ${DIFFICULTY_GUIDANCE[difficulty]}
- ${TYPE_GUIDANCE[interviewType]}
- This is question ${questionNumber} of ${totalQuestions} — increase difficulty gradually as the interview progresses; later questions should build on earlier ones rather than restart the topic.
- Do not repeat or closely rephrase any previous question listed below.
- Do not jump to a topic unrelated to "${topic}" or outside the provided notes.
- Keep the question concise (1-3 sentences).
- Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{ "question": string }`;

  const context = buildNoteContext(
    chunks,
    (c, n) => `### Note ${n} — ${[c.knowledgeTitle, c.heading, c.section].filter(Boolean).join(" > ")}\n${c.content}`,
    env.RAG_MAX_CONTEXT_CHARS
  );

  const historyBlock =
    previousQA.length === 0
      ? "(none — this is the first question)"
      : previousQA
          .map((qa) => `Q${qa.questionNumber}: ${qa.question}${qa.answer ? `\nA${qa.questionNumber}: ${qa.answer}` : ""}`)
          .join("\n\n");

  const user = `Notes:\n\n${context}\n\n---\n\nPrevious questions and answers in this interview:\n\n${historyBlock}\n\n---\n\nGenerate question ${questionNumber} of ${totalQuestions} now.`;

  return { system, user };
}