import { env } from "../config/env";
import { buildNoteContext } from "../utils/promptContext";

interface ContextChunk {
  knowledgeTitle: string;
  heading: string | null;
  section: string | null;
  content: string;
}

/**
 * Personal-knowledge answer prompt. Deliberately strict: the model must
 * refuse to go beyond the provided notes rather than blend in outside
 * knowledge, since a personal-knowledge answer is only trustworthy if it
 * really did come from the user's notes.
 */
export function buildPersonalKnowledgePrompt(
  question: string,
  chunks: ContextChunk[]
): { system: string; user: string } {
  const system = `You are chatting with a student in a live conversation, answering using ONLY their own notes below — not writing documentation.

Rules:
- Answer ONLY from the provided notes below. Do not invent information.
- Do not use any outside knowledge, even if you are confident about it.
- If the notes do not fully contain the answer, explicitly say so — do not fill gaps yourself.
- Preserve technical terminology exactly as written in the notes.
- Match your depth to the question. A broad "explain X" question deserves a real, thorough explanation using what's in the notes — don't shortchange it. A narrow, specific question gets a short, direct answer.
- Either way, write in natural flowing paragraphs like a knowledgeable friend explaining it out loud — not a "cheat sheet," full guide, or reference doc with forced sections unless they explicitly ask for one.
- Only use a table if comparing 2+ things is genuinely the clearest way to show it — not by default.
- Only include a code block if code is actually relevant to the question.
- If they want more detail on something specific, they'll ask a follow-up — don't front-load every possible sub-topic.`;

  const context = buildNoteContext(
    chunks,
    (c, n) => `### Note ${n} — ${[c.knowledgeTitle, c.heading, c.section].filter(Boolean).join(" > ")}\n${c.content}`,
    env.RAG_MAX_CONTEXT_CHARS
  );

  const user = `Notes:\n\n${context}\n\n---\n\nQuestion: ${question}`;

  return { system, user };
}

/**
 * External-AI fallback prompt, used when personal knowledge doesn't clear
 * the similarity threshold. General-purpose answer — explicitly NOT
 * constrained to the user's notes, and the caller is responsible for
 * labelling the response as External AI so the user is never misled about
 * its provenance.
 */
export function buildExternalFallbackPrompt(question: string): { system: string; user: string } {
  const system = `You are chatting with a student in a live conversation — not writing documentation.
Answer their question directly, like a knowledgeable friend would explain it out loud.

Rules:
- Match your depth to the question. A broad "explain X" question deserves a real, thorough explanation with examples — don't shortchange it. A narrow, specific question ("what does X mean", "how do I do Y") gets a short, direct answer.
- Either way, write in natural flowing paragraphs like you're actually talking — not a "cheat sheet," full guide, or reference doc with forced sections unless they explicitly ask for one.
- Only use a table if comparing 2+ things is genuinely the clearest way to show it — not by default.
- Only include a code block if code is actually relevant to the question.
- Skip headers/sections for a simple question — just answer it conversationally, even for a longer explanation.
- If they want more detail on something specific, they'll ask a follow-up — don't front-load every possible sub-topic.`;

  const user = question;

  return { system, user };
}

/**
 * Converts an External-AI answer into structured notes suitable for
 * storing back into the Knowledge Library, when the user chooses
 * "Save to Knowledge Base".
 */
export function buildSaveToKnowledgePrompt(
  question: string,
  answer: string
): { system: string; user: string } {
  const system = `You convert a chat question/answer pair into a structured study note.

You must respond with ONLY valid JSON (no markdown fences, no commentary)
matching exactly this shape:
{
  "title": string,       // short descriptive title for this topic
  "markdown": string      // the full note in markdown, using "#" for the title
                           // and "##" headings such as Overview, Key Points,
                           // Examples where content supports them
}

Rules:
- Base the note only on the provided question and answer — do not add new facts.
- Preserve technical terminology and any code blocks exactly.
- Keep it concise but complete enough to be useful on its own later.`;

  const user = `Question: ${question}\n\nAnswer:\n${answer}`;

  return { system, user };
}