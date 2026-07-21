const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/** Extracts the 11-character YouTube video ID from any common URL shape. */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    const allowedHosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];
    if (!allowedHosts.includes(parsed.hostname)) return null;

    const match = url.match(YOUTUBE_ID_REGEX);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Normalizes any valid YouTube URL variant into a canonical watch URL. */
export function normalizeYouTubeUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}
