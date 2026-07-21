export function SearchBar({
  value,
  onChange,
  placeholder = "Search by title...",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative w-full sm:w-64">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-soft)]"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="9" cy="9" r="6" strokeWidth="1.6" />
        <path d="M13.5 13.5L17 17" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] pl-9 pr-3 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </div>
  );
}
