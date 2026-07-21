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
