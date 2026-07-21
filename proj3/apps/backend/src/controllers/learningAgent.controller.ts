import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { learningAgentService } from "../services/learningAgent.service";
import { LearningAgentRequestInput } from "../validators/learningAgent.validator";

/**
 * POST /learning-agent — the single entry point for the Milestone 6
 * Learning Agent. Runs the LangGraph workflow (Detect Intent -> Chat |
 * Interview | Revision) and returns which workflow was selected alongside
 * its response, so the user never has to pick a mode themselves.
 */
export const runLearningAgent = asyncHandler(async (req: Request, res: Response) => {
  const { message, conversationId, interviewId } = req.body as LearningAgentRequestInput;

  const result = await learningAgentService.run({ message, conversationId, interviewId });

  sendResponse({ res, message: "Learning agent request handled.", data: result });
});
