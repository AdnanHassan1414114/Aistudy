import { LearningPathStep, RevisionPriorityItem, TopicKnowledge, WeakTopicItem } from "../types";
import { logger } from "../utils/logger";

/**
 * Milestone 7 — BuildLearningPathNode's business logic.
 *
 * Pure, deterministic ordering over an already-generated RevisionPlan
 * (weakTopics, priorityList, relatedNotes) — never calls the LLM. Mirrors
 * WeakAreaAnalysisService's "just arithmetic/ordering over stored data"
 * philosophy, applied to path-building instead of weak-topic detection.
 *
 * For each weak topic, in the RevisionPlan's existing priority order,
 * emits three steps (Review the topic -> Read related notes -> Ask Chat
 * questions), then closes with a single "Take another interview" step.
 * No scoring, no recommendation model — simple priority-based ordering,
 * exactly as specified.
 */
export class LearningPathBuilderService {
  build(params: {
    interviewTopic: string;
    weakTopics: WeakTopicItem[];
    priorityList: RevisionPriorityItem[];
    relatedNotes: TopicKnowledge[];
  }): LearningPathStep[] {
    const { interviewTopic, weakTopics, priorityList, relatedNotes } = params;

    const sortedWeakTopics = [...weakTopics].sort((a, b) => a.priority - b.priority);

    const steps: LearningPathStep[] = [];
    let stepNumber = 1;

    for (const weakTopic of sortedWeakTopics) {
      const priorityItem = priorityList.find((p) => p.topic === weakTopic.topic);
      const topicNotes = relatedNotes.find((n) => n.topic === weakTopic.topic)?.notes ?? [];

      steps.push({
        stepNumber: stepNumber++,
        type: "REVIEW_TOPIC",
        title: `Review ${weakTopic.topic}`,
        description:
          priorityItem?.reason ??
          `This topic was flagged as a weak area based on your interview performance.`,
        priority: weakTopic.priority,
        topic: weakTopic.topic,
        relatedNotes: topicNotes,
      });

      steps.push({
        stepNumber: stepNumber++,
        type: "READ_NOTES",
        title: `Read related notes on ${weakTopic.topic}`,
        description:
          priorityItem?.suggestedRevision ?? `Go through your saved notes covering ${weakTopic.topic}.`,
        priority: weakTopic.priority,
        topic: weakTopic.topic,
        relatedNotes: topicNotes,
      });

      steps.push({
        stepNumber: stepNumber++,
        type: "ASK_CHAT",
        title: `Ask Chat questions about ${weakTopic.topic}`,
        description: `Use the RAG Chat to ask follow-up questions and clear up anything still unclear about ${weakTopic.topic}.`,
        priority: weakTopic.priority,
        topic: weakTopic.topic,
        relatedNotes: [],
      });
    }

    const closingPriority = sortedWeakTopics.length > 0
      ? sortedWeakTopics[sortedWeakTopics.length - 1].priority + 1
      : 1;

    steps.push({
      stepNumber: stepNumber++,
      type: "RETAKE_INTERVIEW",
      title: `Take another interview on ${interviewTopic}`,
      description:
        sortedWeakTopics.length > 0
          ? `Once you've reviewed the topics above, take another interview on ${interviewTopic} to check your progress.`
          : `No weak areas were detected — take another interview on ${interviewTopic} whenever you're ready to keep sharpening your skills.`,
      priority: closingPriority,
      topic: null,
      relatedNotes: [],
    });

    logger.info("Learning path steps built", {
      interviewTopic,
      weakTopicCount: sortedWeakTopics.length,
      stepCount: steps.length,
    });

    return steps;
  }
}

export const learningPathBuilderService = new LearningPathBuilderService();
