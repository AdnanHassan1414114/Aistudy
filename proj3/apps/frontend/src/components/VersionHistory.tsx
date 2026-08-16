import type { KnowledgeVersion } from "../types/knowledge.types.frontend";
import { formatDate } from "../lib/format";

export function VersionHistory({
  versions,
  currentVersion,
  onRestore,
  restoring,
}: {
  versions: KnowledgeVersion[] | null;
  currentVersion: number;
  onRestore: (version: number) => void;
  restoring: boolean;
}) {
  if (!versions || versions.length === 0) {
    return <p className="font-body text-sm text-[var(--color-ink-soft)]">No edit history yet — this is version 1.</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div
          key={v.id}
          className="flex items-center justify-between rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 py-3"
        >
          <div className="flex items-center gap-3 font-body text-sm text-[var(--color-ink)]">
            <span className="font-mono text-xs text-[var(--color-ink-soft)]">v{v.version}</span>
            <span className="text-[var(--color-ink-soft)]">
              {formatDate(v.createdAt)}
              {v.editedBy ? ` · ${v.editedBy}` : ""}
            </span>
          </div>
          {v.version !== currentVersion && (
            <button
              type="button"
              disabled={restoring}
              onClick={() => onRestore(v.version)}
              className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1 font-body text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-accent-soft)]/50 disabled:opacity-50"
            >
              Restore
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
