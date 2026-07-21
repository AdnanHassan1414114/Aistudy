import type { InterviewResultSummary } from "../types/interview";
import { GradeStamp } from "./GradeStamp";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "In progress";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const DIFFICULTY_LABEL: Record<string, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };
const TYPE_LABEL: Record<string, string> = { THEORY: "Theory", CODING: "Coding", MIXED: "Mixed" };
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  ABANDONED: "Abandoned",
};

export function InterviewSummaryHeader({ summary }: { summary: InterviewResultSummary }) {
  return (
    <header className="overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-raised)]">
      {/* metadata strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-dashed border-[var(--color-rule-strong)] px-6 py-3 font-mono text-xs text-[var(--color-ink-soft)]">
        <span className="uppercase tracking-wide">{STATUS_LABEL[summary.status] ?? summary.status}</span>
        <span>·</span>
        <span>{summary.mode === "QUICK" ? "Quick interview" : "Custom interview"}</span>
        <span>·</span>
        <span>{DIFFICULTY_LABEL[summary.difficulty] ?? summary.difficulty}</span>
        <span>·</span>
        <span>{TYPE_LABEL[summary.interviewType] ?? summary.interviewType}</span>
        <span className="ml-auto">{formatDate(summary.startedAt)}</span>
      </div>

      <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-5">
          <GradeStamp score={summary.overallScore} size="lg" />
          <div>
            <p className="font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Overall score
            </p>
            <h1 className="max-w-md font-display text-2xl leading-snug text-[var(--color-ink)]">{summary.topic}</h1>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-4 sm:border-l sm:border-[var(--color-rule)] sm:pl-6">
          <Stat label="Average score" value={summary.averageScore === null ? "--" : `${summary.averageScore}/10`} />
          <Stat label="Questions" value={`${summary.questionsAnswered}/${summary.numberOfQuestions}`} />
          <Stat label="Duration" value={formatDuration(summary.durationSeconds)} />
          <Stat
            label="Completed"
            value={summary.completedAt ? formatDate(summary.completedAt) : "--"}
            small
          />
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 font-body text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
        {label}
      </p>
      <p className={`font-mono ${small ? "text-xs" : "text-lg"} text-[var(--color-ink)]`}>{value}</p>
    </div>
  );
}
