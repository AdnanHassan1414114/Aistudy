export interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string | null;
  channelUrl: string | null;
  thumbnail: string | null;
  description: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  language: string | null;
}

export interface AudioDownloadResult {
  filePath: string;
  format: "wav" | "mp3";
  sizeBytes: number;
  durationSeconds: number;
}

/**
 * Abstraction over video-platform interaction (yt-dlp today). Keeps
 * controllers/services from ever shelling out to yt-dlp directly.
 */
export interface IVideoProvider {
  fetchMetadata(youtubeUrl: string): Promise<VideoMetadata>;
  downloadAudio(youtubeUrl: string, destinationDir: string): Promise<AudioDownloadResult>;
}
