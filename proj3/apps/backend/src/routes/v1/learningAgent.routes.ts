import { Router } from "express";
import { runLearningAgent } from "../../controllers/learningAgent.controller";
import { validate } from "../../middlewares/validate.middleware";
import { learningAgentRequestSchema } from "../../validators/learningAgent.validator";

const router = Router();

router.post("/", validate({ body: learningAgentRequestSchema }), runLearningAgent);

export default router;
