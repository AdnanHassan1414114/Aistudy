import { z } from "zod";

export const saveToKnowledgeSchema = z.object({
  title: z.string().min(1),
  markdown: z.string().min(20),
});
export type SaveToKnowledgePayload = z.infer<typeof saveToKnowledgeSchema>;

export interface KnowledgeReference {
  knowledgeId: string;
  title: string;
  heading: string | null;
  section: string | null;
  similarity: number;
}

/** Exact chunk content used to ground an answer, captured verbatim on
 *  Message.retrievedContext so "Continue" can reuse the identical source
 *  material instead of re-running retrieval (which could return different
 *  chunks the second time and make the continuation drift). */
export interface RetrievedContextChunk {
  knowledgeTitle: string;
  heading: string | null;
  section: string | null;
  content: string;
}