import { LearningPath, Prisma } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { LearningPathResult, LearningPathStep } from "../types";

export interface UpsertLearningPathData {
  interviewId: string;
  steps: LearningPathStep[];
}

/**
 * Encapsulates all Prisma access for LearningPath. Mirrors
 * RevisionPlanRepository's convention exactly — one repository per
 * closely-related entity, services must never import `prisma` directly.
 */
export class LearningPathRepository {
  async upsert(data: UpsertLearningPathData): Promise<LearningPath> {
    const payload = {
      steps: data.steps as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
    };

    return prisma.learningPath.upsert({
      where: { interviewId: data.interviewId },
      create: { interviewId: data.interviewId, ...payload },
      update: payload,
    });
  }

  async findByInterviewId(interviewId: string): Promise<LearningPath | null> {
    return prisma.learningPath.findUnique({ where: { interviewId } });
  }
}

export const learningPathRepository = new LearningPathRepository();

/** Unwraps the JSON `steps` column back into its typed shape for callers. */
export function toLearningPathResult(path: LearningPath): LearningPathResult {
  return {
    interviewId: path.interviewId,
    steps: path.steps as unknown as LearningPathStep[],
    generatedAt: path.generatedAt.toISOString(),
  };
}
