import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { AudioDownloadResult, IVideoProvider, VideoMetadata } from "../../interfaces";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/appError";

const execFileAsync = promisify(execFile);

interface YtDlpMetadataJson {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  channel_url?: string;
  thumbnail?: string;
  description?: string;
  duration?: number;
  upload_date?: string; // YYYYMMDD
  language?: string;
}

/**
 * Concrete IVideoProvider backed by the yt-dlp CLI. Nothing outside this
 * file should shell out to yt-dlp directly.
 */
export class YtDlpVideoProvider implements IVideoProvider {
  async fetchMetadata(youtubeUrl: string): Promise<VideoMetadata> {
    try {
      const { stdout } = await execFileAsync("yt-dlp", [
        "--dump-json",
        "--no-playlist",
        "--skip-download",
        youtubeUrl,
      ]);

      const raw = JSON.parse(stdout) as YtDlpMetadataJson;

      return {
        videoId: raw.id,
        title: raw.title,
        channelName: raw.channel ?? raw.uploader ?? null,
        channelUrl: raw.channel_url ?? null,
        thumbnail: raw.thumbnail ?? null,
        description: raw.description ?? null,
        durationSeconds: raw.duration ?? null,
        publishedAt: raw.upload_date ? formatUploadDate(raw.upload_date) : null,
        language: raw.language ?? null,
      };
    } catch (err) {
      logger.error("yt-dlp metadata extraction failed", { youtubeUrl, error: (err as Error).message });
      throw AppError.badRequest("Failed to extract video metadata. The URL may be invalid or unavailable.");
    }
  }

  async downloadAudio(youtubeUrl: string, destinationDir: string): Promise<AudioDownloadResult> {
    await fs.promises.mkdir(destinationDir, { recursive: true });
    const outputTemplate = path.join(destinationDir, "audio.%(ext)s");

    try {
      await execFileAsync("yt-dlp", [
        "-x", // audio only, never video
        "--audio-format",
        "wav",
        "--audio-quality",
        "0",
        "--postprocessor-args",
        "-ac 1", // mono
        "-o",
        outputTemplate,
        "--no-playlist",
        youtubeUrl,
      ]);
    } catch (wavErr) {
      logger.warn("wav extraction failed, falling back to mp3", { error: (wavErr as Error).message });
      await execFileAsync("yt-dlp", [
        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "5",
        "--postprocessor-args",
        "-ac 1",
        "-o",
        outputTemplate,
        "--no-playlist",
        youtubeUrl,
      ]);
    }

    const files = await fs.promises.readdir(destinationDir);
    const audioFile = files.find((f) => f.startsWith("audio."));
    if (!audioFile) {
      throw AppError.internal("Audio download completed but output file was not found.");
    }

    const filePath = path.join(destinationDir, audioFile);
    const stat = await fs.promises.stat(filePath);
    const format = audioFile.endsWith(".mp3") ? "mp3" : "wav";

    return {
      filePath,
      format,
      sizeBytes: stat.size,
      durationSeconds: 0, // populated by AudioProvider after inspection
    };
  }
}

function formatUploadDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}
