import type { ConfidenceLevel } from "../types/chat";

const STYLE: Record<ConfidenceLevel, string> = {
  HIGH: "text-[var(--color-pass)] border-[var(--color-pass)]/40 bg-[var(--color-pass-soft)]",
  MEDIUM: "text-[var(--color-warn)] border-[var(--color-warn)]/40 bg-[var(--color-warn-soft)]",
  LOW: "text-[var(--color-fail)] border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)]",
};

export function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide ${STYLE[confidence]}`}
    >
      {confidence.toLowerCase()} confidence
    </span>
  );
}
