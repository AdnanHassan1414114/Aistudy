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
    if (seen.has(c.content)) continue;
    seen.add(c.content);
    noteNumber += 1;

    const block = formatBlock(c, noteNumber);

    if (context.length + block.length > maxChars) break;
    context += (context ? "\n\n---\n\n" : "") + block;
  }

  return context;
}