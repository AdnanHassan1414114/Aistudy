import type { Conversation } from "../types/chat";
import { formatDateShort } from "../lib/format";

export function ConversationSidebar({
  conversations,
  loading,
  activeConversationId,
  onSelect,
  onNewConversation,
}: {
  conversations: Conversation[] | null;
  loading: boolean;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onNewConversation: () => void;
}) {
  return (
    <aside className="flex max-h-56 w-full flex-col border-b border-[var(--color-rule)] sm:h-full sm:max-h-none sm:w-64 sm:shrink-0 sm:border-b-0 sm:border-r">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewConversation}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90"
        >
          <span className="text-base leading-none">+</span>
          New conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-[var(--color-paper-raised)]" />
            ))}
          </div>
        )}

        {!loading && (!conversations || conversations.length === 0) && (
          <p className="px-1 py-6 text-center font-body text-xs text-[var(--color-ink-soft)]">
            No conversations yet.
          </p>
        )}

        {!loading && conversations && conversations.length > 0 && (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${
                    c.id === activeConversationId
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-[var(--color-paper-raised)]"
                  }`}
                >
                  <p className="line-clamp-1 font-body text-sm text-[var(--color-ink)]">{c.title}</p>
                  <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-[var(--color-ink-soft)]">
                    <span>{formatDateShort(c.updatedAt)}</span>
                    {c.knowledgeScope && (
                      <>
                        <span>·</span>
                        <span className="truncate">{c.knowledgeScope}</span>
                      </>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
