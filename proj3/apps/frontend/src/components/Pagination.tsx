export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 font-mono text-xs text-[var(--color-ink-soft)]">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-md border border-[var(--color-rule)] px-3 py-1.5 uppercase tracking-wide transition-colors hover:border-[var(--color-rule-strong)] disabled:opacity-40"
      >
        Prev
      </button>
      <span>
        Page {page} of {totalPages} ({totalItems} total)
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-md border border-[var(--color-rule)] px-3 py-1.5 uppercase tracking-wide transition-colors hover:border-[var(--color-rule-strong)] disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
