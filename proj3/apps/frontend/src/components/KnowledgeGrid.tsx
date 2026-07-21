import type { Knowledge } from "../types/knowledge";
import { KnowledgeCard } from "./KnowledgeCard";

export function KnowledgeGrid({
  items,
  loading,
  emptyMessage = "Nothing here yet.",
}: {
  items: Knowledge[] | null;
  loading?: boolean;
  emptyMessage?: string;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="aspect-[4/5] animate-pulse rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] sm:aspect-[3/4]"
          />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-rule-strong)] px-5 py-10 text-center font-body text-sm text-[var(--color-ink-soft)]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((k) => (
        <KnowledgeCard key={k.id} knowledge={k} />
      ))}
    </div>
  );
}
