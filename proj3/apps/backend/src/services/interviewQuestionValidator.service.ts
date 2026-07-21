import { GeneratedQuestionPayload, PreviousQA } from "../types";

export interface InterviewQuestionValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_QUESTION_LENGTH = 8;

/**
 * Deliberately simple, mirrors NoteValidatorService: pass/fail plus a list
 * of problems, no scoring. The one interview-specific check is duplicate
 * detection against previously asked questions in the same session.
 */
export class InterviewQuestionValidatorService {
  validate(payload: GeneratedQuestionPayload, previousQA: PreviousQA[]): InterviewQuestionValidationResult {
    const errors: string[] = [];
    const question = payload.question?.trim() ?? "";

    if (question.length < MIN_QUESTION_LENGTH) {
      errors.push("Generated question is empty or too short to be meaningful.");
    }

    if (/\{\{.*\}\}|\[PLACEHOLDER\]|TODO:/i.test(question)) {
      errors.push("Question contains placeholder text.");
    }

    const normalized = this.normalize(question);
    const isDuplicate = previousQA.some((qa) => this.normalize(qa.question) === normalized);
    if (isDuplicate) {
      errors.push("Question duplicates a previously asked question in this interview.");
    }

    return { valid: errors.length === 0, errors };
  }

  private normalize(text: string): string {
    return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  }
}

export const interviewQuestionValidatorService = new InterviewQuestionValidatorService();
