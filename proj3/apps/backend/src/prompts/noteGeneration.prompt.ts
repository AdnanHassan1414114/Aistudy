export const NOTE_GENERATION_PROMPT_VERSION = "note-gen-v1";

const JSON_SCHEMA_DESCRIPTION = `{
  "title": string,
  "summary": string,               // 2-4 sentence overview
  "sections": [
    { "heading": string, "content": string }  // markdown content per section
  ],
  "interviewQuestions": string[],  // generated ONLY from transcript content
  "keyTakeaways": string[],
  "markdown": string               // the FULL assembled notes document
}`;

export function buildNoteGenerationPrompt(
  cleanTranscript: string,
  previousAttemptFeedback?: string[],
  /**
   * Set when the transcript was too long for one call and had to be
   * split (see noteGeneration.service.ts). Tells the model it's only
   * seeing one part of a longer lecture, so it doesn't need to worry
   * that content referenced earlier/later is missing from this excerpt.
   */
  partInfo?: { index: number; total: number }
): { system: string; user: string } {
  const system = `You are an expert technical educator converting a lecture transcript
into high-quality, structured revision notes.

The notes must be optimized for: revision, interview preparation,
long-term memory, and fast reading. They must NOT be a shortened
transcript — rewrite the content into structured educational material.

Required markdown structure (use these exact headings where content exists):
# Title
## Overview
## Core Concepts
## Detailed Explanation
## Important Definitions
## Important Commands
## APIs Used
## Examples
## Common Mistakes
## Best Practices
## Interview Questions
## Key Takeaways

Formatting rules:
- Use tables when comparison improves understanding.
- Use bullet points for readability.
- Use numbered lists for sequential processes.
- Use code blocks for commands, code, JSON, and configuration.
- No decorative text, no motivational language, no unnecessary intros.

Content rules:
- Generate notes ONLY from the transcript. Never use external knowledge.
- Never invent examples or facts not present in the lecture.
- No duplicated information, no repeated explanations, no hallucinated
  placeholder sections — omit a heading entirely if the transcript has
  no relevant content for it (except Title, Overview, Core Concepts,
  and Key Takeaways, which are always required).
- Interview questions must be derivable directly from transcript content.

You must respond with ONLY valid JSON matching this exact shape, and
nothing else (no markdown fences, no commentary):

${JSON_SCHEMA_DESCRIPTION}`;

  const feedbackBlock =
    previousAttemptFeedback && previousAttemptFeedback.length > 0
      ? `\n\nYour previous attempt failed validation for these reasons — fix them:\n${previousAttemptFeedback
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "";

  const partBlock =
    partInfo && partInfo.total > 1
      ? `\n\nNote: this is part ${partInfo.index + 1} of ${partInfo.total} of a single longer lecture transcript, split only because of length — it is not the whole lecture. Generate the same full JSON shape for just this excerpt; the parts will be merged afterward into one document, so don't reference "the rest of the lecture" or assume content outside this excerpt. Also, do NOT mention the part number anywhere in the output (not in the title, summary, headings, or content) — write it as if it were a standalone piece of a single seamless document, since the reader will only ever see the final merged version, never this part in isolation.`
      : "";

  const user = `Generate structured study notes from this cleaned transcript:\n\n${cleanTranscript}${partBlock}${feedbackBlock}`;

  return { system, user };
}