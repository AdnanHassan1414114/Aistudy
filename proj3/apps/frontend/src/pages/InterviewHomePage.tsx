import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ApiError, listInterviews, startInterview } from "../lib/api";
import type { Interview, InterviewDifficulty, InterviewType } from "../types/interview";
import { ResumeBanner } from "../components/ResumeBanner";
import { InterviewStatusBadge } from "../components/InterviewStatusBadge";

const QUICK_EXAMPLES = ["Take my Redis interview", "Take my JWT interview", "Take my Backend interview"];

const DIFFICULTIES: InterviewDifficulty[] = ["EASY", "MEDIUM", "HARD"];
const TYPES: InterviewType[] = ["THEORY", "CODING", "MIXED"];
const TYPE_LABEL: Record<InterviewType, string> = { THEORY: "Theory", CODING: "Coding", MIXED: "Mixed" };

export function InterviewHomePage() {
  const navigate = useNavigate();

  const [recent, setRecent] = useState<Interview[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  const [quickMessage, setQuickMessage] = useState("");
  const [quickStarting, setQuickStarting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<InterviewDifficulty>("MEDIUM");
  const [interviewType, setInterviewType] = useState<InterviewType>("MIXED");
  const [numberOfQuestions, setNumberOfQuestions] = useState(5);
  const [customStarting, setCustomStarting] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);

  useEffect(() => {
    listInterviews({ pageSize: 5 })
      .then((res) => setRecent(res.items))
      .catch((err) => setRecentError(err instanceof ApiError ? err.message : "Could not load recent interviews."));
  }, []);

  const resumable = recent?.find((i) => i.status === "IN_PROGRESS") ?? null;
  const busy = quickStarting || customStarting;

  function handleQuickStart() {
    const message = quickMessage.trim();
    if (!message || busy) return;
    setQuickError(null);
    setQuickStarting(true);
    startInterview({ mode: "QUICK", message })
      .then((result) => {
        navigate(`/interviews/${result.interview.id}/session`, { state: { initial: result } });
      })
      .catch((err) => setQuickError(err instanceof ApiError ? err.message : "Could not start this interview."))
      .finally(() => setQuickStarting(false));
  }

  function handleCustomStart() {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic || busy) return;
    setCustomError(null);
    setCustomStarting(true);
    startInterview({ mode: "CUSTOM", topic: trimmedTopic, difficulty, interviewType, numberOfQuestions })
      .then((result) => {
        navigate(`/interviews/${result.interview.id}/session`, { state: { initial: result } });
      })
      .catch((err) => setCustomError(err instanceof ApiError ? err.message : "Could not start this interview."))
      .finally(() => setCustomStarting(false));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mb-8">
        <p className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Interview practice
        </p>
        <h1 className="font-display text-3xl text-[var(--color-ink)]">Take an interview</h1>
        <p className="mt-2 max-w-lg font-body text-sm text-[var(--color-ink-soft)]">
          Questions are generated from your own processed lectures, then graded against them, question by question.
        </p>
      </div>

      <div className="space-y-6">
        {resumable && <ResumeBanner interview={resumable} />}

        {/* ── Quick Interview ── */}
        <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-6">
          <h2 className="font-display text-lg text-[var(--color-ink)]">Quick interview</h2>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-soft)]">
            Say what you want to be interviewed on, in plain language.
          </p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {QUICK_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setQuickMessage(ex)}
                className="rounded-full border border-[var(--color-rule)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-accent-soft)]/50"
              >
                {ex}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={quickMessage}
              onChange={(e) => setQuickMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickStart()}
              placeholder="Take my Redis interview"
              disabled={busy}
              className="h-11 flex-1 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleQuickStart}
              disabled={busy || !quickMessage.trim()}
              className="h-11 shrink-0 rounded-lg bg-[var(--color-accent)] px-5 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {quickStarting ? "Starting..." : "Start"}
            </button>
          </div>

          {quickError && <p className="mt-2 font-body text-xs text-[var(--color-fail)]">{quickError}</p>}
        </section>

        {/* ── Custom Interview ── */}
        <section className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-6">
          <h2 className="font-display text-lg text-[var(--color-ink)]">Custom interview</h2>
          <p className="mt-1 font-body text-sm text-[var(--color-ink-soft)]">
            Configure exactly what you want to practice.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                Topic
              </span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. React, System Design, Redis"
                disabled={busy}
                className="h-10 w-full rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
              />
            </label>

            <label>
              <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                Difficulty
              </span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as InterviewDifficulty)}
                disabled={busy}
                className="h-10 w-full rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 font-body text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0) + d.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                Interview type
              </span>
              <select
                value={interviewType}
                onChange={(e) => setInterviewType(e.target.value as InterviewType)}
                disabled={busy}
                className="h-10 w-full rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 font-body text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="sm:col-span-2">
              <span className="mb-1 block font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
                Number of questions
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={numberOfQuestions}
                onChange={(e) => setNumberOfQuestions(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                disabled={busy}
                className="h-10 w-28 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 font-body text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleCustomStart}
            disabled={busy || !topic.trim()}
            className="mt-4 h-11 rounded-lg bg-[var(--color-accent)] px-6 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {customStarting ? "Starting..." : "Start custom interview"}
          </button>

          {customError && <p className="mt-2 font-body text-xs text-[var(--color-fail)]">{customError}</p>}
        </section>

        {/* ── Recent Interviews ── */}
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg text-[var(--color-ink)]">Recent interviews</h2>
            <Link
              to="/interviews/history"
              className="font-body text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-accent)]"
            >
              View all
            </Link>
          </div>

          {recentError && <p className="font-body text-xs text-[var(--color-fail)]">{recentError}</p>}

          {!recent && !recentError && (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]"
                />
              ))}
            </div>
          )}

          {recent && recent.length === 0 && (
            <p className="rounded-lg border border-dashed border-[var(--color-rule-strong)] px-5 py-8 text-center font-body text-sm text-[var(--color-ink-soft)]">
              No interviews yet -- start one above.
            </p>
          )}

          {recent && recent.length > 0 && (
            <ul className="divide-y divide-[var(--color-rule)] overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]">
              {recent.map((interview) => {
                const linkTo =
                  interview.status === "COMPLETED"
                    ? `/interviews/${interview.id}/results`
                    : interview.status === "IN_PROGRESS"
                      ? `/interviews/${interview.id}/session`
                      : null;

                const row = (
                  <div className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--color-accent-soft)]/30">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm text-[var(--color-ink)]">{interview.topic}</p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
                        {interview.totalQuestions} question{interview.totalQuestions === 1 ? "" : "s"} ·{" "}
                        {interview.difficulty.toLowerCase()}
                      </p>
                    </div>
                    <InterviewStatusBadge status={interview.status} />
                  </div>
                );

                return (
                  <li key={interview.id}>{linkTo ? <Link to={linkTo}>{row}</Link> : <div className="opacity-60">{row}</div>}</li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
