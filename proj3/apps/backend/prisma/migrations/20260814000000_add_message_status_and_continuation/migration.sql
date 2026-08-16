-- ── Chat pipeline audit follow-up: explicit message lifecycle + Continue ───
-- Purely additive: no existing column is altered or dropped.

CREATE TYPE "MessageStatus" AS ENUM ('COMPLETE', 'TRUNCATED', 'STOPPED', 'INTERRUPTED', 'EMPTY');

-- messages.status — explicit lifecycle state for ASSISTANT messages,
-- replacing the previous isFallbackAnswer+externalReason-text inference.
-- Nullable because USER messages don't have a generation lifecycle.
ALTER TABLE "messages" ADD COLUMN "status" "MessageStatus";

-- messages.retrievedContext — the exact chunk content used to ground this
-- answer, captured verbatim so Continue can reuse the same source material
-- instead of re-running retrieval and risking drift.
ALTER TABLE "messages" ADD COLUMN "retrievedContext" JSONB;

-- messages.continuationDepth — how many times this message has already
-- been extended via Continue; bounds cost/abuse.
ALTER TABLE "messages" ADD COLUMN "continuationDepth" INTEGER NOT NULL DEFAULT 0;