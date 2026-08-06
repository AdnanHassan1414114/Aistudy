import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { AudioDownloadResult, IVideoProvider, VideoMetadata } from "../../interfaces";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/appError";
import { env } from "../../config/env";
import { audioProvider } from "../audio/ffmpegAudioProvider";

const execFileAsync = promisify(execFile);

// yt-dlp/ffmpeg output is plain JSON/logs, well under Node's default 1MB
// exec buffer, but we raise it slightly to be safe for verbose metadata.
const EXEC_MAX_BUFFER = 10 * 1024 * 1024;

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
      const { stdout } = await execFileAsync(
        "yt-dlp",
        ["--dump-json", "--no-playlist", "--skip-download", youtubeUrl],
        { timeout: env.YT_DLP_METADATA_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER }
      );

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

    // Deliberately try wav first (best quality for transcription), then
    // fall back to mp3. Each attempt gets a clean directory first — a
    // partially-written file from a failed attempt (network cut mid
    // download, etc.) must never be left behind for the next attempt or
    // the final file-selection step to accidentally pick up.
    let format: "wav" | "mp3";
    try {
      await this.runYtDlpDownload(outputTemplate, youtubeUrl, "wav", "0");
      format = "wav";
    } catch (wavErr) {
      logger.warn("wav extraction failed, falling back to mp3", { error: (wavErr as Error).message });
      await this.clearPartialDownloads(destinationDir);
      try {
        await this.runYtDlpDownload(outputTemplate, youtubeUrl, "mp3", "5");
        format = "mp3";
      } catch (mp3Err) {
        // Both attempts failed. Log the raw yt-dlp/ffmpeg error (command +
        // stderr) internally for debugging, but never let it reach the
        // caller/job record as-is — it can contain internal command flags
        // and tool-specific stderr that shouldn't be user-facing. Every
        // other failure path in this provider (see fetchMetadata above)
        // follows the same pattern; this was the one gap.
        logger.error("mp3 fallback also failed", { youtubeUrl, error: (mp3Err as Error).message });
        await this.clearPartialDownloads(destinationDir);
        throw AppError.internal(
          "Failed to download audio from this video. It may be private, age-restricted, region-blocked, or unavailable."
        );
      }
    }

    const expectedFile = `audio.${format}`;
    const filePath = path.join(destinationDir, expectedFile);

    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      throw AppError.internal("Audio download completed but output file was not found.");
    }

    if (stat.size === 0) {
      throw AppError.internal("Audio download produced an empty file.");
    }

    // A non-zero file size doesn't guarantee a complete file — the
    // download can be cut off mid-write (timeout, dropped connection,
    // disk full) and still leave a truncated-but-non-empty file behind.
    // ffprobe actually decodes the container/stream, so it catches
    // truncated or corrupt audio that the size check alone would miss.
    // A truncated file typically reports 0/near-0 duration here, which
    // we treat the same as a failed download rather than letting it
    // reach transcription silently.
    let durationSeconds: number;
    try {
      durationSeconds = await audioProvider.getDurationSeconds(filePath);
    } catch (probeErr) {
      logger.error("Downloaded audio failed integrity check", {
        youtubeUrl,
        filePath,
        error: (probeErr as Error).message,
      });
      throw AppError.internal("Audio download produced a corrupted or unreadable file.");
    }

    if (!durationSeconds || durationSeconds <= 0) {
      logger.error("Downloaded audio reported zero/invalid duration — likely truncated", {
        youtubeUrl,
        filePath,
        durationSeconds,
      });
      throw AppError.internal("Audio download appears to be incomplete or truncated.");
    }

    return {
      filePath,
      format,
      sizeBytes: stat.size,
      durationSeconds,
    };
  }

  private async runYtDlpDownload(
    outputTemplate: string,
    youtubeUrl: string,
    audioFormat: "wav" | "mp3",
    audioQuality: string
  ): Promise<void> {
    await execFileAsync(
      "yt-dlp",
      [
        // Audio-only format selector: without this, yt-dlp's default
        // selection is bestvideo+bestaudio (it downloads and muxes the
        // full video stream too), and only THEN the -x postprocessor
        // strips the video track back out. That wastes bandwidth, disk,
        // and worker time downloading a video we always throw away.
        // "bestaudio" tells yt-dlp to fetch only YouTube's audio-only
        // adaptive stream — no video ever hits disk.
        "-f",
        "bestaudio/best",
        "-x", // extract/convert to the target audio format
        "--audio-format",
        audioFormat,
        "--audio-quality",
        audioQuality,
        // Fold what used to be a separate ffmpeg "optimize" pass (mono,
        // 16kHz, loudness-normalized) directly into this same ffmpeg
        // invocation, so the file yt-dlp produces is already the final
        // transcription-ready audio. This avoids reading the full-size
        // audio file back off disk and writing a second full copy of it
        // purely to resample/normalize it.
        "--postprocessor-args",
        "-ac 1 -ar 16000 -af loudnorm",
        "-o",
        outputTemplate,
        "--no-playlist",
        youtubeUrl,
      ],
      { timeout: env.YT_DLP_DOWNLOAD_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER }
    );
  }

  /** Removes any leftover `audio.*` file(s) from a failed prior attempt in
   *  this workspace, so the next attempt/selection can't pick up a
   *  partial/corrupt file by accident. */
  private async clearPartialDownloads(destinationDir: string): Promise<void> {
    const files = await fs.promises.readdir(destinationDir).catch(() => [] as string[]);
    await Promise.all(
      files
        .filter((f) => f.startsWith("audio."))
        .map((f) => fs.promises.rm(path.join(destinationDir, f), { force: true }))
    );
  }
}

function formatUploadDate(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString();
}