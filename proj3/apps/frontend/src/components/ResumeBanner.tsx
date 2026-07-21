import { Link } from "react-router-dom";
import type { Interview } from "../types/interview";

export function ResumeBanner({ interview }: { interview: Interview }) {
  return (
    <div className="card-reveal flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-6 py-4">
      <div className="min-w-0">
        <p className="font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          Interview in progress
        </p>
        <p className="mt-0.5 truncate font-display text-base text-[var(--color-ink)]">{interview.topic}</p>
        <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
          Question {interview.currentQuestionNumber} of {interview.totalQuestions}
        </p>
      </div>
      <Link
        to={`/interviews/${interview.id}/session`}
        className="shrink-0 rounded-lg bg-[var(--color-accent)] px-5 py-2 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90"
      >
        Resume
      </Link>
    </div>
  );
}
