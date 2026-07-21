import { InterviewAnswer, InterviewQuestion, Prisma } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { KnowledgeReference, AnswerEvaluationPayload } from "../types";

export interface CreateQuestionData {
  interviewId: string;
  questionNumber: number;
  content: string;
  knowledgeRefs: KnowledgeReference[];
}

export type InterviewQuestionWithAnswer = InterviewQuestion & { answer: InterviewAnswer | null };

/**
 * Encapsulates all Prisma access for InterviewQuestion / InterviewAnswer.
 * Kept as one repository since the two models are always read/written
 * together from the interview flow's point of view (1:1, cascade-deleted).
 */
export class InterviewQuestionRepository {
  async create(data: CreateQuestionData): Promise<InterviewQuestion> {
    return prisma.interviewQuestion.create({
      data: {
        interviewId: data.interviewId,
        questionNumber: data.questionNumber,
        content: data.content,
        knowledgeRefs: data.knowledgeRefs as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async findByInterviewAndNumber(
    interviewId: string,
    questionNumber: number
  ): Promise<InterviewQuestionWithAnswer | null> {
    return prisma.interviewQuestion.findUnique({
      where: { interviewId_questionNumber: { interviewId, questionNumber } },
      include: { answer: true },
    });
  }

  async listForInterview(interviewId: string): Promise<InterviewQuestionWithAnswer[]> {
    return prisma.interviewQuestion.findMany({
      where: { interviewId },
      include: { answer: true },
      orderBy: { questionNumber: "asc" },
    });
  }

  async saveAnswer(interviewQuestionId: string, content: string): Promise<InterviewAnswer> {
    return prisma.interviewAnswer.upsert({
      where: { interviewQuestionId },
      create: { interviewQuestionId, content },
      update: { content, answeredAt: new Date() },
    });
  }

  /** Milestone 4 Part 1 — persists the structured AI evaluation of an
   *  already-saved answer. Never displayed in detail to the frontend yet;
   *  stored in full (evaluationRaw) for future milestones. */
  async saveEvaluation(interviewQuestionId: string, evaluation: AnswerEvaluationPayload): Promise<InterviewAnswer> {
    return prisma.interviewAnswer.update({
      where: { interviewQuestionId },
      data: {
        overallScore: evaluation.overallScore,
        conceptAccuracy: evaluation.conceptAccuracy,
        completeness: evaluation.completeness,
        clarity: evaluation.clarity,
        strengths: evaluation.strengths as unknown as Prisma.InputJsonValue,
        missingTopics: evaluation.missingTopics as unknown as Prisma.InputJsonValue,
        feedback: evaluation.feedback,
        evaluationRaw: evaluation as unknown as Prisma.InputJsonValue,
        evaluatedAt: new Date(),
      },
    });
  }
}

export const interviewQuestionRepository = new InterviewQuestionRepository();
