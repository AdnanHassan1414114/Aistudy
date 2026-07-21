function tier(score: number): { bar: string; text: string } {
  if (score >= 8) return { bar: "bg-[var(--color-pass)]", text: "text-[var(--color-pass)]" };
  if (score >= 5) return { bar: "bg-[var(--color-warn)]", text: "text-[var(--color-warn)]" };
  return { bar: "bg-[var(--color-fail)]", text: "text-[var(--color-fail)]" };
}

export function ScoreBar({ label, score }: { label: string; score: number | null }) {
  const pct = score === null ? 0 : Math.max(0, Math.min(100, (score / 10) * 100));
  const colors = score === null ? { bar: "bg-[var(--color-rule)]", text: "text-[var(--color-ink-soft)]" } : tier(score);

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-body text-xs font-medium uppercase tracking-wide text-[var(--color-ink-soft)]">
          {label}
        </span>
        <span className={`font-mono text-sm font-semibold ${colors.text}`}>
          {score === null ? "--" : `${score}/10`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-rule)]/40">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${colors.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
