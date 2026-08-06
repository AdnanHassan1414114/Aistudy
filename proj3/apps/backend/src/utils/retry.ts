export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff delay with jitter (base 500ms).
 * Jitter matters here specifically because callers retrying in parallel
 * (e.g. multiple audio chunks transcribed concurrently) would otherwise
 * all fail at once, compute the exact same delay, and retry in lockstep —
 * hitting the same rate limit again together instead of spreading out.
 * Full jitter: a random delay between 0 and the exponential ceiling.
 */
export function backoffDelay(attempt: number, baseMs = 500): number {
  const ceiling = baseMs * 2 ** attempt;
  return Math.random() * ceiling;
}