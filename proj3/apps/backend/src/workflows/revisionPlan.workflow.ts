import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { Interview } from "@prisma/client";
import {
  interviewRepository,
  interviewQuestionRepository,
  revisionPlanRepository,
  InterviewQuestionWithAnswer,
  RetrievedChunk,
} from "../repositories";
import { retrievalService } from "../services/retrieval.service";
import { weakAreaAnalysisService } from "../services/weakAreaAnalysis.service";
import {
  revisionPlanGenerationService,
  RetrievedTopicChunks,
} from "../services/revisionPlanGeneration.service";
import { WeakTopicItem, RelatedKnowledgeItem, TopicKnowledge, RevisionPriorityItem } from "../types";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

const log = logger.child({ scope: "revisionPlanWorkflow" });

/**
 * Milestone 5 — LangGraph is used ONLY as the workflow orchestrator here.
 * Every node below is a thin wrapper that calls an existing service or
 * repository; no business logic is duplicated or reimplemented inside a
 * node. This is a simple linear StateGraph, not a multi-agent system —
 * there is no planning, no autonomous branching, and no LLM call outside
 * the single "Generate Revision Plan" node.
 *
 * Graph shape (per spec):
 *   START -> loadInterview -> analyzeWeakAreas -> retrieveKnowledge
 *         -> generateRevisionPlan -> saveRevisionPlan -> END
 */
const RevisionPlanState = Annotation.Root({
  interviewId: Annotation<string>(),

  interview: Annotation<Interview | null>(),
  questions: Annotation<InterviewQuestionWithAnswer[]>(),

  weakTopics: Annotation<WeakTopicItem[]>(),

  // Internal-only (never persisted): retrieved chunks still carrying
  // `content`, needed to ground the revision-plan LLM prompt.
  retrievedByTopic: Annotation<RetrievedTopicChunks[]>(),
  // Persisted/API shape: same retrieval, with `content` stripped out.
  relatedNotes: Annotation<TopicKnowledge[]>(),

  priorityList: Annotation<RevisionPriorityItem[]>(),
  planMarkdown: Annotation<string>(),
});

type RevisionPlanStateType = typeof RevisionPlanState.State;

/** LOAD INTERVIEW NODE — reads Interview, questions, answers, scores, and
 *  missing topics via the existing repositories. No new queries invented. */
async function loadInterviewNode(state: RevisionPlanStateType): Promise<Partial<RevisionPlanStateType>> {
  const interview = await interviewRepository.findById(state.interviewId);
  if (!interview) {
    throw AppError.notFound("Interview not found.");
  }

  const questions = await interviewQuestionRepository.listForInterview(state.interviewId);

  log.info("Loaded interview for revision planning", { interviewId: state.interviewId, questionCount: questions.length });

  return { interview, questions };
}

/** ANALYZE WEAK AREAS NODE — pure aggregation over stored evaluations via
 *  WeakAreaAnalysisService. Does not call the LLM. */
async function analyzeWeakAreasNode(state: RevisionPlanStateType): Promise<Partial<RevisionPlanStateType>> {
  if (!state.interview) throw AppError.internal("analyzeWeakAreasNode ran without a loaded interview.");

  const weakTopics = weakAreaAnalysisService.analyze(state.interview, state.questions);

  return { weakTopics };
}

/** RETRIEVE KNOWLEDGE NODE — reuses RetrievalService (the existing RAG
 *  retriever) once per weak topic. No new retrieval system is introduced. */
async function retrieveKnowledgeNode(state: RevisionPlanStateType): Promise<Partial<RevisionPlanStateType>> {
  if (!state.interview) throw AppError.internal("retrieveKnowledgeNode ran without a loaded interview.");

  const retrievedByTopic: RetrievedTopicChunks[] = [];
  const relatedNotes: TopicKnowledge[] = [];

  for (const weakTopic of state.weakTopics) {
    const retrieval = await retrievalService.retrieve(weakTopic.topic, { category: state.interview.category });

    retrievedByTopic.push({ topic: weakTopic.topic, chunks: retrieval.chunks });

    const notes: RelatedKnowledgeItem[] = retrieval.chunks.map((c: RetrievedChunk) => ({
      knowledgeId: c.knowledgeId,
      title: c.knowledgeTitle,
      heading: c.heading,
      section: c.section,
      similarity: c.similarity,
    }));
    relatedNotes.push({ topic: weakTopic.topic, notes });
  }

  log.info("Retrieved related knowledge for weak topics", {
    interviewId: state.interviewId,
    topics: state.weakTopics.length,
  });

  return { retrievedByTopic, relatedNotes };
}

/** REVISION PLAN NODE — uses the existing AIService (via
 *  RevisionPlanGenerationService) to produce a concise, structured
 *  revision plan, then deterministically renders it to markdown. */
async function generateRevisionPlanNode(state: RevisionPlanStateType): Promise<Partial<RevisionPlanStateType>> {
  if (!state.interview) throw AppError.internal("generateRevisionPlanNode ran without a loaded interview.");

  if (state.weakTopics.length === 0) {
    // Nothing weak to revise — still a valid, empty plan.
    return { priorityList: [], planMarkdown: "No weak areas were detected for this interview. Nice work!" };
  }

  const generated = await revisionPlanGenerationService.generate({
    interviewId: state.interviewId,
    topic: state.interview.topic,
    weakTopics: state.weakTopics,
    retrievedByTopic: state.retrievedByTopic,
  });

  const planMarkdown = revisionPlanGenerationService.renderMarkdown(generated.priorities);

  return { priorityList: generated.priorities, planMarkdown };
}

/** SAVE NODE — persists the plan via RevisionPlanRepository. Reuses the
 *  existing RevisionPlan model (added in this milestone as the minimum
 *  required schema addition). */
async function saveRevisionPlanNode(state: RevisionPlanStateType): Promise<Partial<RevisionPlanStateType>> {
  await revisionPlanRepository.upsert({
    interviewId: state.interviewId,
    weakTopics: state.weakTopics,
    priorityList: state.priorityList,
    planMarkdown: state.planMarkdown,
    relatedNotes: state.relatedNotes,
  });

  log.info("Revision plan saved", { interviewId: state.interviewId });

  return {};
}

const graph = new StateGraph(RevisionPlanState)
  .addNode("loadInterview", loadInterviewNode)
  .addNode("analyzeWeakAreas", analyzeWeakAreasNode)
  .addNode("retrieveKnowledge", retrieveKnowledgeNode)
  .addNode("generateRevisionPlan", generateRevisionPlanNode)
  .addNode("saveRevisionPlan", saveRevisionPlanNode)
  .addEdge(START, "loadInterview")
  .addEdge("loadInterview", "analyzeWeakAreas")
  .addEdge("analyzeWeakAreas", "retrieveKnowledge")
  .addEdge("retrieveKnowledge", "generateRevisionPlan")
  .addEdge("generateRevisionPlan", "saveRevisionPlan")
  .addEdge("saveRevisionPlan", END);

export const revisionPlanWorkflow = graph.compile();

export async function runRevisionPlanWorkflow(interviewId: string): Promise<RevisionPlanStateType> {
  const result = await revisionPlanWorkflow.invoke({ interviewId });
  return result as RevisionPlanStateType;
}
