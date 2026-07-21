import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInterviewResults, ApiError } from "../lib/api";
import type { InterviewResults } from "../types/interview";
import { InterviewSummaryHeader } from "../components/InterviewSummaryHeader";
import { QuestionCard } from "../components/QuestionCard";

export function InterviewResultPage() {
  const { id } = useParams<{ id: string }>();
  const [results, setResults] = useState<InterviewResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getInterviewResults(id)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Could not load this interview.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <Link
        to="/interviews/history"
        className="mb-6 inline-flex items-center gap-1.5 font-body text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path d="M12.5 5L7.5 10L12.5 15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Interview history
      </Link>

      {loading && <SkeletonState />}

      {error && !loading && (
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      {results && !loading && (
        <div className="space-y-8">
          <InterviewSummaryHeader summary={results.summary} />

          {results.summary.status === "COMPLETED" && (
            <div className="flex justify-end">
              <Link
                to={`/interviews/${id}/revision`}
                className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-body text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                View revision plan
              </Link>
            </div>
          )}

          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-display text-lg text-[var(--color-ink)]">Question review</h2>
              <span className="font-mono text-xs text-[var(--color-ink-soft)]">
                {results.questions.length} question{results.questions.length === 1 ? "" : "s"}
              </span>
            </div>

            {results.questions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-rule-strong)] px-5 py-8 text-center font-body text-sm text-[var(--color-ink-soft)]">
                No questions were generated for this interview yet.
              </p>
            ) : (
              <div className="space-y-3">
                {results.questions.map((q) => (
                  <QuestionCard key={q.questionNumber} item={q} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function SkeletonState() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-40 rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
        ))}
      </div>
    </div>
  );
}
