import { useEffect, useState } from "react";
import { listKnowledge, ApiError } from "../lib/api";
import type { Knowledge, KnowledgeStatus } from "../types/knowledge";
import { SearchBar } from "../components/SearchBar";
import { FilterBar } from "../components/FilterBar";
import { KnowledgeGrid } from "../components/KnowledgeGrid";
import { Pagination } from "../components/Pagination";

const PAGE_SIZE = 24;

export function KnowledgeLibraryPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<KnowledgeStatus | "ALL">("ALL");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<{
    items: Knowledge[];
    page: number;
    totalPages: number;
    totalItems: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Debounce free-text search input before it drives a request.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    const [sortBy, sortOrder] = sort.split(":") as ["createdAt" | "updatedAt" | "title", "asc" | "desc"];
    setLoading(true);
    listKnowledge({
      page,
      pageSize: PAGE_SIZE,
      search: search || undefined,
      status: status === "ALL" ? undefined : status,
      sortBy,
      sortOrder,
    })
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load the knowledge library.");
      })
      .finally(() => setLoading(false));
  }, [page, search, status, sort]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-2xl text-[var(--color-ink)]">Your library</h1>
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchBar value={searchInput} onChange={setSearchInput} />
          <FilterBar
            status={status}
            onStatusChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            sort={sort}
            onSortChange={(v) => {
              setSort(v);
              setPage(1);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      <KnowledgeGrid
        items={result?.items ?? null}
        loading={loading}
        emptyMessage="No lectures match these filters yet."
      />

      {result && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          totalItems={result.totalItems}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
