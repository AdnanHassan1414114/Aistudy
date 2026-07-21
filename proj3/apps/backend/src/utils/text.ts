/** Trims and collapses internal whitespace/newlines to single spaces. */
export function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}
