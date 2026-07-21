-- ── Milestone 4 Part 1 — AI Answer Evaluation ───────────────────────────────
-- Extends interview_answers with the structured evaluation result generated
-- automatically right after an answer is submitted. Purely additive:
-- existing columns/rows are untouched.

ALTER TABLE "interview_answers"
  ADD COLUMN "overallScore"    INTEGER,
  ADD COLUMN "conceptAccuracy" INTEGER,
  ADD COLUMN "completeness"    INTEGER,
  ADD COLUMN "clarity"         INTEGER,
  ADD COLUMN "strengths"       JSONB,
  ADD COLUMN "missingTopics"   JSONB,
  ADD COLUMN "feedback"        TEXT,
  ADD COLUMN "evaluationRaw"   JSONB,
  ADD COLUMN "evaluatedAt"     TIMESTAMP(3);
