import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getInterviewResults, getLearningPath, regenerateLearningPath, ApiError } from "../lib/api";
import type { InterviewResultSummary } from "../types/interview";
import type { LearningPathResult } from "../types/learningPath";
import { InterviewSummaryHeader } from "../components/InterviewSummaryHeader";
import { LearningPathStepCard } from "../components/LearningPathStepCard";

export function LearningPathPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<InterviewResultSummary | null>(null);
  const [path, setPath] = useState<LearningPathResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async (interviewId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [results, learningPath] = await Promise.all([
        getInterviewResults(interviewId),
        getLearningPath(interviewId),
      ]);
      setSummary(results.summary);
      setPath(learningPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the learning path.");
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
      const learningPath = await regenerateLearningPath(id);
      setPath(learningPath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not regenerate the learning path.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to={id ? `/interviews/${id}/revision` : "/interviews/history"}
          className="inline-flex items-center gap-1.5 font-body text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor">
            <path d="M12.5 5L7.5 10L12.5 15" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Revision plan
        </Link>

        {path && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1.5 font-body text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
          >
            {regenerating ? "Regenerating…" : "Regenerate learning path"}
          </button>
        )}
      </div>

      {loading && <SkeletonState />}

      {error && !loading && (
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      {summary && path && !loading && (
        <div className="space-y-8">
          <InterviewSummaryHeader summary={summary} />

          <section>
            <h2 className="mb-1 font-display text-lg text-[var(--color-ink)]">What to study next</h2>
            <p className="mb-4 font-body text-sm text-[var(--color-ink-soft)]">
              A simple, priority-ordered path built from your weak topics and revision plan.
            </p>

            <div className="space-y-2">
              {path.steps.map((step, index) => (
                <div key={step.stepNumber}>
                  <LearningPathStepCard
                    step={step}
                    onOpenChat={() => navigate("/chat")}
                    onStartInterview={() => navigate("/interviews")}
                  />
                  {index < path.steps.length - 1 && (
                    <div className="flex justify-center py-1 font-mono text-sm text-[var(--color-ink-soft)]" aria-hidden>
                      ↓
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-center">
            <Link
              to={`/interviews/${id}/revision`}
              className="rounded-md border border-[var(--color-rule-strong)] px-4 py-2 font-body text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Back to revision plan
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
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
        ))}
      </div>
    </div>
  );
}
