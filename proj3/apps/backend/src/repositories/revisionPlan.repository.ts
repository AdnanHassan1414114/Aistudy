import { Prisma, RevisionPlan } from "@prisma/client";
import { prisma } from "../database/prismaClient";
import { RelatedKnowledgeItem, RevisionPriorityItem, TopicKnowledge, WeakTopicItem } from "../types";

export interface UpsertRevisionPlanData {
  interviewId: string;
  weakTopics: WeakTopicItem[];
  priorityList: RevisionPriorityItem[];
  planMarkdown: string;
  relatedNotes: TopicKnowledge[];
}

/**
 * Encapsulates all Prisma access for RevisionPlan. Mirrors
 * InterviewQuestionRepository's convention of one repository per
 * closely-related entity — services must never import `prisma` directly.
 */
export class RevisionPlanRepository {
  async upsert(data: UpsertRevisionPlanData): Promise<RevisionPlan> {
    const payload = {
      weakTopics: data.weakTopics as unknown as Prisma.InputJsonValue,
      priorityList: data.priorityList as unknown as Prisma.InputJsonValue,
      planMarkdown: data.planMarkdown,
      relatedNotes: data.relatedNotes as unknown as Prisma.InputJsonValue,
      generatedAt: new Date(),
    };

    return prisma.revisionPlan.upsert({
      where: { interviewId: data.interviewId },
      create: { interviewId: data.interviewId, ...payload },
      update: payload,
    });
  }

  async findByInterviewId(interviewId: string): Promise<RevisionPlan | null> {
    return prisma.revisionPlan.findUnique({ where: { interviewId } });
  }
}

export const revisionPlanRepository = new RevisionPlanRepository();

/** Unwraps the JSON columns back into their typed shapes for callers. */
export function toRevisionPlanResult(plan: RevisionPlan): {
  interviewId: string;
  weakTopics: WeakTopicItem[];
  priorityList: RevisionPriorityItem[];
  planMarkdown: string;
  relatedNotes: TopicKnowledge[];
  generatedAt: string;
} {
  return {
    interviewId: plan.interviewId,
    weakTopics: plan.weakTopics as unknown as WeakTopicItem[],
    priorityList: plan.priorityList as unknown as RevisionPriorityItem[],
    planMarkdown: plan.planMarkdown,
    relatedNotes: plan.relatedNotes as unknown as TopicKnowledge[],
    generatedAt: plan.generatedAt.toISOString(),
  };
}

export type { RelatedKnowledgeItem };
