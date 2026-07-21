import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createKnowledge, ApiError } from "../lib/api";

export function UrlSubmitForm() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createKnowledge(url.trim());
      setUrl("");
      navigate(`/knowledge/${result.knowledgeId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit this URL.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube lecture URL..."
          className="h-11 flex-1 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-4 font-body text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="h-11 shrink-0 rounded-lg bg-[var(--color-accent)] px-6 font-body text-sm font-medium text-[var(--color-paper-raised)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Process lecture"}
        </button>
      </form>
      {error && <p className="mt-2 font-body text-sm text-[var(--color-fail)]">{error}</p>}
    </div>
  );
}
