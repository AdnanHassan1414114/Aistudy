import { Router } from "express";
import {
  startInterview,
  submitAnswer,
  getInterview,
  listInterviews,
  resumeInterview,
  endInterview,
  getInterviewQuestions,
  getInterviewResults,
} from "../../controllers/interview.controller";
import {
  getRevisionPlan,
  regenerateRevisionPlan,
  getWeakAreas,
} from "../../controllers/revision.controller";
import { getLearningPath, regenerateLearningPath } from "../../controllers/learningPath.controller";
import { validate } from "../../middlewares/validate.middleware";
import {
  interviewIdParamSchema,
  interviewListQuerySchema,
  startInterviewSchema,
  submitAnswerSchema,
} from "../../validators/interview.validator";

const router = Router();

router.post("/start", validate({ body: startInterviewSchema }), startInterview);
router.post("/:id/answer", validate({ params: interviewIdParamSchema, body: submitAnswerSchema }), submitAnswer);
router.get("/:id", validate({ params: interviewIdParamSchema }), getInterview);
router.get("/", validate({ query: interviewListQuerySchema }), listInterviews);
router.post("/:id/resume", validate({ params: interviewIdParamSchema }), resumeInterview);
router.post("/:id/end", validate({ params: interviewIdParamSchema }), endInterview);
router.get("/:id/questions", validate({ params: interviewIdParamSchema }), getInterviewQuestions);
router.get("/:id/results", validate({ params: interviewIdParamSchema }), getInterviewResults);

// ── Milestone 5: Weak Area Detection & Revision Planner ──────────────────
router.get("/:id/weak-areas", validate({ params: interviewIdParamSchema }), getWeakAreas);
router.get("/:id/revision-plan", validate({ params: interviewIdParamSchema }), getRevisionPlan);
router.post(
  "/:id/revision-plan/regenerate",
  validate({ params: interviewIdParamSchema }),
  regenerateRevisionPlan
);

// ── Milestone 7: Personalized Learning Path ───────────────────────────────
router.get("/:id/learning-path", validate({ params: interviewIdParamSchema }), getLearningPath);
router.post(
  "/:id/learning-path/regenerate",
  validate({ params: interviewIdParamSchema }),
  regenerateLearningPath
);

export default router;
