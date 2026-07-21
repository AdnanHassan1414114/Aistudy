import type { LearningAgentIntent } from "../types/learningAgent";

// Mirrors ChatSourceBadge's styling convention -- a small dot + label pill.
const LABEL: Record<LearningAgentIntent, string> = {
  CHAT: "Chat",
  INTERVIEW: "Interview",
  REVISION: "Revision",
};

const DOT: Record<LearningAgentIntent, string> = {
  CHAT: "bg-[var(--color-accent)]",
  INTERVIEW: "bg-[var(--color-pass)]",
  REVISION: "bg-[var(--color-fail)]",
};

export function WorkflowBadge({ workflow }: { workflow: LearningAgentIntent }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[workflow]}`} />
      {LABEL[workflow]}
    </span>
  );
}
