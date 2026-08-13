import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendResponse } from "../utils/apiResponse";
import { knowledgeService } from "../services/knowledge.service";
import { pdfService } from "../services/pdf.service";
import {
  CreateKnowledgeInput,
  KnowledgeListQuery,
  UpdateKnowledgeNotesInput,
} from "../validators/knowledge.validator";

export const createKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const { youtubeUrl, category } = req.body as CreateKnowledgeInput;
  const result = await knowledgeService.submitForProcessing(youtubeUrl, category ?? null);
  sendResponse({
    res,
    statusCode: 202,
    message: "Processing job created.",
    data: result,
  });
});

export const listKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as KnowledgeListQuery;
  const result = await knowledgeService.list(query);
  sendResponse({ res, message: "Knowledge list retrieved.", data: result });
});

export const getKnowledge = asyncHandler(async (req: Request, res: Response) => {
  const knowledge = await knowledgeService.getById(req.params.id);
  sendResponse({ res, message: "Knowledge retrieved.", data: knowledge });
});

export const getKnowledgeLatestJob = asyncHandler(async (req: Request, res: Response) => {
  const job = await knowledgeService.getLatestJob(req.params.id);
  sendResponse({ res, message: "Latest processing job retrieved.", data: job });
});

export const getKnowledgeVersions = asyncHandler(async (req: Request, res: Response) => {
  const versions = await knowledgeService.listVersions(req.params.id);
  sendResponse({ res, message: "Knowledge versions retrieved.", data: versions });
});

export const restoreKnowledgeVersion = asyncHandler(async (req: Request, res: Response) => {
  const version = Number(req.params.version);
  const updated = await knowledgeService.restoreVersion(req.params.id, version);
  sendResponse({ res, message: `Restored to version ${version}.`, data: updated });
});

export const updateKnowledgeNotes = asyncHandler(async (req: Request, res: Response) => {
  const { notes, editedBy } = req.body as UpdateKnowledgeNotesInput;
  const updated = await knowledgeService.updateNotes(req.params.id, notes, editedBy);
  sendResponse({ res, message: "Notes updated.", data: updated });
});

export const softDeleteKnowledge = asyncHandler(async (req: Request, res: Response) => {
  await knowledgeService.softDelete(req.params.id);
  sendResponse({ res, message: "Knowledge deleted." });
});

export const permanentDeleteKnowledge = asyncHandler(async (req: Request, res: Response) => {
  await knowledgeService.permanentDelete(req.params.id);
  sendResponse({ res, message: "Knowledge permanently deleted." });
});

export const downloadKnowledgePdf = asyncHandler(async (req: Request, res: Response) => {
  const knowledge = await knowledgeService.getById(req.params.id);
  const pdfStream = pdfService.generateNotesPdf(knowledge);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${knowledge.title.replace(/[^a-z0-9]/gi, "_")}.pdf"`);
  pdfStream.pipe(res);
});