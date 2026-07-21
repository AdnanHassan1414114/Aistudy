import { Interview } from "@prisma/client";
import { InterviewQuestionWithAnswer } from "../repositories";
import { WeakTopicItem } from "../types";
import { env } from "../config/env";
import { logger } from "../utils/logger";

/**
 * Milestone 5 — AnalyzeWeakAreasNode's business logic.
 *
 * Pure aggregation over already-stored InterviewAnswer evaluations
 * (overallScore, missingTopics) — never calls the LLM. Mirrors
 * InterviewService.buildSummary's "just arithmetic over stored data"
 * philosophy, applied to weak-topic detection instead of score summary.
 *
 * Signal sources:
 *  - Frequently missed concepts: each entry in a question's stored
 *    `missingTopics` (from Milestone 4's answer evaluation).
 *  - Repeated weak topics: topics that recur across more than one question.
 *  - Low scoring questions: questions whose overallScore falls below
 *    REVISION_LOW_SCORE_THRESHOLD. If such a question has no recorded
 *    missingTopics, it still needs to surface somewhere — it falls back to
 *    the interview's own topic so it isn't silently dropped.
 */
export class WeakAreaAnalysisService {
  analyze(interview: Interview, questions: InterviewQuestionWithAnswer[]): WeakTopicItem[] {
    const evaluated = questions.filter((q) => q.answer?.evaluatedAt);

    const byTopic = new Map<string, { missedCount: number; lowScoreCount: number; scores: number[] }>();

    const touch = (topic: string) => {
      const key = topic.trim();
      if (!key) return byTopic.get(topic);
      if (!byTopic.has(key)) byTopic.set(key, { missedCount: 0, lowScoreCount: 0, scores: [] });
      return byTopic.get(key)!;
    };

    for (const q of evaluated) {
      const overallScore = q.answer?.overallScore ?? null;
      const missingTopics = (q.answer?.missingTopics as string[] | null) ?? [];
      const isLowScore = overallScore !== null && overallScore < env.REVISION_LOW_SCORE_THRESHOLD;

      if (missingTopics.length > 0) {
        for (const topic of missingTopics) {
          const entry = touch(topic);
          if (!entry) continue;
          entry.missedCount += 1;
          if (overallScore !== null) entry.scores.push(overallScore);
          if (isLowScore) entry.lowScoreCount += 1;
        }
      } else if (isLowScore) {
        // Low scoring question with no recorded missing topics — still a
        // weak signal, just scoped to the interview's overall topic.
        const entry = touch(interview.topic);
        if (entry) {
          entry.lowScoreCount += 1;
          if (overallScore !== null) entry.scores.push(overallScore);
        }
      }
    }

    const items: Omit<WeakTopicItem, "priority">[] = Array.from(byTopic.entries()).map(([topic, agg]) => ({
      topic,
      missedCount: agg.missedCount,
      lowScoreCount: agg.lowScoreCount,
      averageScore: agg.scores.length > 0 ? Math.round((agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length) * 10) / 10 : null,
    }));

    // Rank: more misses + more low scores + lower average score = higher priority.
    items.sort((a, b) => {
      const weightA = a.missedCount * 2 + a.lowScoreCount * 1.5 - (a.averageScore ?? 10);
      const weightB = b.missedCount * 2 + b.lowScoreCount * 1.5 - (b.averageScore ?? 10);
      return weightB - weightA;
    });

    const prioritized: WeakTopicItem[] = items
      .slice(0, env.REVISION_MAX_WEAK_TOPICS)
      .map((item, index) => ({ ...item, priority: index + 1 }));

    logger.info("Weak areas analyzed", {
      interviewId: interview.id,
      weakTopicCount: prioritized.length,
    });

    return prioritized;
  }
}

export const weakAreaAnalysisService = new WeakAreaAnalysisService();
