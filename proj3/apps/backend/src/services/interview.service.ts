import { Interview, InterviewDifficulty, InterviewMode, InterviewStatus, InterviewType } from "@prisma/client";
import { interviewRepository, interviewQuestionRepository, InterviewQuestionWithAnswer } from "../repositories";
import { retrievalService } from "./retrieval.service";
import { interviewQuestionGenerationService } from "./interviewQuestionGeneration.service";
import { answerEvaluationService } from "./answerEvaluation.service";
import { revisionService } from "./revision.service";
import { extractTopicFromMessage } from "../utils/interviewTopic";
import { normalizeWhitespace } from "../utils/text";
import { DEFAULT_USER_ID } from "../constants";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { PaginatedResult } from "../interfaces";
import { KnowledgeReference, PreviousQA, InterviewResults, InterviewResultSummary, QuestionReviewItem } from "../types";

export interface StartQuickInterviewInput {
  mode: "QUICK";
  message: string;
}

export interface StartCustomInterviewInput {
  mode: "CUSTOM";
  topic: string;
  difficulty: InterviewDifficulty;
  interviewType: InterviewType;
  numberOfQuestions: number;
}

export type StartInterviewInput = StartQuickInterviewInput | StartCustomInterviewInput;

export interface InterviewWithQuestions {
  interview: Interview;
  questions: InterviewQuestionWithAnswer[];
}

export interface StartInterviewResult {
  interview: Interview;
  firstQuestion: InterviewQuestionWithAnswer;
}

/** Milestone 4 Part 1 — what the frontend gets after an answer is scored.
 *  Deliberately minimal: no strengths/missingTopics/feedback yet — those
 *  are stored (InterviewAnswer) but not surfaced until a later milestone. */
export interface AnswerEvaluationSummary {
  complete: true;
  currentScore: number;
}

export type SubmitAnswerResult =
  | (StartInterviewResult & { evaluation: AnswerEvaluationSummary })
  | { interview: Interview; evaluation: AnswerEvaluationSummary };

const log = logger.child({ scope: "interview" });

/**
 * Orchestrates the Interview Engine flow described in the Milestone 3 spec:
 * start -> retrieve notes -> generate one question -> wait for answer ->
 * store -> generate next -> ... -> complete. Never generates more than one
 * question ahead of the candidate's last answer.
 *
 * Deliberately NOT an agent: no planning, no weak-area detection, no
 * autonomous multi-step reasoning. Each question is one grounded LLM call
 * driven entirely by explicit interview state.
 */
export class InterviewService {
  async start(input: StartInterviewInput): Promise<StartInterviewResult> {
    const { topic, mode, difficulty, interviewType, totalQuestions } = this.resolveStartParams(input);

    if (!topic) {
      throw AppError.badRequest("Could not determine a topic for this interview.");
    }

    const interview = await interviewRepository.create({
      userId: DEFAULT_USER_ID,
      topic,
      category: null,
      mode,
      difficulty,
      interviewType,
      totalQuestions,
    });

    log.info("Interview started", { interviewId: interview.id, topic, mode, difficulty, interviewType, totalQuestions });

    const firstQuestion = await this.generateAndStoreNextQuestion(interview, []);

    return { interview: await interviewRepository.incrementQuestionNumber(interview.id), firstQuestion };
  }

  async submitAnswer(interviewId: string, answer: string): Promise<SubmitAnswerResult> {
    const interview = await this.getOrThrow(interviewId);

    if (interview.status !== InterviewStatus.IN_PROGRESS) {
      throw AppError.badRequest(`Interview is ${interview.status.toLowerCase()} and cannot accept more answers.`);
    }

    const currentQuestion = await interviewQuestionRepository.findByInterviewAndNumber(
      interviewId,
      interview.currentQuestionNumber
    );
    if (!currentQuestion) {
      throw AppError.internal("Interview has no current question to answer.");
    }
    if (currentQuestion.answer) {
      throw AppError.badRequest("This question has already been answered.");
    }

    const trimmedAnswer = normalizeWhitespace(answer);
    if (!trimmedAnswer) {
      throw AppError.badRequest("Answer cannot be empty.");
    }

    await interviewQuestionRepository.saveAnswer(currentQuestion.id, trimmedAnswer);
    log.info("Interview answer saved", { interviewId, questionNumber: currentQuestion.questionNumber });

    const evaluationSummary = await this.evaluateAndStore(interview, currentQuestion, trimmedAnswer);

    if (interview.currentQuestionNumber >= interview.totalQuestions) {
      const completed = await interviewRepository.markCompleted(interviewId);
      log.info("Interview completed", { interviewId, totalQuestions: interview.totalQuestions });

      // Milestone 5 — fire-and-forget: runs the LangGraph revision-plan
      // workflow in the background. Never awaited/blocking, never throws
      // into this response; the candidate sees "interview completed"
      // immediately regardless of how long revision-plan generation takes.
      revisionService.generateForCompletedInterview(interviewId);

      return { interview: completed, evaluation: evaluationSummary };
    }

    const previousQA = await this.buildPreviousQA(interviewId);
    const nextQuestion = await this.generateAndStoreNextQuestion(interview, previousQA);
    const updated = await interviewRepository.incrementQuestionNumber(interviewId);

    return { interview: updated, firstQuestion: nextQuestion, evaluation: evaluationSummary };
  }

  async resume(interviewId: string): Promise<InterviewQuestionWithAnswer> {
    const interview = await this.getOrThrow(interviewId);

    if (interview.status !== InterviewStatus.IN_PROGRESS) {
      throw AppError.badRequest(`Interview is ${interview.status.toLowerCase()} and cannot be resumed.`);
    }

    const currentQuestion = await interviewQuestionRepository.findByInterviewAndNumber(
      interviewId,
      interview.currentQuestionNumber
    );
    if (!currentQuestion) {
      throw AppError.internal("Interview has no current question to resume.");
    }

    log.info("Interview resumed", { interviewId, questionNumber: currentQuestion.questionNumber });
    return currentQuestion;
  }

  async end(interviewId: string): Promise<Interview> {
    const interview = await this.getOrThrow(interviewId);

    if (interview.status !== InterviewStatus.IN_PROGRESS) {
      return interview;
    }

    const updated = await interviewRepository.markAbandoned(interviewId);
    log.info("Interview ended early", { interviewId, status: updated.status });
    return updated;
  }

  async getWithQuestions(interviewId: string): Promise<InterviewWithQuestions> {
    const interview = await this.getOrThrow(interviewId);
    const questions = await interviewQuestionRepository.listForInterview(interviewId);
    return { interview, questions };
  }

  async list(page: number, pageSize: number, status?: InterviewStatus): Promise<PaginatedResult<Interview>> {
    return interviewRepository.list({ page, pageSize, userId: DEFAULT_USER_ID, status });
  }

  /**
   * Milestone 4 Part 2 — GET /interviews/:id/questions.
   * Just the chronological question+answer(+evaluation) list, already
   * stored. Thin wrapper around the same repository call `getWithQuestions`
   * uses; no new business logic.
   */
  async getQuestions(interviewId: string): Promise<InterviewQuestionWithAnswer[]> {
    await this.getOrThrow(interviewId);
    return interviewQuestionRepository.listForInterview(interviewId);
  }

  /**
   * Milestone 4 Part 2 — GET /interviews/:id/results.
   * Presents the evaluation data stored in Milestone 4 Part 1
   * (InterviewAnswer.overallScore/conceptAccuracy/completeness/clarity/
   * strengths/missingTopics/feedback) for the Interview Result page.
   * Does not call the LLM, does not re-evaluate, does not analyze/group
   * missing topics — it only reads and reshapes what's already stored.
   */
  async getResults(interviewId: string): Promise<InterviewResults> {
    const interview = await this.getOrThrow(interviewId);
    const questions = await interviewQuestionRepository.listForInterview(interviewId);

    const reviewItems: QuestionReviewItem[] = questions.map((q) => ({
      questionNumber: q.questionNumber,
      question: q.content,
      userAnswer: q.answer?.content ?? null,
      answeredAt: q.answer?.answeredAt?.toISOString() ?? null,
      overallScore: q.answer?.overallScore ?? null,
      conceptAccuracy: q.answer?.conceptAccuracy ?? null,
      completeness: q.answer?.completeness ?? null,
      clarity: q.answer?.clarity ?? null,
      strengths: (q.answer?.strengths as string[] | null) ?? [],
      missingTopics: (q.answer?.missingTopics as string[] | null) ?? [],
      feedback: q.answer?.feedback ?? null,
      evaluatedAt: q.answer?.evaluatedAt?.toISOString() ?? null,
    }));

    const summary = this.buildSummary(interview, questions, reviewItems);

    return { summary, questions: reviewItems };
  }

  // ── internals ────────────────────────────────────────────────────────

  /** Pure aggregation over already-stored scores — see InterviewResultSummary
   *  doc comment for what `overallScore` vs `averageScore` mean. */
  private buildSummary(
    interview: Interview,
    questions: InterviewQuestionWithAnswer[],
    reviewItems: QuestionReviewItem[]
  ): InterviewResultSummary {
    const evaluated = reviewItems.filter((q) => q.overallScore !== null);

    const round1 = (n: number): number => Math.round(n * 10) / 10;

    const overallScore =
      evaluated.length > 0
        ? round1(evaluated.reduce((sum, q) => sum + (q.overallScore as number), 0) / evaluated.length)
        : null;

    const averageScore =
      evaluated.length > 0
        ? round1(
            evaluated.reduce((sum, q) => {
              const metrics = [q.overallScore, q.conceptAccuracy, q.completeness, q.clarity].filter(
                (m): m is number => m !== null
              );
              const metricAvg = metrics.reduce((a, b) => a + b, 0) / metrics.length;
              return sum + metricAvg;
            }, 0) / evaluated.length
          )
        : null;

    const durationSeconds = interview.completedAt
      ? Math.round((interview.completedAt.getTime() - interview.startedAt.getTime()) / 1000)
      : null;

    return {
      interviewId: interview.id,
      topic: interview.topic,
      difficulty: interview.difficulty,
      interviewType: interview.interviewType,
      mode: interview.mode,
      status: interview.status,
      overallScore,
      averageScore,
      numberOfQuestions: interview.totalQuestions,
      questionsAnswered: questions.filter((q) => q.answer).length,
      questionsEvaluated: evaluated.length,
      durationSeconds,
      startedAt: interview.startedAt.toISOString(),
      completedAt: interview.completedAt?.toISOString() ?? null,
    };
  }

  private resolveStartParams(input: StartInterviewInput): {
    topic: string;
    mode: InterviewMode;
    difficulty: InterviewDifficulty;
    interviewType: InterviewType;
    totalQuestions: number;
  } {
    if (input.mode === "QUICK") {
      const topic = extractTopicFromMessage(normalizeWhitespace(input.message));
      return {
        topic,
        mode: InterviewMode.QUICK,
        difficulty: InterviewDifficulty.MEDIUM,
        interviewType: InterviewType.MIXED,
        totalQuestions: env.INTERVIEW_QUICK_DEFAULT_QUESTIONS,
      };
    }

    const totalQuestions = Math.min(Math.max(input.numberOfQuestions, 1), env.INTERVIEW_MAX_QUESTIONS);
    return {
      topic: normalizeWhitespace(input.topic),
      mode: InterviewMode.CUSTOM,
      difficulty: input.difficulty,
      interviewType: input.interviewType,
      totalQuestions,
    };
  }

  private async getOrThrow(interviewId: string): Promise<Interview> {
    const interview = await interviewRepository.findById(interviewId);
    if (!interview) throw AppError.notFound("Interview not found.");
    return interview;
  }

  private async buildPreviousQA(interviewId: string): Promise<PreviousQA[]> {
    const questions = await interviewQuestionRepository.listForInterview(interviewId);
    return questions.map((q) => ({
      questionNumber: q.questionNumber,
      question: q.content,
      answer: q.answer?.content ?? null,
    }));
  }

  /**
   * Milestone 4 Part 1 flow: retrieve the same kind of notes that grounded
   * the question (via RetrievalService, scoped exactly like question
   * generation) -> evaluation prompt -> LLM -> structured JSON -> store on
   * the InterviewAnswer. Runs automatically after every submitted answer,
   * before the next question is generated.
   */
  private async evaluateAndStore(
    interview: Interview,
    question: InterviewQuestionWithAnswer,
    answer: string
  ): Promise<AnswerEvaluationSummary> {
    const retrieval = await retrievalService.retrieve(question.content, { category: interview.category });

    const evaluation = await answerEvaluationService.evaluate({
      interviewId: interview.id,
      question: question.content,
      answer,
      chunks: retrieval.chunks,
    });

    await interviewQuestionRepository.saveEvaluation(question.id, evaluation);
    log.info("Interview answer evaluated", {
      interviewId: interview.id,
      questionNumber: question.questionNumber,
      overallScore: evaluation.overallScore,
    });

    return { complete: true, currentScore: evaluation.overallScore };
  }

  /**
   * Retrieval -> generation -> persistence for exactly one question.
   * Reuses RetrievalService as-is (question -> embedding -> pgvector),
   * passing the interview topic as the retrieval query.
   */
  private async generateAndStoreNextQuestion(
    interview: Interview,
    previousQA: PreviousQA[]
  ): Promise<InterviewQuestionWithAnswer> {
    const nextQuestionNumber = interview.currentQuestionNumber + 1;

    const retrieval = await retrievalService.retrieve(interview.topic, { category: interview.category });
    if (!retrieval.meetsThreshold) {
      throw AppError.badRequest(
        `Not enough personal knowledge found on "${interview.topic}" to run an interview. Add some notes on this topic first.`
      );
    }

    const generated = await interviewQuestionGenerationService.generateNext(
      interview,
      nextQuestionNumber,
      retrieval.chunks,
      previousQA
    );

    const knowledgeRefs: KnowledgeReference[] = retrieval.chunks.map((c) => ({
      knowledgeId: c.knowledgeId,
      title: c.knowledgeTitle,
      heading: c.heading,
      section: c.section,
      similarity: c.similarity,
    }));

    const question = await interviewQuestionRepository.create({
      interviewId: interview.id,
      questionNumber: nextQuestionNumber,
      content: generated.question,
      knowledgeRefs,
    });

    log.info("Interview question generated", { interviewId: interview.id, questionNumber: nextQuestionNumber });

    return { ...question, answer: null };
  }
}

export const interviewService = new InterviewService();
