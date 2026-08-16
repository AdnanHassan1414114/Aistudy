import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { listKnowledge, ApiError } from "../lib/api";
import type { Knowledge } from "../types/knowledge.types.frontend";
import { UrlSubmitForm } from "../components/UrlSubmitForm";
import { KnowledgeGrid } from "../components/KnowledgeGrid";

const POLL_INTERVAL_MS = 4000;

function hasActiveJob(items: Knowledge[] | null): boolean {
  return !!items?.some((k) => k.status === "PENDING" || k.status === "PROCESSING");
}

export function HomePage() {
  const [recentlyAdded, setRecentlyAdded] = useState<Knowledge[] | null>(null);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Knowledge[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [added, updated] = await Promise.all([
        listKnowledge({ page: 1, pageSize: 6, sortBy: "createdAt", sortOrder: "desc" }),
        listKnowledge({ page: 1, pageSize: 6, sortBy: "updatedAt", sortOrder: "desc" }),
      ]);
      setRecentlyAdded(added.items);
      setRecentlyUpdated(updated.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your knowledge library.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll the lists (no SSE) while anything is still pending/processing so
  // status badges update on their own.
  useEffect(() => {
    if (!hasActiveJob(recentlyAdded) && !hasActiveJob(recentlyUpdated)) return;
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [recentlyAdded, recentlyUpdated, load]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <section className="mb-12 flex flex-col items-center gap-4 py-4 text-center">
        <p className="font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          AI Learning Agent
        </p>
        <h1 className="max-w-xl font-display text-3xl leading-snug text-[var(--color-ink)] sm:text-4xl">
          Turn any lecture into study notes
        </h1>
        <p className="max-w-xl font-body text-sm text-[var(--color-ink-soft)]">
          Paste a YouTube lecture URL and get structured, interview-ready revision notes in minutes.
        </p>
        <UrlSubmitForm />
      </section>

      {error && (
        <div className="mb-8 rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-lg text-[var(--color-ink)]">Recently added</h2>
          <Link to="/knowledge" className="font-body text-sm text-[var(--color-accent)] hover:underline">
            View library
          </Link>
        </div>
        <KnowledgeGrid items={recentlyAdded} loading={loading} emptyMessage="No lectures processed yet." />
      </section>

      {recentlyUpdated && recentlyUpdated.length > 0 && (
        <section>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-lg text-[var(--color-ink)]">Recently updated</h2>
            <Link to="/knowledge" className="font-body text-sm text-[var(--color-accent)] hover:underline">
              View library
            </Link>
          </div>
          <KnowledgeGrid items={recentlyUpdated} loading={false} />
        </section>
      )}
    </div>
  );
}
