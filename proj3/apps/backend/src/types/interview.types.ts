import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// AI question-generation structured output contract (validated with Zod),
// mirrors the generate/validate pattern used by generatedNotesSchema.
// ─────────────────────────────────────────────────────────────────────────
export const generatedQuestionSchema = z.object({
  question: z.string().min(1),
});
export type GeneratedQuestionPayload = z.infer<typeof generatedQuestionSchema>;

export interface PreviousQA {
  questionNumber: number;
  question: string;
  answer: string | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Milestone 4 Part 1 — AI answer-evaluation structured output contract.
// Scores are 0-10, mirrors the generate/validate/retry pattern used by
// generatedQuestionSchema / generatedNotesSchema.
// ─────────────────────────────────────────────────────────────────────────
export const answerEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(10),
  conceptAccuracy: z.number().int().min(0).max(10),
  completeness: z.number().int().min(0).max(10),
  clarity: z.number().int().min(0).max(10),
  strengths: z.array(z.string()).default([]),
  missingTopics: z.array(z.string()).default([]),
  feedback: z.string().min(1),
});
export type AnswerEvaluationPayload = z.infer<typeof answerEvaluationSchema>;

// ─────────────────────────────────────────────────────────────────────────
// Milestone 4 Part 2 — Interview Results & Evaluation Dashboard.
// Pure read/presentation types: reshapes data that already exists on
// Interview / InterviewQuestion / InterviewAnswer (via the repositories)
// into a single response for the results page. Nothing here is computed
// by an LLM — scores/feedback/strengths/missingTopics are copied verbatim
// from the stored evaluation (InterviewAnswer), and the two summary
// aggregates (overallScore / averageScore) are simple arithmetic over
// those stored numbers.
// ─────────────────────────────────────────────────────────────────────────

/** One question + its (possibly absent) answer and stored evaluation,
 *  in the exact shape the Interview Result page renders per question. */
export interface QuestionReviewItem {
  questionNumber: number;
  question: string;
  userAnswer: string | null;
  answeredAt: string | null;
  overallScore: number | null;
  conceptAccuracy: number | null;
  completeness: number | null;
  clarity: number | null;
  strengths: string[];
  missingTopics: string[];
  feedback: string | null;
  evaluatedAt: string | null;
}

/** Top-of-page summary. `overallScore` is the average of each answered
 *  question's stored `overallScore` (the headline number). `averageScore`
 *  is the average across *all* stored sub-metrics (overallScore +
 *  conceptAccuracy + completeness + clarity) for a broader read on
 *  performance. Both are null until at least one question has been
 *  evaluated. Scores are 0-10, one decimal place. */
export interface InterviewResultSummary {
  interviewId: string;
  topic: string;
  difficulty: string;
  interviewType: string;
  mode: string;
  status: string;
  overallScore: number | null;
  averageScore: number | null;
  numberOfQuestions: number;
  questionsAnswered: number;
  questionsEvaluated: number;
  durationSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface InterviewResults {
  summary: InterviewResultSummary;
  questions: QuestionReviewItem[];
}
