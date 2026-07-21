import { learningPathRepository, toLearningPathResult } from "../repositories";
import { runLearningPathWorkflow } from "../workflows/learningPath.workflow";
import { LearningPathResult } from "../types";
import { AppError } from "../utils/appError";

/**
 * Orchestrates the Milestone 7 flow: run the LangGraph Learning Path
 * workflow, then read back what it saved. Contains no business logic of
 * its own — that all lives in the workflow's nodes and the
 * RevisionService/LearningPathBuilderService they call. Mirrors
 * RevisionService's get/generate convention exactly.
 */
export class LearningPathService {
  /** Runs the full LangGraph workflow and returns the freshly saved path.
   *  Used both for the "Regenerate Learning Path" API and internally when
   *  no path exists yet for a `get` call. */
  async generate(interviewId: string): Promise<LearningPathResult> {
    await runLearningPathWorkflow(interviewId);
    return this.getOrThrow(interviewId);
  }

  /** GET /interviews/:id/learning-path — reads the already-saved path,
   *  generating it on first access if it doesn't exist yet. */
  async get(interviewId: string): Promise<LearningPathResult> {
    const existing = await learningPathRepository.findByInterviewId(interviewId);
    if (existing) return toLearningPathResult(existing);
    return this.generate(interviewId);
  }

  private async getOrThrow(interviewId: string): Promise<LearningPathResult> {
    const path = await learningPathRepository.findByInterviewId(interviewId);
    if (!path) throw AppError.notFound("No learning path has been generated for this interview yet.");
    return toLearningPathResult(path);
  }
}

export const learningPathService = new LearningPathService();
