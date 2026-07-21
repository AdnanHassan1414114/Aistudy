import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { jobService } from "../services/job.service";
import { JobListQuery } from "../validators/job.validator";

export const getJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await jobService.getById(req.params.id);
  sendResponse({ res, message: "Job retrieved.", data: job });
});

export const listJobs = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as JobListQuery;
  const result = await jobService.list(query);
  sendResponse({ res, message: "Jobs retrieved.", data: result });
});

export const getJobLogs = asyncHandler(async (req: Request, res: Response) => {
  const logs = await jobService.getLogs(req.params.id);
  sendResponse({ res, message: "Job logs retrieved.", data: logs });
});

export const getJobAiUsage = asyncHandler(async (req: Request, res: Response) => {
  const usage = await jobService.getAiUsage(req.params.id);
  sendResponse({ res, message: "AI usage retrieved.", data: usage });
});

