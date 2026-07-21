import { Router } from "express";
import knowledgeRoutes from "./knowledge.routes";
import jobRoutes from "./job.routes";
import healthRoutes from "./health.routes";
import chatRoutes from "./chat.routes";
import interviewRoutes from "./interview.routes";
import learningAgentRoutes from "./learningAgent.routes";

const router = Router();

router.use("/knowledge", knowledgeRoutes);
router.use("/jobs", jobRoutes);
router.use("/health", healthRoutes);
router.use("/chat", chatRoutes);
router.use("/interviews", interviewRoutes);
router.use("/learning-agent", learningAgentRoutes);

export default router;
