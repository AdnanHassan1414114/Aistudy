// Mirrors apps/backend/src/types/interview.types.ts (InterviewResults) and
// the Interview / InterviewQuestion / InterviewAnswer Prisma models.
// Frontend-only presentation types -- no logic, just the response shape.

export type InterviewStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
export type InterviewDifficulty = "EASY" | "MEDIUM" | "HARD";
export type InterviewType = "THEORY" | "CODING" | "MIXED";
export type InterviewMode = "QUICK" | "CUSTOM";

export interface Interview {
  id: string;
  topic: string;
  category: string | null;
  mode: InterviewMode;
  difficulty: InterviewDifficulty;
  interviewType: InterviewType;
  totalQuestions: number;
  currentQuestionNumber: number;
  status: InterviewStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

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

export interface InterviewResultSummary {
  interviewId: string;
  topic: string;
  difficulty: InterviewDifficulty;
  interviewType: InterviewType;
  mode: InterviewMode;
  status: InterviewStatus;
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

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  errors: unknown[] | null;
  timestamp: string;
  requestId: string | null;
}

// ── Interview Session (Phase 3) ─────────────────────────────────────────
// Mirrors apps/backend/src/services/interview.service.ts and the
// InterviewQuestion / InterviewAnswer Prisma models.

export interface InterviewKnowledgeRef {
  knowledgeId: string;
  title: string;
  heading: string | null;
  section: string | null;
  similarity: number;
}

export interface InterviewAnswerData {
  id: string;
  content: string;
  answeredAt: string;
  overallScore: number | null;
  conceptAccuracy: number | null;
  completeness: number | null;
  clarity: number | null;
  strengths: string[] | null;
  missingTopics: string[] | null;
  feedback: string | null;
  evaluatedAt: string | null;
}

export interface InterviewQuestionWithAnswer {
  id: string;
  interviewId: string;
  questionNumber: number;
  content: string;
  knowledgeRefs: InterviewKnowledgeRef[] | null;
  createdAt: string;
  answer: InterviewAnswerData | null;
}

export type StartInterviewInput =
  | { mode: "QUICK"; message: string }
  | {
      mode: "CUSTOM";
      topic: string;
      difficulty: InterviewDifficulty;
      interviewType: InterviewType;
      numberOfQuestions: number;
    };

export interface StartInterviewResult {
  interview: Interview;
  firstQuestion: InterviewQuestionWithAnswer;
}

export interface AnswerEvaluationSummary {
  complete: true;
  currentScore: number;
}

export type SubmitAnswerResult =
  | { interview: Interview; firstQuestion: InterviewQuestionWithAnswer; evaluation: AnswerEvaluationSummary }
  | { interview: Interview; evaluation: AnswerEvaluationSummary };

export function hasNextQuestion(
  result: SubmitAnswerResult
): result is { interview: Interview; firstQuestion: InterviewQuestionWithAnswer; evaluation: AnswerEvaluationSummary } {
  return "firstQuestion" in result;
}
