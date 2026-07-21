import type { ConfidenceLevel, KnowledgeReference, MessageRole, SourceBadgeType } from "../types/chat";
import { Markdown } from "./Markdown";
import { ChatSourceBadge } from "./ChatSourceBadge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { TypingIndicator } from "./TypingIndicator";

export function ChatMessage({
  role,
  content,
  sourceBadge,
  confidence,
  knowledgeRefs,
  externalReason,
  savedToKnowledge,
  isStreaming,
  onSaveToKnowledge,
  saving,
}: {
  role: MessageRole;
  content: string;
  sourceBadge?: SourceBadgeType | null;
  confidence?: ConfidenceLevel | null;
  knowledgeRefs?: KnowledgeReference[] | null;
  externalReason?: string | null;
  savedToKnowledge?: boolean;
  isStreaming?: boolean;
  onSaveToKnowledge?: () => void;
  saving?: boolean;
}) {
  const isUser = role === "USER";

  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] sm:max-w-[75%] ${isUser ? "order-2" : ""}`}>
        {!isUser && (sourceBadge || confidence) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {sourceBadge && <ChatSourceBadge source={sourceBadge} />}
            {confidence && <ConfidenceBadge confidence={confidence} />}
          </div>
        )}

        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? "bg-[var(--color-accent)] text-[var(--color-paper-raised)]"
              : "border border-[var(--color-rule)] bg-[var(--color-paper-raised)]"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap font-body text-[15px] leading-relaxed">{content}</p>
          ) : content ? (
            <Markdown>{content}</Markdown>
          ) : isStreaming ? (
            <TypingIndicator />
          ) : null}
          {isStreaming && content && (
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[var(--color-ink-soft)] align-text-bottom" />
          )}
        </div>

        {!isUser && externalReason && (
          <p className="mt-1.5 font-body text-xs text-[var(--color-ink-soft)]">{externalReason}</p>
        )}

        {!isUser && knowledgeRefs && knowledgeRefs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {knowledgeRefs.map((ref, i) => (
              <span
                key={`${ref.knowledgeId}-${i}`}
                className="rounded-full border border-[var(--color-rule)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-soft)]"
                title={ref.heading ?? undefined}
              >
                {ref.title}
              </span>
            ))}
          </div>
        )}

        {!isUser && sourceBadge === "EXTERNAL_AI" && onSaveToKnowledge && !isStreaming && (
          <button
            type="button"
            onClick={onSaveToKnowledge}
            disabled={savedToKnowledge || saving}
            className="mt-1.5 rounded-md border border-[var(--color-rule-strong)] px-2.5 py-1 font-body text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-accent-soft)]/50 disabled:opacity-50"
          >
            {savedToKnowledge ? "Saved to knowledge base" : saving ? "Saving..." : "Save to knowledge base"}
          </button>
        )}
      </div>
    </div>
  );
}
