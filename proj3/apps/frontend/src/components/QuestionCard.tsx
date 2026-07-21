import { useState } from "react";
import type { QuestionReviewItem } from "../types/interview";
import { ScoreBar } from "./ScoreBar";
import { GradeStamp } from "./GradeStamp";
import { Markdown } from "./Markdown";

export function QuestionCard({ item, defaultOpen = false }: { item: QuestionReviewItem; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const evaluated = item.overallScore !== null;

  return (
    <div className="card-reveal overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--color-accent-soft)]/30"
      >
        <span className="font-mono text-xs text-[var(--color-ink-soft)]">
          Q{String(item.questionNumber).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[15px] text-[var(--color-ink)] sm:whitespace-normal sm:line-clamp-1">
          {item.question}
        </span>
        {evaluated ? (
          <GradeStamp score={item.overallScore} size="sm" />
        ) : (
          <span className="shrink-0 rounded-full border border-[var(--color-rule-strong)] px-2 py-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
            unscored
          </span>
        )}
        <svg
          className={`h-4 w-4 shrink-0 text-[var(--color-ink-soft)] transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
        >
          <path d="M5 7.5L10 12.5L15 7.5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[var(--color-rule)] px-5 py-5">
          <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
            {/* ── main transcript column ── */}
            <div className="space-y-5">
              <div>
                <h4 className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Question
                </h4>
                <p className="font-display text-base leading-relaxed text-[var(--color-ink)]">{item.question}</p>
              </div>

              <div>
                <h4 className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                  Your answer
                </h4>
                {item.userAnswer ? (
                  <p className="whitespace-pre-wrap font-body text-[15px] leading-relaxed text-[var(--color-ink)]">
                    {item.userAnswer}
                  </p>
                ) : (
                  <p className="font-body text-sm italic text-[var(--color-ink-soft)]">No answer was submitted.</p>
                )}
              </div>

              {item.feedback && (
                <div>
                  <h4 className="mb-1 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                    Feedback
                  </h4>
                  <Markdown>{item.feedback}</Markdown>
                </div>
              )}

              {(item.strengths.length > 0 || item.missingTopics.length > 0) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {item.strengths.length > 0 && (
                    <div>
                      <h4 className="mb-1.5 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-pass)]">
                        Strengths
                      </h4>
                      <ul className="space-y-1">
                        {item.strengths.map((s, i) => (
                          <li key={i} className="flex gap-2 font-body text-sm text-[var(--color-ink)]">
                            <span className="text-[var(--color-pass)]">+</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {item.missingTopics.length > 0 && (
                    <div>
                      <h4 className="mb-1.5 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-fail)]">
                        Missing topics
                      </h4>
                      <ul className="space-y-1">
                        {item.missingTopics.map((t, i) => (
                          <li key={i} className="flex gap-2 font-body text-sm text-[var(--color-ink)]">
                            <span className="text-[var(--color-fail)]">-</span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── margin column: score breakdown ── */}
            <div className="space-y-4 border-t border-dashed border-[var(--color-rule-strong)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <ScoreBar label="Overall" score={item.overallScore} />
              <ScoreBar label="Concept accuracy" score={item.conceptAccuracy} />
              <ScoreBar label="Completeness" score={item.completeness} />
              <ScoreBar label="Clarity" score={item.clarity} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
