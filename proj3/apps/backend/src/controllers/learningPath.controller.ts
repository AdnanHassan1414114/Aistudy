import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { learningPathService } from "../services/learningPath.service";

/** GET /interviews/:id/learning-path — the already-saved learning path
 *  (built from the interview's revision plan; generated on first access
 *  if it doesn't exist yet). */
export const getLearningPath = asyncHandler(async (req: Request, res: Response) => {
  const result = await learningPathService.get(req.params.id);
  sendResponse({ res, message: "Learning path retrieved.", data: result });
});

/** POST /interviews/:id/learning-path/regenerate — reruns the LangGraph
 *  learning-path workflow end-to-end and returns the freshly saved path. */
export const regenerateLearningPath = asyncHandler(async (req: Request, res: Response) => {
  const result = await learningPathService.generate(req.params.id);
  sendResponse({ res, message: "Learning path regenerated.", data: result });
});
