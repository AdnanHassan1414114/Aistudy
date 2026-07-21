import type { InterviewStatus } from "../types/interview";

const STATUS_STYLE: Record<InterviewStatus, string> = {
  COMPLETED: "text-[var(--color-pass)] border-[var(--color-pass)]/40 bg-[var(--color-pass-soft)]",
  IN_PROGRESS: "text-[var(--color-accent)] border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]",
  ABANDONED: "text-[var(--color-ink-soft)] border-[var(--color-rule-strong)] bg-transparent",
};

const STATUS_LABEL: Record<InterviewStatus, string> = {
  COMPLETED: "completed",
  IN_PROGRESS: "in progress",
  ABANDONED: "abandoned",
};

export function InterviewStatusBadge({ status }: { status: InterviewStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
