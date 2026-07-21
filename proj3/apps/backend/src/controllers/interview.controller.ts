import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { interviewService } from "../services/interview.service";
import {
  InterviewListQuery,
  StartInterviewInput,
  SubmitAnswerInput,
} from "../validators/interview.validator";

/** POST /interviews/start — Quick ({ mode: "QUICK", message }) or Custom
 *  ({ mode: "CUSTOM", topic, difficulty, interviewType, numberOfQuestions }). */
export const startInterview = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as StartInterviewInput;
  const result = await interviewService.start(input);
  sendResponse({ res, statusCode: 201, message: "Interview started.", data: result });
});

/** POST /interviews/:id/answer — stores the answer to the current question
 *  and generates the next one, or completes the interview if that was the last. */
export const submitAnswer = asyncHandler(async (req: Request, res: Response) => {
  const { answer } = req.body as SubmitAnswerInput;
  const result = await interviewService.submitAnswer(req.params.id, answer);
  sendResponse({ res, message: "Answer submitted.", data: result });
});

/** GET /interviews/:id — full interview with all questions/answers so far. */
export const getInterview = asyncHandler(async (req: Request, res: Response) => {
  const result = await interviewService.getWithQuestions(req.params.id);
  sendResponse({ res, message: "Interview retrieved.", data: result });
});

/** GET /interviews — paginated list of the user's interviews. */
export const listInterviews = asyncHandler(async (req: Request, res: Response) => {
  const { page, pageSize, status } = req.query as unknown as InterviewListQuery;
  const result = await interviewService.list(page, pageSize, status);
  sendResponse({ res, message: "Interviews retrieved.", data: result });
});

/** POST /interviews/:id/resume — returns the current unanswered question. */
export const resumeInterview = asyncHandler(async (req: Request, res: Response) => {
  const question = await interviewService.resume(req.params.id);
  sendResponse({ res, message: "Interview resumed.", data: { question } });
});

/** POST /interviews/:id/end — ends an in-progress interview early (ABANDONED). */
export const endInterview = asyncHandler(async (req: Request, res: Response) => {
  const interview = await interviewService.end(req.params.id);
  sendResponse({ res, message: "Interview ended.", data: { interview } });
});

/** GET /interviews/:id/questions -- Milestone 4 Part 2. Chronological list of
 *  the interview questions, each with its stored answer/evaluation. */
export const getInterviewQuestions = asyncHandler(async (req: Request, res: Response) => {
  const questions = await interviewService.getQuestions(req.params.id);
  sendResponse({ res, message: "Interview questions retrieved.", data: { questions } });
});

/** GET /interviews/:id/results -- Milestone 4 Part 2. Interview Result
 *  Dashboard payload: summary stats + per-question review, built entirely
 *  from evaluation data already stored in Milestone 4 Part 1. No LLM calls. */
export const getInterviewResults = asyncHandler(async (req: Request, res: Response) => {
  const results = await interviewService.getResults(req.params.id);
  sendResponse({ res, message: "Interview results retrieved.", data: results });
});
