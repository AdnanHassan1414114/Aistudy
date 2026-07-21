import { JobStatus, Prisma, ProcessingJob } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { PaginatedResult, PaginationParams } from "../interfaces";

export class ProcessingJobRepository {
  async findById(id: string): Promise<ProcessingJob | null> {
    return prisma.processingJob.findUnique({ where: { id } });
  }

  async findLatestForKnowledge(knowledgeId: string): Promise<ProcessingJob | null> {
    return prisma.processingJob.findFirst({
      where: { knowledgeId },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(knowledgeId: string): Promise<ProcessingJob> {
    return prisma.processingJob.create({
      data: {
        knowledgeId,
        status: JobStatus.QUEUED,
        currentStep: JobStatus.QUEUED,
        progressPercentage: 0,
      },
    });
  }

  async markStarted(id: string, workerId: string, retryCount: number): Promise<ProcessingJob> {
    return prisma.processingJob.update({
      where: { id },
      data: { startedAt: new Date(), workerId, retryCount },
    });
  }

  async updateProgress(
    id: string,
    data: {
      status?: JobStatus;
      currentStep: JobStatus;
      progressPercentage: number;
      estimatedRemainingSeconds?: number | null;
    }
  ): Promise<ProcessingJob> {
    return prisma.processingJob.update({ where: { id }, data });
  }

  /** Marks the job done and records total processing time (startedAt -> completedAt). */
  async markCompleted(id: string, executionTime: number): Promise<ProcessingJob> {
    return prisma.processingJob.update({
      where: { id },
      data: {
        status: JobStatus.COMPLETED,
        currentStep: JobStatus.COMPLETED,
        progressPercentage: 100,
        completedAt: new Date(),
        executionTime,
        estimatedRemainingSeconds: 0,
      },
    });
  }

  async markFailed(id: string, failureReason: string): Promise<ProcessingJob> {
    return prisma.processingJob.update({
      where: { id },
      data: {
        status: JobStatus.FAILED,
        failureReason,
        completedAt: new Date(),
      },
    });
  }

  async list(
    filters: PaginationParams & { status?: JobStatus }
  ): Promise<PaginatedResult<ProcessingJob>> {
    const { page, pageSize, status } = filters;
    const where: Prisma.ProcessingJobWhereInput = status ? { status } : {};

    const [items, totalItems] = await Promise.all([
      prisma.processingJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.processingJob.count({ where }),
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

export const processingJobRepository = new ProcessingJobRepository();
