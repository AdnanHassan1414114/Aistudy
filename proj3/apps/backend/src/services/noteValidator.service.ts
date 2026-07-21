import { GeneratedNotesPayload } from "../types";

const REQUIRED_HEADINGS = ["Overview", "Core Concepts"];
const MIN_MARKDOWN_LENGTH = 200;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates generated notes before they're stored. Deliberately simple:
 * title exists, markdown is non-empty and well-formed, no duplicated
 * sections, no empty sections, no placeholder text. Returns a plain
 * pass/fail with the list of problems — no scoring system.
 */
export class NoteValidatorService {
  validate(notes: GeneratedNotesPayload): ValidationResult {
    const errors: string[] = [];

    if (!notes.title?.trim()) {
      errors.push("Title is missing.");
    }

    if (!notes.markdown || notes.markdown.trim().length < MIN_MARKDOWN_LENGTH) {
      errors.push("Generated markdown is empty or too short to be meaningful notes.");
    }

    const headings = (notes.sections ?? []).map((s) => s.heading.trim());
    for (const required of REQUIRED_HEADINGS) {
      if (!headings.some((h) => h.toLowerCase().includes(required.toLowerCase()))) {
        errors.push(`Required section "${required}" is missing.`);
      }
    }

    const duplicateHeadings = headings.filter((h, i) => headings.indexOf(h) !== i);
    if (duplicateHeadings.length > 0) {
      errors.push(`Duplicate sections detected: ${[...new Set(duplicateHeadings)].join(", ")}`);
    }

    const emptySections = (notes.sections ?? []).filter((s) => !s.content?.trim());
    if (emptySections.length > 0) {
      errors.push(`Empty section content: ${emptySections.map((s) => s.heading).join(", ")}`);
    }

    if (/\{\{.*\}\}|\[PLACEHOLDER\]|TODO:|lorem ipsum/i.test(notes.markdown ?? "")) {
      errors.push("Markdown contains placeholder text.");
    }

    const fenceCount = (notes.markdown?.match(/```/g) ?? []).length;
    if (fenceCount % 2 !== 0) {
      errors.push("Markdown has an unmatched code block (```).");
    }

    return { valid: errors.length === 0, errors };
  }
}

export const noteValidatorService = new NoteValidatorService();
