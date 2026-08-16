import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ApiError,
  getKnowledge,
  getKnowledgeLatestJob,
  getKnowledgeVersions,
  knowledgePdfUrl,
  restoreKnowledgeVersion,
  softDeleteKnowledge,
  updateKnowledgeNotes,
} from "../lib/api";
import type { Knowledge, KnowledgeVersion, ProcessingJob } from "../types/knowledge";
import { StatusBadge } from "../components/StatusBadge";
import { JobProgressCard } from "../components/JobProgressCard";
import { Markdown } from "../components/Markdown";
import { TranscriptViewer } from "../components/TranscriptViewer";
import { VersionHistory } from "../components/VersionHistory";
import { formatDate, formatDuration } from "../lib/format";

type Tab = "notes" | "transcript" | "history";
const POLL_INTERVAL_MS = 3000;

export function KnowledgeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [knowledge, setKnowledge] = useState<Knowledge | null>(null);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("notes");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [versions, setVersions] = useState<KnowledgeVersion[] | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadKnowledge = useCallback(() => {
    if (!id) return;
    return getKnowledge(id)
      .then((k) => {
        setKnowledge(k);
        setError(null);
        return k;
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Could not load this lecture.");
        return null;
      });
  }, [id]);

  useEffect(() => {
    setLoading(true);
    loadKnowledge()?.finally(() => setLoading(false));
  }, [loadKnowledge]);

  useEffect(() => {
    if (knowledge?.notes !== undefined) setDraft(knowledge?.notes ?? "");
  }, [knowledge?.notes]);

  const isProcessing = knowledge?.status === "PENDING" || knowledge?.status === "PROCESSING";
  const isFailed = knowledge?.status === "FAILED";

  // Live progress via polling (no SSE), per Milestone 4 backend constraints.
  useEffect(() => {
    if (!id || !(isProcessing || isFailed)) return;

    let cancelled = false;
    const poll = () => {
      getKnowledgeLatestJob(id).then((j) => {
        if (cancelled) return;
        setJob(j);
      });
    };
    poll();
    const interval = setInterval(() => {
      poll();
      loadKnowledge();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, isProcessing, isFailed, loadKnowledge]);

  useEffect(() => {
    if (tab !== "history" || !id) return;
    getKnowledgeVersions(id)
      .then(setVersions)
      .catch(() => setVersions([]));
  }, [tab, id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateKnowledgeNotes(id, draft);
      setKnowledge(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save notes.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    if (!confirm("Delete this lecture and its notes?")) return;
    setDeleting(true);
    try {
      await softDeleteKnowledge(id);
      navigate("/knowledge");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete this lecture.");
      setDeleting(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!id) return;
    if (!confirm(`Restore notes to version ${version}? This creates a new version — nothing is lost.`)) return;
    setRestoring(true);
    try {
      const updated = await restoreKnowledgeVersion(id, version);
      setKnowledge(updated);
      const refreshed = await getKnowledgeVersions(id);
      setVersions(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not restore this version.");
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="h-40 animate-pulse rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]" />
      </div>
    );
  }

  if (error && !knowledge) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-4 font-body text-sm text-[var(--color-fail)]">
          {error}
        </div>
      </div>
    );
  }

  if (!knowledge) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {knowledge.thumbnail && (
            <img
              src={knowledge.thumbnail}
              alt=""
              className="aspect-video w-28 shrink-0 rounded-lg border border-[var(--color-rule)] object-cover sm:w-36"
            />
          )}
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-snug text-[var(--color-ink)]">{knowledge.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-[var(--color-ink-soft)]">
              {knowledge.channelName && <span>{knowledge.channelName}</span>}
              {knowledge.duration !== null && (
                <>
                  <span>·</span>
                  <span>{formatDuration(knowledge.duration)}</span>
                </>
              )}
              <span>·</span>
              <span>Added {formatDate(knowledge.createdAt)}</span>
              <span>·</span>
              <span>Updated {formatDate(knowledge.updatedAt)}</span>
            </div>
          </div>
        </div>
        <StatusBadge status={knowledge.status} />
      </div>

      {(isProcessing || isFailed) && <JobProgressCard job={job} />}

      {knowledge.status === "COMPLETED" && (
        <>
          {(knowledge.processingTime !== null || knowledge.aiModel) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-[var(--color-ink-soft)]">
              {knowledge.processingTime !== null && (
                <span>Processed in {(knowledge.processingTime / 1000).toFixed(1)}s</span>
              )}
              {knowledge.aiModel && <span>Notes by {knowledge.aiModel}</span>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-rule)]">
            {(["notes", "transcript", "history"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`border-b-2 px-3 py-2 font-body text-sm font-medium capitalize ${
                  tab === t
                    ? "border-[var(--color-accent)] text-[var(--color-ink)]"
                    : "border-transparent text-[var(--color-ink-soft)]"
                }`}
              >
                {t}
              </button>
            ))}

            <div className="ml-auto flex gap-2 pb-2">
              {tab === "notes" && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-accent-soft)]/50"
                >
                  Edit
                </button>
              )}
              {tab === "notes" && editing && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-paper-raised)] disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
              <a href={knowledgePdfUrl(knowledge.id)} target="_blank" rel="noreferrer">
                <button
                  type="button"
                  className="rounded-md border border-[var(--color-rule-strong)] px-3 py-1.5 font-body text-xs font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-accent-soft)]/50"
                >
                  PDF
                </button>
              </a>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md border border-[var(--color-fail)]/40 px-3 py-1.5 font-body text-xs font-medium text-[var(--color-fail)] transition-colors hover:bg-[var(--color-fail-soft)] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-[var(--color-fail)]/40 bg-[var(--color-fail-soft)] px-5 py-3 font-body text-sm text-[var(--color-fail)]">
              {error}
            </div>
          )}

          {tab === "notes" &&
            (editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={22}
                className="w-full rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-4 font-mono text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            ) : (
              <Markdown>{knowledge.notes ?? ""}</Markdown>
            ))}

          {tab === "transcript" && <TranscriptViewer transcript={knowledge.transcriptClean} />}

          {tab === "history" && (
            <VersionHistory
              versions={versions}
              currentVersion={knowledge.version}
              onRestore={handleRestore}
              restoring={restoring}
            />
          )}
        </>
      )}
    </div>
  );
}
