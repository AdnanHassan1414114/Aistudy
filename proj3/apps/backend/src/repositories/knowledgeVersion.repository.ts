import { KnowledgeVersion } from "@prisma/client";
import { prisma } from "../database/prismaClient";

export class KnowledgeVersionRepository {
  async create(data: {
    knowledgeId: string;
    version: number;
    notes: string;
    editedBy?: string | null;
  }): Promise<KnowledgeVersion> {
    return prisma.knowledgeVersion.create({ data });
  }

  async listForKnowledge(knowledgeId: string): Promise<KnowledgeVersion[]> {
    return prisma.knowledgeVersion.findMany({
      where: { knowledgeId },
      orderBy: { version: "desc" },
    });
  }

  async findVersion(knowledgeId: string, version: number): Promise<KnowledgeVersion | null> {
    return prisma.knowledgeVersion.findUnique({
      where: { knowledgeId_version: { knowledgeId, version } },
    });
  }

  async latestVersionNumber(knowledgeId: string): Promise<number> {
    const latest = await prisma.knowledgeVersion.findFirst({
      where: { knowledgeId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    return latest?.version ?? 0;
  }

  async deleteAllForKnowledge(knowledgeId: string): Promise<void> {
    await prisma.knowledgeVersion.deleteMany({ where: { knowledgeId } });
  }
}

export const knowledgeVersionRepository = new KnowledgeVersionRepository();
