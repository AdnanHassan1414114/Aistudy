const MAX_ANSWER_LENGTH = 4000;

export function AnswerComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  submitting,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitting?: boolean;
}) {
  const overLimit = value.length > MAX_ANSWER_LENGTH;

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Type your answer..."
        rows={8}
        className="w-full resize-y rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-3 font-body text-[15px] leading-relaxed text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-60"
      />
      <div className="mt-2 flex items-center justify-between gap-4">
        <span className={`font-mono text-xs ${overLimit ? "text-[var(--color-fail)]" : "text-[var(--color-ink-soft)]"}`}>
          {value.length} / {MAX_ANSWER_LENGTH}
        </span>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || submitting || !value.trim() || overLimit}
          className="h-10 shrink-0 rounded-lg bg-[var(--color-accent)] px-6 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit answer"}
        </button>
      </div>
    </div>
  );
}
