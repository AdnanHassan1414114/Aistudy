import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { revisionService } from "../services/revision.service";

/** GET /interviews/:id/revision-plan — the already-saved revision plan
 *  (generated automatically once the interview completed). */
export const getRevisionPlan = asyncHandler(async (req: Request, res: Response) => {
  const result = await revisionService.get(req.params.id);
  sendResponse({ res, message: "Revision plan retrieved.", data: result });
});

/** POST /interviews/:id/revision-plan/regenerate — reruns the LangGraph
 *  revision workflow end-to-end and returns the freshly saved plan. */
export const regenerateRevisionPlan = asyncHandler(async (req: Request, res: Response) => {
  const result = await revisionService.generate(req.params.id);
  sendResponse({ res, message: "Revision plan regenerated.", data: result });
});

/** GET /interviews/:id/weak-areas — the prioritized weak-topic list on its
 *  own, computed fresh from stored evaluations (no LLM call). */
export const getWeakAreas = asyncHandler(async (req: Request, res: Response) => {
  const result = await revisionService.getWeakAreas(req.params.id);
  sendResponse({ res, message: "Weak areas retrieved.", data: result });
});
