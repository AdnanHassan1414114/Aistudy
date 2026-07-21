import { AiUsageLog } from "@prisma/client";
import { prisma } from "../database/prismaClient";

export interface CreateAiUsageLogData {
  jobId: string;
  stage: string;
  provider: string;
  model: string;
}

/** Minimal record of which provider/model handled each AI call — for debugging, not billing. */
export class AiUsageLogRepository {
  async create(data: CreateAiUsageLogData): Promise<AiUsageLog> {
    return prisma.aiUsageLog.create({ data });
  }

  async listForJob(jobId: string): Promise<AiUsageLog[]> {
    return prisma.aiUsageLog.findMany({ where: { jobId }, orderBy: { createdAt: "asc" } });
  }
}

export const aiUsageLogRepository = new AiUsageLogRepository();
