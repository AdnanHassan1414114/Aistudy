import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { env } from "../../config/env";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/appError";

const execFileAsync = promisify(execFile);

export interface AudioChunk {
  filePath: string;
  startSeconds: number;
  endSeconds: number;
  index: number;
}

/**
 * Concrete wrapper around the FFmpeg/ffprobe CLIs. Nothing outside this
 * file should shell out to ffmpeg directly.
 */
export class FfmpegAudioProvider {
  /** Converts to mono, normalizes volume, and reduces bitrate for smaller/cheaper uploads. */
  async optimize(inputPath: string, outputDir: string): Promise<string> {
    const outputPath = path.join(outputDir, "optimized.wav");

    await execFileAsync("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1", // mono
      "-ar",
      "16000", // 16kHz is sufficient for speech and keeps files small
      "-af",
      "loudnorm", // normalize volume
      outputPath,
    ]);

    logger.debug("Audio optimized", { inputPath, outputPath });
    return outputPath;
  }

  async getDurationSeconds(filePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ]);
      return parseFloat(stdout.trim());
    } catch (err) {
      logger.error("ffprobe failed", { filePath, error: (err as Error).message });
      throw AppError.internal("Failed to inspect audio file.");
    }
  }

  async getFileSizeMB(filePath: string): Promise<number> {
    const stat = await fs.promises.stat(filePath);
    return stat.size / (1024 * 1024);
  }

  /**
   * splits audio into chunks bounded by AUDIO_CHUNK_TARGET_MB,
   * with a configurable overlap between consecutive chunks to avoid losing
   * sentences at chunk boundaries. The result is validated (exists,
   * ordered, correctly overlapping, non-empty); if validation fails the
   * chunks are regenerated once before giving up.
   */
  async splitIntoChunks(filePath: string, outputDir: string): Promise<AudioChunk[]> {
    let chunks = await this.generateChunks(filePath, outputDir);
    let validation = await this.validateChunks(chunks);

    if (!validation.valid) {
      logger.warn("Audio chunk validation failed, regenerating once", { errors: validation.errors });
      await fs.promises.rm(outputDir, { recursive: true, force: true });
      chunks = await this.generateChunks(filePath, outputDir);
      validation = await this.validateChunks(chunks);
    }

    if (!validation.valid) {
      throw AppError.internal(`Audio chunk validation failed after regeneration: ${validation.errors.join("; ")}`);
    }

    return chunks;
  }

  private async generateChunks(filePath: string, outputDir: string): Promise<AudioChunk[]> {
    const durationSeconds = await this.getDurationSeconds(filePath);
    const fileSizeMB = await this.getFileSizeMB(filePath);

    if (fileSizeMB <= env.AUDIO_CHUNK_TARGET_MB) {
      return [{ filePath, startSeconds: 0, endSeconds: durationSeconds, index: 0 }];
    }

    const numChunks = Math.ceil(fileSizeMB / env.AUDIO_CHUNK_TARGET_MB);
    const rawChunkLength = durationSeconds / numChunks;
    const overlap = env.AUDIO_CHUNK_OVERLAP_SECONDS;
    // -c copy below stream-copies whatever codec is already in the source
    // file (wav or mp3, depending on which format the download stage
    // ended up producing) without re-encoding. The chunk's extension must
    // match that source codec/container, not be hardcoded — muxing mp3
    // audio into a file copied as .wav (or vice versa) is a container
    // mismatch that ffmpeg will reject or mishandle.
    const sourceExt = path.extname(filePath) || ".wav";

    await fs.promises.mkdir(outputDir, { recursive: true });

    const chunks: AudioChunk[] = [];
    for (let i = 0; i < numChunks; i++) {
      const start = Math.max(0, i * rawChunkLength - (i > 0 ? overlap : 0));
      const end = Math.min(durationSeconds, (i + 1) * rawChunkLength + overlap);
      const chunkPath = path.join(outputDir, `chunk-${i}${sourceExt}`);

      try {
        await execFileAsync("ffmpeg", [
          "-y",
          "-i",
          filePath,
          "-ss",
          start.toFixed(2),
          "-to",
          end.toFixed(2),
          "-c",
          "copy",
          chunkPath,
        ]);
      } catch (err) {
        logger.error("ffmpeg failed while cutting audio chunk", {
          filePath,
          chunkIndex: i,
          start,
          end,
          error: (err as Error).message,
        });
        throw AppError.internal("Failed to split audio into chunks.");
      }

      chunks.push({ filePath: chunkPath, startSeconds: start, endSeconds: end, index: i });
    }

    logger.debug("Audio split into chunks", { numChunks, durationSeconds });
    return chunks;
  }

  /** verifies chunks exist on disk, are ordered, overlap correctly, and are non-empty. */
  private async validateChunks(chunks: AudioChunk[]): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (chunks.length === 0) {
      return { valid: false, errors: ["No chunks were produced."] };
    }

    for (const chunk of chunks) {
      const exists = await fs.promises
        .access(chunk.filePath, fs.constants.R_OK)
        .then(() => true)
        .catch(() => false);
      if (!exists) {
        errors.push(`Chunk ${chunk.index} file is missing: ${chunk.filePath}`);
        continue;
      }
      const stat = await fs.promises.stat(chunk.filePath);
      if (stat.size === 0) {
        errors.push(`Chunk ${chunk.index} is empty.`);
      }
    }

    const sortedByIndex = [...chunks].sort((a, b) => a.index - b.index);
    const isOrdered = chunks.every((c, i) => c.index === sortedByIndex[i].index);
    if (!isOrdered) {
      errors.push("Chunks are not in the expected order.");
    }

    for (let i = 1; i < sortedByIndex.length; i++) {
      const prev = sortedByIndex[i - 1];
      const curr = sortedByIndex[i];
      const overlaps = curr.startSeconds < prev.endSeconds;
      if (!overlaps) {
        errors.push(`Chunk ${curr.index} does not overlap with chunk ${prev.index} (possible sentence loss).`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

export const audioProvider = new FfmpegAudioProvider();