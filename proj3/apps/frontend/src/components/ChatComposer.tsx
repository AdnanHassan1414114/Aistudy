import { KNOWLEDGE_SCOPES, type KnowledgeScope } from "../types/chat";

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  scope,
  onScopeChange,
  scopeLocked,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  scope: KnowledgeScope;
  onScopeChange: (scope: KnowledgeScope) => void;
  scopeLocked: string | null;
  disabled?: boolean;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) onSend();
    }
  };

  return (
    <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">Scope</span>
        {scopeLocked ? (
          <span className="rounded-full border border-[var(--color-rule)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-ink-soft)]">
            {scopeLocked}
          </span>
        ) : (
          <select
            value={scope}
            onChange={(e) => onScopeChange(e.target.value as KnowledgeScope)}
            className="h-8 rounded-md border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-2 font-body text-xs text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {KNOWLEDGE_SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask about your knowledge base..."
          rows={2}
          className="max-h-40 flex-1 resize-none rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-2.5 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
        />
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            className="h-11 shrink-0 rounded-lg border border-[var(--color-fail)]/40 px-5 font-body text-sm font-medium text-[var(--color-fail)] transition-colors hover:bg-[var(--color-fail-soft)]"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={disabled || !value.trim()}
            className="h-11 shrink-0 rounded-lg bg-[var(--color-accent)] px-5 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
