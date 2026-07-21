import type { SourceBadgeType } from "../types/chat";

// Named ChatSourceBadge (rather than SourceBadge) to avoid colliding with
// StatusBadge, which already owns knowledge-processing status styling.
const LABEL: Record<SourceBadgeType, string> = {
  PERSONAL_KNOWLEDGE: "Personal Knowledge",
  EXTERNAL_AI: "External AI",
};

const DOT: Record<SourceBadgeType, string> = {
  PERSONAL_KNOWLEDGE: "bg-[var(--color-pass)]",
  EXTERNAL_AI: "bg-[var(--color-accent)]",
};

export function ChatSourceBadge({ source }: { source: SourceBadgeType }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[source]}`} />
      {LABEL[source]}
    </span>
  );
}
