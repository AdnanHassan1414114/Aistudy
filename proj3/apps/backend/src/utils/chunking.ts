import { env } from "../config/env";

export interface NoteChunk {
  chunkIndex: number;
  heading: string | null;
  section: string | null;
  content: string;
  tokenCount: number;
}

/**
 * Cheap token estimate (~4 chars/token for English technical prose). Good
 * enough for chunk sizing — we don't need exact counts, just a consistent
 * budget so chunks stay well inside embedding/LLM context limits without
 * pulling in a tokenizer dependency.
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

interface RawSection {
  heading: string | null;
  section: string | null;
  content: string;
}

/**
 * Splits markdown notes into sections by heading (# / ##), tracking the
 * nearest H1 as `heading` and nearest H2+ as `section` so each chunk keeps
 * its place in the document ("Redis Complete Tutorial > Persistence >
 * Advantages of AOF").
 */
function splitByHeadings(markdown: string): RawSection[] {
  const lines = markdown.split("\n");
  const sections: RawSection[] = [];

  let currentH1: string | null = null;
  let currentH2: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join("\n").trim();
    if (content.length > 0) {
      sections.push({ heading: currentH1, section: currentH2, content });
    }
    buffer = [];
  };

  for (const line of lines) {
    const h1Match = /^#\s+(.*)/.exec(line);
    const h2PlusMatch = /^#{2,6}\s+(.*)/.exec(line);

    if (h1Match) {
      flush();
      currentH1 = h1Match[1].trim();
      currentH2 = null;
      continue;
    }

    if (h2PlusMatch) {
      flush();
      currentH2 = h2PlusMatch[1].trim();
      continue;
    }

    buffer.push(line);
  }
  flush();

  return sections;
}

/**
 * Splits a single oversized paragraph further: first on sentence
 * boundaries, and if a single "sentence" is still too big (a huge
 * unbroken blob of text, a large code block, a wall of auto-generated
 * transcript text with no punctuation breaks), a hard character-count
 * cut as an absolute last resort.
 *
 * Without this, a paragraph with no blank lines inside it had no
 * fallback at all in `splitLargeSection` below — it was kept as a
 * single chunk with no upper bound. At query time that oversized chunk
 * could exceed the chat context budget (RAG_MAX_CONTEXT_CHARS) on its
 * own, get skipped entirely, and silently send the AI an empty
 * "Notes:" section for a question its retrieval had genuinely found a
 * strong match for — producing a confident "this isn't in your notes"
 * answer for a note that actually covers it.
 */
function splitOversizedParagraph(text: string, targetChars: number): string[] {
  if (text.length <= targetChars) return [text];

  const sentences = text.split(/(?<=[.!?])\s+/);
  const parts: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > targetChars && current) {
      parts.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);

  // Even a single "sentence" (or the whole text, if there was no
  // punctuation to split on at all) can still exceed the target —
  // hard-cut by character count so nothing is ever left unbounded.
  return parts.flatMap((part) => {
    if (part.length <= targetChars) return [part];
    const pieceCount = Math.ceil(part.length / targetChars);
    return Array.from({ length: pieceCount }, (_, i) => part.slice(i * targetChars, (i + 1) * targetChars));
  });
}

/** Further splits an oversized section into token-bounded chunks with overlap. */
function splitLargeSection(
  section: RawSection,
  targetTokens: number,
  overlapTokens: number
): RawSection[] {
  const tokenCount = estimateTokens(section.content);
  if (tokenCount <= targetTokens) return [section];

  const targetChars = targetTokens * 4;
  const overlapChars = overlapTokens * 4;

  // Prefer splitting on paragraph boundaries so we don't cut mid-sentence —
  // but first guarantee every paragraph is itself within budget, so the
  // accumulation loop below can never end up holding a single oversized
  // paragraph with nowhere further to split it.
  const paragraphs = section.content.split(/\n{2,}/).flatMap((p) => splitOversizedParagraph(p, targetChars));
  const parts: RawSection[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > targetChars && current) {
      parts.push({ heading: section.heading, section: section.section, content: current });
      // Carry the tail of the previous part forward for continuity.
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = `${tail}\n\n${paragraph}`;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) {
    parts.push({ heading: section.heading, section: section.section, content: current.trim() });
  }

  return parts.length > 0 ? parts : [section];
}

/**
 * Converts a Knowledge's markdown notes into retrievable chunks. Used by
 * the indexing pipeline before embedding — never chunk and embed in the
 * same pass without going through this function, so retrieval metadata
 * (heading/section) stays consistent.
 */
export function chunkMarkdownNotes(
  markdown: string,
  options: { targetTokens?: number; overlapTokens?: number } = {}
): NoteChunk[] {
  const targetTokens = options.targetTokens ?? env.CHUNK_TARGET_TOKENS;
  const overlapTokens = options.overlapTokens ?? env.CHUNK_OVERLAP_TOKENS;

  const sections = splitByHeadings(markdown);
  const expanded = sections.flatMap((s) => splitLargeSection(s, targetTokens, overlapTokens));

  return expanded
    .filter((s) => s.content.trim().length > 0)
    .map((s, idx) => ({
      chunkIndex: idx,
      heading: s.heading,
      section: s.section,
      content: s.content.trim(),
      tokenCount: estimateTokens(s.content),
    }));
}