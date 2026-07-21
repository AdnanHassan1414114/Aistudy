-- ── Milestone 7 — Personalized Learning Path ────────────────────────────────
-- Adds the LearningPath table: one row per Interview, produced by the
-- LangGraph learning-path workflow from the existing RevisionPlan. Purely
-- additive: no existing table is touched or altered.

CREATE TABLE "learning_paths" (
  "id"          TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "steps"       JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_paths_interviewId_key" ON "learning_paths"("interviewId");

CREATE INDEX "learning_paths_interviewId_idx" ON "learning_paths"("interviewId");

ALTER TABLE "learning_paths"
  ADD CONSTRAINT "learning_paths_interviewId_fkey"
  FOREIGN KEY ("interviewId") REFERENCES "interviews"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
