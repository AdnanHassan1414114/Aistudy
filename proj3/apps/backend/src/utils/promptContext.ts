/**
 * Shared "retrieved notes -> bounded context string" builder. Every
 * grounded prompt (chat, interview questions, answer evaluation, revision
 * plans) needs the same three things: dedupe chunks by exact content,
 * format each into a labeled block, and stop once the accumulated text
 * would exceed a char budget. This used to be copy-pasted near-verbatim
 * into four separate prompts/*.ts files — one bug fix (e.g. the dedupe
 * key, or the budget check) had to be made in four places to actually
 * take effect everywhere. Centralized here instead.
 */
export function buildNoteContext<T extends { content: string }>(
  chunks: T[],
  formatBlock: (chunk: T, noteNumber: number) => string,
  maxChars: number
): string {
  const seen = new Set<string>();
  let context = "";
  let noteNumber = 0;

  for (const c of chunks) {
    // Normalized (whitespace-collapsed, lowercased) key rather than the
    // raw string — catches near-duplicate chunks (same underlying note
    // re-saved with trivial formatting differences, or the same source
    // appearing under two Knowledge rows) that an exact-match `seen` set
    // would let through as if they were independent corroborating
    // sources, inflating apparent confidence without adding information.
    const dedupeKey = c.content.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    noteNumber += 1;

    const block = formatBlock(c, noteNumber);

    if (context.length + block.length > maxChars) break;
    context += (context ? "\n\n---\n\n" : "") + block;
  }

  return context;
}