export function GradeStamp({
  score,
  size = "md",
}: {
  score: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = {
    sm: "h-12 w-12 text-base",
    md: "h-20 w-20 text-2xl",
    lg: "h-28 w-28 text-4xl",
  }[size];

  return (
    <div className={`grade-stamp ${dims} shrink-0`}>
      <span className="font-mono font-semibold text-[var(--color-stamp)]">
        {score === null ? "--" : score}
      </span>
    </div>
  );
}
