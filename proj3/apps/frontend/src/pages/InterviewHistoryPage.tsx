import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listInterviews, ApiError } from "../lib/api";
import type { Interview } from "../types/interview";
import { InterviewStatusBadge } from "../components/InterviewStatusBadge";

export function InterviewHistoryPage() {
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInterviews({ pageSize: 50 })
      .then((res) => setInterviews(res.items))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load interviews."));
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Interview record
          </p>
          <h1 className="font-display text-3xl text-[var(--color-ink)]">Your interview history</h1>
          <p className="mt-2 max-w-lg font-body text-sm text-[var(--color-ink-soft)]">
            Every interview you have taken, graded and filed. Open one to review the full transcript, question by
            question.
          </p>
        </div>
        <Link
          to="/interviews"
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90"
        >
          New interview
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      {!interviews && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]"
            />
          ))}
        </div>
      )}

      {interviews && interviews.length === 0 && (
        <p className="rounded-lg border border-dashed border-[var(--color-rule-strong)] px-5 py-10 text-center font-body text-sm text-[var(--color-ink-soft)]">
          No interviews yet. Once you complete one, it will show up here.
        </p>
      )}

      {interviews && interviews.length > 0 && (
        <ul className="divide-y divide-[var(--color-rule)] overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]">
          {interviews.map((interview) => {
            const row = (
              <div className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--color-accent-soft)]/30">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base text-[var(--color-ink)]">{interview.topic}</p>
                  <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
                    {new Date(interview.startedAt).toLocaleDateString(undefined, {
                      dateStyle: "medium",
                    })}{" "}
                    · {interview.totalQuestions} question{interview.totalQuestions === 1 ? "" : "s"} ·{" "}
                    {interview.difficulty.toLowerCase()}
                  </p>
                </div>
                <InterviewStatusBadge status={interview.status} />
              </div>
            );

            const linkTo =
              interview.status === "COMPLETED"
                ? `/interviews/${interview.id}/results`
                : interview.status === "IN_PROGRESS"
                  ? `/interviews/${interview.id}/session`
                  : null;

            return (
              <li key={interview.id}>
                {linkTo ? <Link to={linkTo}>{row}</Link> : <div className="opacity-60">{row}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
