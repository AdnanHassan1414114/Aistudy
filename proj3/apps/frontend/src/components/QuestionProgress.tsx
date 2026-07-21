export function QuestionProgress({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-mono text-xs uppercase tracking-wide text-[var(--color-ink-soft)]">
          Question {current} of {total}
        </span>
        <span className="font-mono text-xs text-[var(--color-ink-soft)]">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-rule)]/40">
        <div
          className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
