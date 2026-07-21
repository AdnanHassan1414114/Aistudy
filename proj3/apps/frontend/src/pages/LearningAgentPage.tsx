import { useCallback, useRef, useState } from "react";
import { ApiError, runLearningAgent } from "../lib/api";
import type { LearningAgentReference, LearningAgentTurn } from "../types/learningAgent";
import { Markdown } from "../components/Markdown";
import { WorkflowBadge } from "../components/WorkflowBadge";
import { TypingIndicator } from "../components/TypingIndicator";

const EXAMPLES = ["I forgot Redis, can you help?", "Take my JWT interview", "Help me revise Docker"];

let localIdCounter = 0;
function localId() {
  localIdCounter += 1;
  return `local-${Date.now()}-${localIdCounter}`;
}

/** A reference entry is either a flat KnowledgeReference (from Chat/Interview)
 *  or a TopicKnowledge group (from Revision, notes grouped by weak topic).
 *  The agent passes through whatever the underlying workflow returned, so
 *  the page renders whichever shape shows up rather than normalizing it. */
function ReferenceList({ references }: { references: LearningAgentReference[] }) {
  if (references.length === 0) return null;

  const isGrouped = typeof references[0].topic === "string" && Array.isArray(references[0].notes);

  if (isGrouped) {
    return (
      <div className="mt-2 space-y-1.5">
        {references.map((group, i) => {
          const notes = (group.notes as { title: string }[]) ?? [];
          if (notes.length === 0) return null;
          return (
            <div key={`${group.topic}-${i}`} className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-ink-soft)]">
                {String(group.topic)}:
              </span>
              {notes.map((n, j) => (
                <span
                  key={`${n.title}-${j}`}
                  className="rounded-full border border-[var(--color-rule)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-soft)]"
                >
                  {n.title}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {references.map((ref, i) => (
        <span
          key={`${ref.title}-${i}`}
          className="rounded-full border border-[var(--color-rule)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink-soft)]"
          title={typeof ref.heading === "string" ? ref.heading : undefined}
        >
          {String(ref.title ?? "Reference")}
        </span>
      ))}
    </div>
  );
}

/**
 * Milestone 6 — Intelligent Learning Agent frontend. A single conversational
 * composer: the user types naturally ("I forgot Redis", "Take my JWT
 * interview", "Help me revise Docker") and the agent decides which of the
 * three existing workflows (Chat / Interview / Revision) to run, showing
 * which one it picked alongside the response.
 */
export function LearningAgentPage() {
  const [turns, setTurns] = useState<LearningAgentTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversationIdRef = useRef<string | undefined>(undefined);
  const interviewIdRef = useRef<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    (message: string) => {
      const trimmed = message.trim();
      if (!trimmed || isSending) return;

      setError(null);
      setDraft("");
      setTurns((prev) => [...prev, { id: localId(), role: "USER", content: trimmed }]);
      setIsSending(true);

      runLearningAgent({
        message: trimmed,
        conversationId: conversationIdRef.current,
        interviewId: interviewIdRef.current,
      })
        .then((result) => {
          conversationIdRef.current = result.conversationId ?? conversationIdRef.current;
          interviewIdRef.current = result.interviewId ?? interviewIdRef.current;

          setTurns((prev) => [
            ...prev,
            {
              id: localId(),
              role: "AGENT",
              content: result.response,
              workflow: result.workflowSelected,
              references: result.references,
            },
          ]);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
        })
        .finally(() => {
          setIsSending(false);
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
        });
    },
    [isSending]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const startOver = useCallback(() => {
    conversationIdRef.current = undefined;
    interviewIdRef.current = undefined;
    setTurns([]);
    setError(null);
  }, []);

  return (
    <div className="mx-auto flex h-[calc(100vh-56px)] max-w-3xl flex-col px-4 sm:px-6">
      <div className="flex items-center justify-between border-b border-[var(--color-rule)] py-4">
        <div>
          <h1 className="font-display text-lg text-[var(--color-ink)]">AI Learning Agent</h1>
          <p className="font-body text-xs text-[var(--color-ink-soft)]">
            Just tell it what you need — it picks Chat, Interview, or Revision for you.
          </p>
        </div>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={startOver}
            className="rounded-md border border-[var(--color-rule)] px-3 py-1.5 font-body text-xs text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
          >
            Start over
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-3 font-body text-sm text-[var(--color-fail)]">
            {error}
          </div>
        )}

        {turns.length === 0 && !isSending && (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="font-display text-lg text-[var(--color-ink)]">What do you want to work on?</p>
            <p className="max-w-sm font-body text-sm text-[var(--color-ink-soft)]">
              Ask a question, start an interview, or ask to revise a weak area — the agent figures out which
              workflow to run.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => send(example)}
                  className="rounded-full border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-3 py-1.5 font-body text-xs text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)]"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {turns.map((turn) => (
            <div key={turn.id} className={`flex w-full ${turn.role === "USER" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] ${turn.role === "USER" ? "order-2" : ""}`}>
                {turn.role === "AGENT" && turn.workflow && (
                  <div className="mb-1.5">
                    <WorkflowBadge workflow={turn.workflow} />
                  </div>
                )}

                <div
                  className={`rounded-lg px-4 py-3 ${
                    turn.role === "USER"
                      ? "bg-[var(--color-accent)] text-[var(--color-paper-raised)]"
                      : "border border-[var(--color-rule)] bg-[var(--color-paper-raised)]"
                  }`}
                >
                  {turn.role === "USER" ? (
                    <p className="whitespace-pre-wrap font-body text-[15px] leading-relaxed">{turn.content}</p>
                  ) : (
                    <Markdown>{turn.content}</Markdown>
                  )}
                </div>

                {turn.role === "AGENT" && turn.references && <ReferenceList references={turn.references} />}
              </div>
            </div>
          ))}

          {isSending && (
            <div className="flex w-full justify-start">
              <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-3">
                <TypingIndicator />
              </div>
            </div>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] py-3 sm:py-4">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            placeholder='Try "I forgot Redis" or "Take my JWT interview"...'
            rows={2}
            className="max-h-40 flex-1 resize-none rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-2.5 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send(draft)}
            disabled={isSending || !draft.trim()}
            className="h-11 shrink-0 rounded-lg bg-[var(--color-accent)] px-5 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
