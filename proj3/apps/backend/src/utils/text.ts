/** Trims and collapses internal whitespace/newlines to single spaces. */
export function normalizeWhitespace(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/**
 * Truncates to at most `maxLength` Unicode codepoints, not UTF-16 code
 * units. A plain `str.slice(0, n)` can land in the middle of a surrogate
 * pair (emoji, some CJK/astral characters) and produce a broken glyph —
 * `Array.from` splits on codepoints instead, so the cut is always clean.
 */
export function truncateText(input: string, maxLength: number): string {
  const chars = Array.from(input);
  return chars.length <= maxLength ? input : chars.slice(0, maxLength).join("");
}