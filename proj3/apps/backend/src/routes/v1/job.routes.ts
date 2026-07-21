import { Router } from "express";
import { getJob, listJobs, getJobLogs, getJobAiUsage } from "../../controllers/job.controller";
import { validate } from "../../middlewares/validate.middleware";
import { idParamSchema } from "../../validators/knowledge.validator";
import { jobListQuerySchema } from "../../validators/job.validator";

const router = Router();

router.get("/", validate({ query: jobListQuerySchema }), listJobs);
router.get("/:id", validate({ params: idParamSchema }), getJob);
router.get("/:id/logs", validate({ params: idParamSchema }), getJobLogs);
router.get("/:id/ai-usage", validate({ params: idParamSchema }), getJobAiUsage);

export default router;
