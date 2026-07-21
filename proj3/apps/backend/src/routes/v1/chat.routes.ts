import { Router } from "express";
import {
  streamChat,
  listConversations,
  getConversation,
  saveAnswerToKnowledge,
  reindexKnowledge,
} from "../../controllers/chat.controller";
import { validate } from "../../middlewares/validate.middleware";
import {
  chatRequestSchema,
  conversationIdParamSchema,
  conversationListQuerySchema,
  knowledgeIdParamSchema,
  saveAnswerSchema,
} from "../../validators/chat.validator";

const router = Router();

router.post("/", validate({ body: chatRequestSchema }), streamChat);
router.post("/save", validate({ body: saveAnswerSchema }), saveAnswerToKnowledge);
router.post("/index/:knowledgeId", validate({ params: knowledgeIdParamSchema }), reindexKnowledge);
router.get("/conversations", validate({ query: conversationListQuerySchema }), listConversations);
router.get("/conversations/:id", validate({ params: conversationIdParamSchema }), getConversation);

export default router;
