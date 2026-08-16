import type { KnowledgeStatus } from "../types/knowledge.types.frontend";

const STATUS_STYLE: Record<KnowledgeStatus, string> = {
  COMPLETED: "text-[var(--color-pass)] border-[var(--color-pass)]/40 bg-[var(--color-pass-soft)]",
  PROCESSING: "text-[var(--color-accent)] border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]",
  PENDING: "text-[var(--color-ink-soft)] border-[var(--color-rule-strong)] bg-transparent",
  FAILED: "text-[var(--color-fail)] border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)]",
};

const STATUS_LABEL: Record<KnowledgeStatus, string> = {
  COMPLETED: "completed",
  PROCESSING: "processing",
  PENDING: "pending",
  FAILED: "failed",
};

export function StatusBadge({ status }: { status: KnowledgeStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wide ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
