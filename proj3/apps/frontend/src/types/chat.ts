// Mirrors apps/backend/src/types/chat.types.ts and the Conversation / Message
// Prisma models (see prisma/schema.prisma, "CONVERSATIONS + MESSAGES").
// Frontend-only presentation types -- no logic, just the response shape.

export type MessageRole = "USER" | "ASSISTANT";
export type SourceBadgeType = "PERSONAL_KNOWLEDGE" | "EXTERNAL_AI";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface KnowledgeReference {
  knowledgeId: string;
  title: string;
  heading: string | null;
  section: string | null;
  similarity: number;
}

export interface Conversation {
  id: string;
  userId: string | null;
  title: string;
  knowledgeScope: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  sourceBadge: SourceBadgeType | null;
  confidence: ConfidenceLevel | null;
  topSimilarity: number | null;
  knowledgeRefs: KnowledgeReference[] | null;
  externalReason: string | null;
  savedToKnowledge: boolean;
  createdAt: string;
}

/** Payload carried by the SSE "done" event (see ChatAnswerSummary on the backend). */
export interface ChatAnswerSummary {
  conversationId: string;
  messageId: string;
  sourceBadge: SourceBadgeType;
  confidence: ConfidenceLevel | null;
  topSimilarity: number;
  sourcesUsed: KnowledgeReference[];
  externalReason: string | null;
}

/** Knowledge scope options the composer offers -- matched against
 *  Knowledge.category server-side; "All Topics" sends no scope at all. */
export const KNOWLEDGE_SCOPES = ["All Topics", "Backend", "AI", "React", "System Design"] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPES)[number];
