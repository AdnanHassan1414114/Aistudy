import type { KnowledgeStatus } from "../types/knowledge";

const STATUS_OPTIONS: { value: KnowledgeStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "PROCESSING", label: "Processing" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "createdAt:desc", label: "Newest first" },
  { value: "createdAt:asc", label: "Oldest first" },
  { value: "updatedAt:desc", label: "Recently updated" },
  { value: "title:asc", label: "Title (A-Z)" },
];

const selectClass =
  "h-10 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-3 font-body text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none";

export function FilterBar({
  status,
  onStatusChange,
  sort,
  onSortChange,
}: {
  status: KnowledgeStatus | "ALL";
  onStatusChange: (status: KnowledgeStatus | "ALL") => void;
  sort: string;
  onSortChange: (sort: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        className={selectClass}
        value={status}
        onChange={(e) => onStatusChange(e.target.value as KnowledgeStatus | "ALL")}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select className={selectClass} value={sort} onChange={(e) => onSortChange(e.target.value)}>
        {SORT_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
