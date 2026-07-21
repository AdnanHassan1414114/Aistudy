import { InterviewStatus } from "@prisma/client";
import { interviewRepository, interviewQuestionRepository, revisionPlanRepository, toRevisionPlanResult } from "../repositories";
import { runRevisionPlanWorkflow } from "../workflows/revisionPlan.workflow";
import { RevisionPlanResult, WeakAreasResult } from "../types";
import { weakAreaAnalysisService } from "./weakAreaAnalysis.service";
import { AppError } from "../utils/appError";
import { logger } from "../utils/logger";

const log = logger.child({ scope: "revisionService" });

/**
 * Orchestrates the Milestone 5 flow: run the LangGraph revision workflow,
 * read back what it saved, and expose it to the controller layer. Contains
 * no business logic of its own — that all lives in the workflow's nodes
 * and the services/repositories they call.
 */
export class RevisionService {
  /** Runs the full LangGraph workflow and returns the freshly saved plan.
   *  Used both for the automatic post-interview trigger and for the
   *  explicit "Regenerate Revision Plan" API — they are the same
   *  operation (the SAVE node upserts either way). */
  async generate(interviewId: string): Promise<RevisionPlanResult> {
    await this.assertCompleted(interviewId);
    await runRevisionPlanWorkflow(interviewId);
    return this.getOrThrow(interviewId);
  }

  /** GET /interviews/:id/revision-plan — reads the already-saved plan.
   *  Does not run the workflow; the caller uses `generate` for that. */
  async get(interviewId: string): Promise<RevisionPlanResult> {
    return this.getOrThrow(interviewId);
  }

  /** GET /interviews/:id/weak-areas — pure read of the analysis, computed
   *  fresh from stored evaluations (cheap, no LLM), independent of whether
   *  a revision plan has been generated yet. */
  async getWeakAreas(interviewId: string): Promise<WeakAreasResult> {
    const interview = await interviewRepository.findById(interviewId);
    if (!interview) throw AppError.notFound("Interview not found.");

    const questions = await interviewQuestionRepository.listForInterview(interviewId);
    const weakTopics = weakAreaAnalysisService.analyze(interview, questions);

    return { interviewId, weakTopics };
  }

  /** Fire-and-forget hook called by InterviewService right after an
   *  interview is marked COMPLETED. Never throws into the caller — a
   *  revision-plan failure must not break the interview-completion
   *  response the candidate is waiting on. */
  generateForCompletedInterview(interviewId: string): void {
    this.generate(interviewId).catch((err) => {
      log.error("Automatic revision plan generation failed", {
        interviewId,
        error: (err as Error).message,
      });
    });
  }

  private async assertCompleted(interviewId: string): Promise<void> {
    const interview = await interviewRepository.findById(interviewId);
    if (!interview) throw AppError.notFound("Interview not found.");
    if (interview.status !== InterviewStatus.COMPLETED) {
      throw AppError.badRequest("Revision plans can only be generated for completed interviews.");
    }
  }

  private async getOrThrow(interviewId: string): Promise<RevisionPlanResult> {
    const plan = await revisionPlanRepository.findByInterviewId(interviewId);
    if (!plan) throw AppError.notFound("No revision plan has been generated for this interview yet.");
    return toRevisionPlanResult(plan);
  }
}

export const revisionService = new RevisionService();
