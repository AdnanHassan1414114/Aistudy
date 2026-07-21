import { runLearningAgentWorkflow } from "../workflows/learningAgent.workflow";
import { LearningAgentRequestInput, LearningAgentResult } from "../types";
import { logger } from "../utils/logger";

const log = logger.child({ scope: "learningAgentService" });

/**
 * Orchestrates the Milestone 6 flow: run the LangGraph Learning Agent
 * workflow, then reshape its final state into the API response contract.
 * Contains no business logic of its own — that all lives in the
 * workflow's nodes and the Chat/Interview/Revision services they call.
 */
export class LearningAgentService {
  async run(input: LearningAgentRequestInput): Promise<LearningAgentResult> {
    const result = await runLearningAgentWorkflow({
      message: input.message,
      conversationId: input.conversationId,
      interviewId: input.interviewId,
    });

    log.info("Learning agent request handled", {
      intent: result.intent,
      conversationId: result.resultConversationId ?? null,
      interviewId: result.resultInterviewId ?? null,
    });

    return {
      workflowSelected: result.intent,
      response: result.response,
      references: result.references ?? [],
      conversationId: result.resultConversationId ?? null,
      interviewId: result.resultInterviewId ?? null,
    };
  }
}

export const learningAgentService = new LearningAgentService();
