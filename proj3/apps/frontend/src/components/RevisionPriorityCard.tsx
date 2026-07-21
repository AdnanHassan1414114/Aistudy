import { Link } from "react-router-dom";
import type { RevisionPriorityItem, TopicKnowledge, WeakTopicItem } from "../types/revision";

export function RevisionPriorityCard({
  priority,
  weakTopic,
  knowledge,
}: {
  priority: RevisionPriorityItem;
  weakTopic: WeakTopicItem | undefined;
  knowledge: TopicKnowledge | undefined;
}) {
  return (
    <div className="card-reveal overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-5 py-4">
      <div className="mb-2 flex items-center gap-3">
        <span className="shrink-0 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-0.5 font-mono text-xs font-semibold text-[var(--color-accent)]">
          Priority {weakTopic?.priority ?? "?"}
        </span>
        <h3 className="min-w-0 flex-1 truncate font-display text-[15px] text-[var(--color-ink)]">{priority.topic}</h3>
      </div>

      <div className="space-y-2">
        <p className="font-body text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">Reason: </span>
          {priority.reason}
        </p>
        <p className="font-body text-sm text-[var(--color-ink-soft)]">
          <span className="font-semibold text-[var(--color-ink)]">Suggested revision: </span>
          {priority.suggestedRevision}
        </p>
      </div>

      {knowledge && knowledge.notes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-dashed border-[var(--color-rule-strong)] pt-3">
          {knowledge.notes.map((note) => (
            <Link
              key={`${note.knowledgeId}-${note.heading ?? ""}-${note.section ?? ""}`}
              to={`/knowledge/${note.knowledgeId}`}
              className="rounded-full border border-[var(--color-rule-strong)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              title={[note.heading, note.section].filter(Boolean).join(" > ")}
            >
              {note.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
