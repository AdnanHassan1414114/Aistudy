/**
 * Splits a block of prose text into segments that each stay within
 * `maxChars`, so no single downstream LLM call (cleaning, note
 * generation, ...) risks overflowing its input/output budget. Splits on
 * paragraph breaks first, falling back to sentence boundaries for a
 * single oversized paragraph — never mid-word, so technical terms,
 * commands, or URLs aren't sliced apart.
 *
 * Shared by transcriptCleaning.service.ts and noteGeneration.service.ts
 * so both stages of the pipeline apply identical, single-tested logic
 * instead of two subtly different copies drifting apart over time.
 */
export function splitTextByCharBudget(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const paragraphs = text.split(/\n{2,}/).flatMap((p) => splitOversizedParagraph(p, maxChars));

  const segments: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) {
      segments.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) {
    segments.push(current);
  }

  return segments.length > 0 ? segments : [text];
}

/** A block may have no paragraph breaks at all (e.g. one long run-on
 *  transcript from ASR) — fall back to splitting on sentence boundaries. */
function splitOversizedParagraph(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];

  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim().length > 0) parts.push(current);

  return parts.length > 0 ? parts : [paragraph];
}