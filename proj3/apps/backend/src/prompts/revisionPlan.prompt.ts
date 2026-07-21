import { env } from "../config/env";
import { WeakTopicItem } from "../types";

interface ContextChunk {
  topic: string;
  knowledgeTitle: string;
  heading: string | null;
  section: string | null;
  content: string;
}

/**
 * Builds the prompt for the Revision Plan node. Mirrors
 * buildAnswerEvaluationPrompt's strictness: the LLM only reasons over the
 * candidate's own weak topics and their own retrieved notes — never
 * outside/general knowledge, and never a long study guide.
 */
export function buildRevisionPlanPrompt(params: {
  topic: string;
  weakTopics: WeakTopicItem[];
  chunks: ContextChunk[];
}): { system: string; user: string } {
  const { topic, weakTopics, chunks } = params;

  const system = `You are a concise study coach building a short, prioritized revision plan for a candidate who just finished a technical interview on "${topic}".

Rules:
- Base every suggestion ONLY on the candidate's weak topics and the notes provided below. Do not introduce outside/general knowledge.
- Produce one entry per weak topic, ordered from most to least urgent (the order they're given in is already the priority order — keep it).
- reason: 1 sentence explaining why this topic needs revision, grounded in the candidate's performance.
- suggestedRevision: 1-2 sentences of concrete, actionable revision guidance drawn from the notes.
- Keep every field short. Do not generate long study guides.
- Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this shape:
{ "priorities": [ { "topic": string, "reason": string, "suggestedRevision": string } ] }`;

  const seen = new Set<string>();
  let context = "";

  for (const c of chunks) {
    if (seen.has(c.content)) continue;
    seen.add(c.content);

    const path = [c.knowledgeTitle, c.heading, c.section].filter(Boolean).join(" > ");
    const block = `### [${c.topic}] ${path}\n${c.content}`;

    if (context.length + block.length > env.RAG_MAX_CONTEXT_CHARS) break;
    context += (context ? "\n\n---\n\n" : "") + block;
  }

  if (!context) {
    context = "(no notes were retrieved for these weak topics)";
  }

  const weakTopicList = weakTopics
    .map((w) => `${w.priority}. ${w.topic} (missed ${w.missedCount}x, low-scored ${w.lowScoreCount}x, avg score ${w.averageScore ?? "n/a"})`)
    .join("\n");

  const user = `Weak topics, in priority order:\n${weakTopicList}\n\n---\n\nRelated notes:\n\n${context}\n\n---\n\nGenerate the prioritized revision plan now.`;

  return { system, user };
}
