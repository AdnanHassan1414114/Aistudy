import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInterviewResults, getRevisionPlan, regenerateRevisionPlan, ApiError } from "../lib/api";
import type { InterviewResultSummary } from "../types/interview";
import type { RevisionPlanResult } from "../types/revision";
import { InterviewSummaryHeader } from "../components/InterviewSummaryHeader";
import { RevisionPriorityCard } from "../components/RevisionPriorityCard";
import { Markdown } from "../components/Markdown";

export function RevisionDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [summary, setSummary] = useState<InterviewResultSummary | null>(null);
  const [plan, setPlan] = useState<RevisionPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async (interviewId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [results, revisionPlan] = await Promise.all([
        getInterviewResults(interviewId),
        getRevisionPlan(interviewId),
      ]);
      setSummary(results.summary);
      setPlan(revisionPlan);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the revision plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) void load(id);
  }, [id, load]);

  async function handleRegenerate() {
    if (!id) return;
    setRegenerating(true);
    setError(null);
    try {
      const revisionPlan = await regenerateRevisionPlan(id);
      setPlan(revisionPlan);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate the revision plan.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={id ? `/interviews/${id}/results` : "/interviews/history"}
          className="inline-flex items-center gap-1.5 font-body text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M12.5 5L7.5 10L12.5 15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Interview results
        </Link>

        {plan && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1.5 font-body text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate revision plan"}
          </button>
        )}
      </div>

      {loading && <SkeletonState />}

      {error && !loading && (
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      {summary && plan && !loading && (
        <div className="space-y-8">
          <InterviewSummaryHeader summary={summary} />

          <section>
            <h2 className="mb-3 font-display text-lg text-[var(--color-ink)]">Priority list</h2>
            {plan.priorityList.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--color-rule-strong)] px-5 py-8 text-center font-body text-sm text-[var(--color-ink-soft)]">
                No weak areas were detected for this interview. Nice work!
              </p>
            ) : (
              <div className="space-y-3">
                {plan.priorityList.map((p) => (
                  <RevisionPriorityCard
                    key={p.topic}
                    priority={p}
                    weakTopic={plan.weakTopics.find((w) => w.topic === p.topic)}
                    knowledge={plan.relatedNotes.find((n) => n.topic === p.topic)}
                  />
                ))}
              </div>
            )}
          </section>

          {plan.priorityList.length > 0 && (
            <section>
              <h2 className="mb-3 font-display text-lg text-[var(--color-ink)]">Revision plan</h2>
              <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-5 py-4">
                <Markdown>{plan.planMarkdown}</Markdown>
              </div>
            </section>
          )}

          <div className="flex justify-center gap-3">
            <Link
              to={`/interviews/${id}/learning-path`}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-body text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              What should I study next?
            </Link>
            <Link
              to="/interviews"
              className="rounded-md border border-[var(--color-rule-strong)] px-4 py-2 font-body text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Start another interview
            </Link>
          </div>
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
          <div key={i} className="h-20 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
        ))}
      </div>
    </div>
  );
}
