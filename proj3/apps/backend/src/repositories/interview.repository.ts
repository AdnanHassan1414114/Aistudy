import { Interview, InterviewDifficulty, InterviewMode, InterviewStatus, InterviewType, Prisma } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { PaginatedResult, PaginationParams } from "../interfaces";

export interface CreateInterviewData {
  userId: string | null;
  topic: string;
  category?: string | null;
  mode: InterviewMode;
  difficulty: InterviewDifficulty;
  interviewType: InterviewType;
  totalQuestions: number;
}

export interface InterviewListFilters extends PaginationParams {
  userId: string | null;
  status?: InterviewStatus;
}

/**
 * Encapsulates all Prisma access for the Interview entity. Services must
 * never import `prisma` directly for interview queries — mirrors
 * KnowledgeRepository / ChatService's Conversation pattern.
 */
export class InterviewRepository {
  async create(data: CreateInterviewData): Promise<Interview> {
    return prisma.interview.create({ data });
  }

  async findById(id: string): Promise<Interview | null> {
    return prisma.interview.findUnique({ where: { id } });
  }

  async incrementQuestionNumber(id: string): Promise<Interview> {
    return prisma.interview.update({
      where: { id },
      data: { currentQuestionNumber: { increment: 1 } },
    });
  }

  async markCompleted(id: string): Promise<Interview> {
    return prisma.interview.update({
      where: { id },
      data: { status: InterviewStatus.COMPLETED, completedAt: new Date() },
    });
  }

  async markAbandoned(id: string): Promise<Interview> {
    return prisma.interview.update({
      where: { id },
      data: { status: InterviewStatus.ABANDONED, completedAt: new Date() },
    });
  }

  async touch(id: string): Promise<void> {
    await prisma.interview.update({ where: { id }, data: { updatedAt: new Date() } });
  }

  async list(filters: InterviewListFilters): Promise<PaginatedResult<Interview>> {
    const { page, pageSize, userId, status } = filters;

    const where: Prisma.InterviewWhereInput = {
      userId,
      ...(status ? { status } : {}),
    };

    const [items, totalItems] = await Promise.all([
      prisma.interview.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.interview.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }
}

export const interviewRepository = new InterviewRepository();
