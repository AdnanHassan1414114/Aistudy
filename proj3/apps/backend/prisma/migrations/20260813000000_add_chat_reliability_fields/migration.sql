-- ── Chat pipeline reliability fixes (Step 22-24 audit) ──────────────────────
-- Purely additive: no existing column is altered or dropped.

-- messages.savedKnowledgeId — points at the Knowledge row this message was
-- converted into, so a repeat "Save to Knowledge Base" request can return
-- the existing record instead of creating a duplicate.
ALTER TABLE "messages" ADD COLUMN "savedKnowledgeId" TEXT;

-- messages.isFallbackAnswer — marks a message whose content is the generic
-- "I wasn't able to generate an answer..." placeholder rather than a real
-- model response, so it can be excluded from Save-to-Knowledge and from
-- confidence/source badge rendering.
ALTER TABLE "messages" ADD COLUMN "isFallbackAnswer" BOOLEAN NOT NULL DEFAULT false;

-- messages.clientRequestId — optional client-generated idempotency key for
-- POST /chat. A retried request with the same key is rejected rather than
-- creating a duplicate user/assistant message pair.
ALTER TABLE "messages" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "messages_clientRequestId_key" ON "messages"("clientRequestId");

-- knowledge.sourceMessageId — the Message a CHAT_SAVE Knowledge row was
-- created from. The unique index is what actually makes concurrent
-- double-clicks on "Save to Knowledge Base" safe (Message.savedKnowledgeId
-- alone is a fast-path check, not a guarantee under a race).
ALTER TABLE "knowledge" ADD COLUMN "sourceMessageId" TEXT;
CREATE UNIQUE INDEX "knowledge_sourceMessageId_key" ON "knowledge"("sourceMessageId");