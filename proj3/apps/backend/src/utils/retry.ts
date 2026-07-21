export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simple exponential backoff delay calculator (base 500ms). */
export function backoffDelay(attempt: number, baseMs = 500): number {
  return baseMs * 2 ** attempt;
}
