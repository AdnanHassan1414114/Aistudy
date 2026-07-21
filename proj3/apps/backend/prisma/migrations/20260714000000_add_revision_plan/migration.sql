-- ── Milestone 5 — Weak Area Detection & Revision Planner ────────────────────
-- Adds the RevisionPlan table: one row per Interview, produced by the
-- LangGraph revision workflow. Purely additive: no existing table is
-- touched or altered.

CREATE TABLE "revision_plans" (
  "id"           TEXT NOT NULL,
  "interviewId"  TEXT NOT NULL,
  "weakTopics"   JSONB NOT NULL,
  "priorityList" JSONB NOT NULL,
  "planMarkdown" TEXT NOT NULL,
  "relatedNotes" JSONB NOT NULL,
  "generatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "revision_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revision_plans_interviewId_key" ON "revision_plans"("interviewId");

CREATE INDEX "revision_plans_interviewId_idx" ON "revision_plans"("interviewId");

ALTER TABLE "revision_plans"
  ADD CONSTRAINT "revision_plans_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interviews"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
