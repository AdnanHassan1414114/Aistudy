import type { ProcessingJob } from "../types/knowledge";
import { JOB_STEP_LABEL, formatEta } from "../lib/format";

export function JobProgressCard({ job }: { job: ProcessingJob | null }) {
  if (!job) {
    return (
      <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-5 py-4 font-body text-sm text-[var(--color-ink-soft)]">
        Waiting for the worker to pick up this job...
      </div>
    );
  }

  const isFailed = job.currentStep === "FAILED";
  const pct = isFailed ? 100 : Math.max(0, Math.min(100, job.progressPercentage));

  return (
    <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] px-5 py-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          {isFailed ? "Failed" : JOB_STEP_LABEL[job.currentStep]}
        </span>
        {!isFailed && job.estimatedRemainingSeconds !== null && (
          <span className="font-mono text-xs text-[var(--color-ink-soft)]">
            {formatEta(job.estimatedRemainingSeconds)}
          </span>
        )}
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-rule)]/40">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            isFailed ? "bg-[var(--color-fail)]" : "bg-[var(--color-accent)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {job.retryCount > 0 && !isFailed && (
        <p className="mt-2 font-body text-xs text-[var(--color-warn)]">
          Retry attempt {job.retryCount}
        </p>
      )}

      {isFailed && job.failureReason && (
        <p className="mt-2 font-body text-sm text-[var(--color-fail)]">{job.failureReason}</p>
      )}
    </div>
  );
}
