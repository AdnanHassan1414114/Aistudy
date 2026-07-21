export function TranscriptViewer({ transcript }: { transcript: string | null }) {
  return (
    <div className="max-h-[32rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper-raised)] p-4 font-body text-[15px] leading-relaxed text-[var(--color-ink)]">
      {transcript ?? "Transcript not available."}
    </div>
  );
}
