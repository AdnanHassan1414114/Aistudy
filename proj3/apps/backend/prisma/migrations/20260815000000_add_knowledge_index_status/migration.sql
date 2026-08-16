-- ── Full-pipeline audit follow-up: observable RAG-indexing status ──────────
-- Purely additive: no existing column is altered or dropped.

-- knowledge.indexedAt / knowledge.indexingFailedAt — makes RAG-indexing
-- outcome queryable and displayable instead of only living in log lines.
-- This applies to BOTH origins: the Milestone-1 auto-index-on-completion
-- path (events/knowledgeIndexingListener.ts) had the exact same
-- "indexing failure swallowed, knowledge silently unsearchable" bug that
-- chat-save (BUG-24a) already had fixed for it — this closes it for the
-- lecture-processing path too.
ALTER TABLE "knowledge" ADD COLUMN "indexedAt" TIMESTAMP(3);
ALTER TABLE "knowledge" ADD COLUMN "indexingFailedAt" TIMESTAMP(3);