import { LogLevel, ProcessingLog } from "@prisma/client";
import { prisma } from "../database/prismaClient";

export class ProcessingLogRepository {
  async create(data: {
    jobId: string;
    step: string;
    message: string;
    level?: LogLevel;
    metadata?: Record<string, unknown>;
  }): Promise<ProcessingLog> {
    return prisma.processingLog.create({
      data: {
        jobId: data.jobId,
        step: data.step,
        message: data.message,
        level: data.level ?? LogLevel.INFO,
        metadata: data.metadata as never,
      },
    });
  }

  async listForJob(jobId: string): Promise<ProcessingLog[]> {
    return prisma.processingLog.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const processingLogRepository = new ProcessingLogRepository();
