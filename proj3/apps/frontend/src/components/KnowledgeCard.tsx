import { Link } from "react-router-dom";
import type { Knowledge } from "../types/knowledge";
import { StatusBadge } from "./StatusBadge";
import { formatDateShort, formatDuration } from "../lib/format";

export function KnowledgeCard({ knowledge }: { knowledge: Knowledge }) {
  return (
    <Link
      to={`/knowledge/${knowledge.id}`}
      className="card-reveal group block overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] transition-colors hover:border-[var(--color-rule-strong)]"
    >
      <div className="aspect-video w-full overflow-hidden bg-[var(--color-paper)]">
        {knowledge.thumbnail ? (
          <img
            src={knowledge.thumbnail}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-mono text-xs text-[var(--color-ink-soft)]">
            no thumbnail
          </div>
        )}
      </div>

      <div className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-display text-[15px] leading-snug text-[var(--color-ink)]">
            {knowledge.title}
          </h3>
          <StatusBadge status={knowledge.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[var(--color-ink-soft)]">
          {knowledge.channelName && <span className="truncate">{knowledge.channelName}</span>}
          {knowledge.duration !== null && (
            <>
              <span>·</span>
              <span>{formatDuration(knowledge.duration)}</span>
            </>
          )}
          <span>·</span>
          <span>{formatDateShort(knowledge.updatedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
