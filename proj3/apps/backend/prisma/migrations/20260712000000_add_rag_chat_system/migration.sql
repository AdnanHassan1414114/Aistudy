-- Milestone 2: RAG Chat System
-- Additive only. No existing table is dropped or has a column removed.

-- pgvector must be available in the Postgres image (see docker-compose.yml,
-- which now uses pgvector/pgvector:pg16 instead of postgres:16-alpine).
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Knowledge: new nullable/defaulted columns ──────────────────────────────
CREATE TYPE "KnowledgeOrigin" AS ENUM ('LECTURE', 'CHAT_SAVE');

ALTER TABLE "knowledge"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "origin" "KnowledgeOrigin" NOT NULL DEFAULT 'LECTURE';

-- ── Knowledge chunks (retrieval units + embeddings) ────────────────────────
CREATE TABLE "knowledge_chunks" (
  "id" TEXT NOT NULL,
  "knowledgeId" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "heading" TEXT,
  "section" TEXT,
  "content" TEXT NOT NULL,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "embedding" vector(1536),
  "embeddingModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "knowledge_chunks"
  ADD CONSTRAINT "knowledge_chunks_knowledgeId_fkey"
  FOREIGN KEY ("knowledgeId") REFERENCES "knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "knowledge_chunks_knowledgeId_idx" ON "knowledge_chunks"("knowledgeId");

-- Approximate nearest-neighbor index for cosine similarity search.
-- `lists` is a reasonable default for small/medium datasets; run
-- `ANALYZE knowledge_chunks;` after backfilling embeddings so the planner
-- picks it up, and re-tune `lists` (~ rows / 1000) as the table grows.
CREATE INDEX "knowledge_chunks_embedding_idx"
  ON "knowledge_chunks" USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);

-- ── Conversations ───────────────────────────────────────────────────────────
CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "title" TEXT NOT NULL DEFAULT 'New chat',
  "knowledgeScope" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");
CREATE INDEX "conversations_createdAt_idx" ON "conversations"("createdAt");

-- ── Messages ────────────────────────────────────────────────────────────────
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "SourceBadge" AS ENUM ('PERSONAL_KNOWLEDGE', 'EXTERNAL_AI');
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "sourceBadge" "SourceBadge",
  "confidence" "ConfidenceLevel",
  "topSimilarity" DOUBLE PRECISION,
  "knowledgeRefs" JSONB,
  "externalReason" TEXT,
  "savedToKnowledge" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");
