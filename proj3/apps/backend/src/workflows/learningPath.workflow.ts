import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { Interview } from "@prisma/client";
import { interviewRepository, learningPathRepository } from "../repositories";
import { revisionService } from "../services/revision.service";
import { learningPathBuilderService } from "../services/learningPathBuilder.service";
import { LearningPathStep, RevisionPlanResult } from "../types";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

const log = logger.child({ scope: "learningPathWorkflow" });

/**
 * Milestone 7 — LangGraph is used ONLY as the workflow orchestrator here,
 * exactly like Milestone 5's revisionPlan.workflow.ts. Every node below is
 * a thin wrapper that calls an existing service or repository; no business
 * logic is duplicated or reimplemented inside a node. This is a simple
 * linear StateGraph, not a multi-agent system — there is no planner, no
 * supervisor, no autonomous branching, and no LLM call anywhere in this
 * graph (path-building is deterministic priority ordering).
 *
 * Graph shape (per spec):
 *   START -> loadRevisionPlan -> buildLearningPath -> saveLearningPath -> END
 */
const LearningPathState = Annotation.Root({
  interviewId: Annotation<string>(),

  interview: Annotation<Interview | null>(),
  revisionPlan: Annotation<RevisionPlanResult | null>(),

  steps: Annotation<LearningPathStep[]>(),
});

type LearningPathStateType = typeof LearningPathState.State;

/** LOAD REVISION PLAN NODE — reads the Interview and its already-generated
 *  RevisionPlan (weak topics, priority list, related notes) via the
 *  existing repositories/services. If the plan hasn't been generated yet
 *  for some reason, reuses RevisionService.generate rather than
 *  duplicating any weak-area or retrieval logic here. Answers are never
 *  re-evaluated — everything is read from what Milestone 4/5 already
 *  computed and stored. */
async function loadRevisionPlanNode(state: LearningPathStateType): Promise<Partial<LearningPathStateType>> {
  const interview = await interviewRepository.findById(state.interviewId);
  if (!interview) {
    throw AppError.notFound("Interview not found.");
  }

  const revisionPlan = await revisionService.get(state.interviewId).catch(() => null);
  const resolvedPlan = revisionPlan ?? (await revisionService.generate(state.interviewId));

  log.info("Loaded revision plan for learning path", {
    interviewId: state.interviewId,
    weakTopicCount: resolvedPlan.weakTopics.length,
  });

  return { interview, revisionPlan: resolvedPlan };
}

/** BUILD LEARNING PATH NODE — reuses LearningPathBuilderService's
 *  deterministic, priority-based ordering. No new recommendation
 *  algorithm; no LLM call. */
async function buildLearningPathNode(state: LearningPathStateType): Promise<Partial<LearningPathStateType>> {
  if (!state.interview) throw AppError.internal("buildLearningPathNode ran without a loaded interview.");
  if (!state.revisionPlan) throw AppError.internal("buildLearningPathNode ran without a loaded revision plan.");

  const steps = learningPathBuilderService.build({
    interviewTopic: state.interview.topic,
    weakTopics: state.revisionPlan.weakTopics,
    priorityList: state.revisionPlan.priorityList,
    relatedNotes: state.revisionPlan.relatedNotes,
  });

  return { steps };
}

/** SAVE NODE — persists the path via LearningPathRepository. Reuses the
 *  existing RevisionPlan model's upsert convention (the LearningPath model
 *  added in this milestone is the minimum required schema addition). */
async function saveLearningPathNode(state: LearningPathStateType): Promise<Partial<LearningPathStateType>> {
  await learningPathRepository.upsert({
    interviewId: state.interviewId,
    steps: state.steps,
  });

  log.info("Learning path saved", { interviewId: state.interviewId, stepCount: state.steps.length });

  return {};
}

const graph = new StateGraph(LearningPathState)
  .addNode("loadRevisionPlan", loadRevisionPlanNode)
  .addNode("buildLearningPath", buildLearningPathNode)
  .addNode("saveLearningPath", saveLearningPathNode)
  .addEdge(START, "loadRevisionPlan")
  .addEdge("loadRevisionPlan", "buildLearningPath")
  .addEdge("buildLearningPath", "saveLearningPath")
  .addEdge("saveLearningPath", END);

export const learningPathWorkflow = graph.compile();

export async function runLearningPathWorkflow(interviewId: string): Promise<LearningPathStateType> {
  const result = await learningPathWorkflow.invoke({ interviewId });
  return result as LearningPathStateType;
}
