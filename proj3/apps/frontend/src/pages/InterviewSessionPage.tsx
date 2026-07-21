import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  endInterview,
  getInterview,
  resumeInterview,
  submitInterviewAnswer,
} from "../lib/api";
import type { Interview, InterviewQuestionWithAnswer, StartInterviewResult } from "../types/interview";
import { hasNextQuestion } from "../types/interview";
import { QuestionProgress } from "../components/QuestionProgress";
import { AnswerComposer } from "../components/AnswerComposer";
import { GradeStamp } from "../components/GradeStamp";
import { InterviewStatusBadge } from "../components/InterviewStatusBadge";

const COMPLETION_REDIRECT_DELAY_MS = 1500;

export function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [interview, setInterview] = useState<Interview | null>(null);
  const [question, setQuestion] = useState<InterviewQuestionWithAnswer | null>(null);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [completed, setCompleted] = useState<Interview | null>(null);

  const [ending, setEnding] = useState(false);

  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const state = location.state as { initial?: StartInterviewResult } | null;
    if (state?.initial && state.initial.interview.id === id) {
      setInterview(state.initial.interview);
      setQuestion(state.initial.firstQuestion);
      setLoading(false);
      // Clear the router state so a refresh falls back to a real fetch
      // instead of replaying stale "initial" data.
      window.history.replaceState({}, "");
      return;
    }

    setLoading(true);
    setError(null);
    getInterview(id)
      .then(({ interview: iv }) => {
        if (cancelled) return;
        setInterview(iv);
        if (iv.status === "COMPLETED") {
          navigate(`/interviews/${id}/results`, { replace: true });
          return;
        }
        if (iv.status === "ABANDONED") {
          setEnded(true);
          setLoading(false);
          return;
        }
        return resumeInterview(id).then(({ question: q }) => {
          if (cancelled) return;
          setQuestion(q);
          setLoading(false);
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load this interview.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const handleSubmit = () => {
    if (!id || !answer.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    submitInterviewAnswer(id, answer.trim())
      .then((result) => {
        setLastScore(result.evaluation.currentScore);
        setInterview(result.interview);

        if (hasNextQuestion(result)) {
          setQuestion(result.firstQuestion);
          setAnswer("");
        } else {
          setQuestion(null);
          setCompleted(result.interview);
          redirectTimer.current = setTimeout(() => {
            navigate(`/interviews/${id}/results`, { replace: true });
          }, COMPLETION_REDIRECT_DELAY_MS);
        }
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not submit your answer.");
      })
      .finally(() => setSubmitting(false));
  };

  const handleEnd = () => {
    if (!id) return;
    if (!confirm("End this interview now? You can still review what you've answered so far.")) return;
    setEnding(true);
    endInterview(id)
      .then(() => {
        navigate(`/interviews/${id}/results`);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not end this interview.");
        setEnding(false);
      });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-2 w-full rounded-full bg-[var(--color-paper-raised)]" />
          <div className="h-40 rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
          <div className="h-32 rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <p className="font-display text-lg text-[var(--color-ink)]">This interview was ended early.</p>
        <p className="mt-2 font-body text-sm text-[var(--color-ink-soft)]">
          It won't accept more answers, but you can still review what was covered.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/interviews/${id}/results`)}
          className="mt-5 rounded-lg bg-[var(--color-accent)] px-5 py-2 font-body text-sm font-medium text-[var(--color-paper-raised)] hover:opacity-90"
        >
          View what was covered
        </button>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="card-reveal mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <GradeStamp score={lastScore} size="lg" />
        <p className="mt-4 font-display text-xl text-[var(--color-ink)]">Interview complete</p>
        <p className="mt-2 font-body text-sm text-[var(--color-ink-soft)]">
          Taking you to your results...
        </p>
      </div>
    );
  }

  if (!interview || !question) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error ?? "This interview could not be loaded."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-[var(--color-ink)]">{interview.topic}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <InterviewStatusBadge status={interview.status} />
            <span className="font-mono text-xs text-[var(--color-ink-soft)]">
              {interview.difficulty.toLowerCase()} · {interview.interviewType.toLowerCase()}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnd}
          disabled={ending}
          className="shrink-0 rounded-lg border border-[var(--color-fail)]/40 px-3 py-1.5 font-body text-xs font-medium text-[var(--color-fail)] transition-colors hover:bg-[var(--color-fail-soft)] disabled:opacity-50"
        >
          {ending ? "Ending..." : "End interview"}
        </button>
      </div>

      <div className="mb-6">
        <QuestionProgress current={interview.currentQuestionNumber} total={interview.totalQuestions} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-3 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      {lastScore !== null && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-2">
          <span className="font-body text-xs text-[var(--color-ink-soft)]">Previous answer scored</span>
          <span className="font-mono text-sm font-semibold text-[var(--color-ink)]">{lastScore}/10</span>
        </div>
      )}

      <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-6">
        <h4 className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Question {question.questionNumber}
        </h4>
        <p className="font-display text-lg leading-relaxed text-[var(--color-ink)]">{question.content}</p>
      </div>

      <div className="mt-5">
        {submitting ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-6 py-8 font-body text-sm text-[var(--color-ink-soft)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" />
            Evaluating your answer and preparing the next question...
          </div>
        ) : (
          <AnswerComposer value={answer} onChange={setAnswer} onSubmit={handleSubmit} submitting={submitting} />
        )}
      </div>
    </div>
  );
}
