import { Router } from "express";
import {
  createKnowledge,
  listKnowledge,
  getKnowledge,
  getKnowledgeLatestJob,
  getKnowledgeVersions,
  restoreKnowledgeVersion,
  updateKnowledgeNotes,
  softDeleteKnowledge,
  permanentDeleteKnowledge,
  downloadKnowledgePdf,
} from "../../controllers/knowledge.controller";
import { validate } from "../../middlewares/validate.middleware";
import { submissionRateLimiter } from "../../middlewares/rateLimiter.middleware";
import {
  createKnowledgeSchema,
  updateKnowledgeNotesSchema,
  idParamSchema,
  knowledgeListQuerySchema,
} from "../../validators/knowledge.validator";

const router = Router();

router.post("/", submissionRateLimiter, validate({ body: createKnowledgeSchema }), createKnowledge);
router.get("/", validate({ query: knowledgeListQuerySchema }), listKnowledge);
router.get("/:id", validate({ params: idParamSchema }), getKnowledge);
router.get("/:id/job", validate({ params: idParamSchema }), getKnowledgeLatestJob);
router.get("/:id/versions", validate({ params: idParamSchema }), getKnowledgeVersions);
router.post("/:id/versions/:version/restore", validate({ params: idParamSchema }), restoreKnowledgeVersion);
router.get("/:id/pdf", validate({ params: idParamSchema }), downloadKnowledgePdf);
router.patch(
  "/:id",
  validate({ params: idParamSchema, body: updateKnowledgeNotesSchema }),
  updateKnowledgeNotes
);
router.delete("/:id", validate({ params: idParamSchema }), softDeleteKnowledge);
router.delete("/:id/permanent", validate({ params: idParamSchema }), permanentDeleteKnowledge);

export default router;
