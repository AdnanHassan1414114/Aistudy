import { Link } from "react-router-dom";
import type { LearningPathStep, LearningPathStepType } from "../types/learningPath";
import { Markdown } from "./Markdown";

const TYPE_LABEL: Record<LearningPathStepType, string> = {
  REVIEW_TOPIC: "Review",
  READ_NOTES: "Read notes",
  ASK_CHAT: "Ask chat",
  RETAKE_INTERVIEW: "Interview",
};

const TYPE_ICON: Record<LearningPathStepType, string> = {
  REVIEW_TOPIC: "M4 6h12M4 10h12M4 14h8",
  READ_NOTES: "M5 4h10v12H5z M5 4v12 M8 7h4 M8 10h4",
  ASK_CHAT: "M3 5h14v8H8l-4 3v-3H3z",
  RETAKE_INTERVIEW: "M10 3l6 3v4c0 4-2.5 6.5-6 7-3.5-.5-6-3-6-7V6l6-3z",
};

export function LearningPathStepCard({
  step,
  onOpenChat,
  onStartInterview,
}: {
  step: LearningPathStep;
  onOpenChat: () => void;
  onStartInterview: () => void;
}) {
  return (
    <div className="card-reveal overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-5 py-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-rule-strong)] font-mono text-xs font-semibold text-[var(--color-ink-soft)]">
          {step.stepNumber}
        </span>
        <svg className="h-4 w-4 shrink-0 text-[var(--color-ink-soft)]" viewBox="0 0 20 20" fill="none" stroke="currentColor">
          <path d={TYPE_ICON[step.type]} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h3 className="min-w-0 flex-1 truncate font-display text-[15px] text-[var(--color-ink)]">{step.title}</h3>
        <span className="shrink-0 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-accent)]">
          Priority {step.priority}
        </span>
        <span className="shrink-0 rounded-full border border-[var(--color-rule-strong)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
          {TYPE_LABEL[step.type]}
        </span>
      </div>

      <Markdown>{step.description}</Markdown>

      {step.relatedNotes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed border-[var(--color-rule-strong)] pt-3">
          {step.relatedNotes.map((note) => (
            <Link
              key={`${note.knowledgeId}-${note.heading ?? ""}-${note.section ?? ""}`}
              to={`/knowledge/${note.knowledgeId}`}
              className="rounded-full border border-[var(--color-rule-strong)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              title={[note.heading, note.section].filter(Boolean).join(" > ")}
            >
              {note.title}
            </Link>
          ))}
        </div>
      )}

      {step.type === "ASK_CHAT" && (
        <div className="mt-3 border-t border-dashed border-[var(--color-rule-strong)] pt-3">
          <button
            type="button"
            onClick={onOpenChat}
            className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1.5 font-body text-xs text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Open chat
          </button>
        </div>
      )}

      {step.type === "RETAKE_INTERVIEW" && (
        <div className="mt-3 border-t border-dashed border-[var(--color-rule-strong)] pt-3">
          <button
            type="button"
            onClick={onStartInterview}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 font-body text-xs font-medium text-white transition-opacity hover:opacity-90"
          >
            Start another interview
          </button>
        </div>
      )}
    </div>
  );
}
