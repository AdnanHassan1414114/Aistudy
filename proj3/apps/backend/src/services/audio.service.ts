import path from "path";
import fs from "fs";
import { env } from "../config/env";
import { YtDlpVideoProvider, audioProvider, AudioChunk } from "../providers";
import { logger } from "../utils/logger";

export class AudioService {
  private videoProvider = new YtDlpVideoProvider();

  /** Creates an isolated temp working directory for one processing job. */
  async createJobWorkspace(jobId: string): Promise<{ root: string; chunks: string; output: string }> {
    const root = path.join(env.TEMP_STORAGE_DIR, jobId);
    const chunks = path.join(root, "chunks");
    const output = path.join(root, "output");
    await fs.promises.mkdir(chunks, { recursive: true });
    await fs.promises.mkdir(output, { recursive: true });
    return { root, chunks, output };
  }

  async downloadAudio(youtubeUrl: string, workspaceRoot: string) {
    return this.videoProvider.downloadAudio(youtubeUrl, workspaceRoot);
  }

  /**
   * No longer called from the main pipeline — downloadAudio() now asks
   * yt-dlp to apply mono/16kHz/loudnorm in the same pass as extraction,
   * so there's nothing left to optimize by the time we get a file back.
   * Kept available for callers that feed in audio from somewhere other
   * than YtDlpVideoProvider (e.g. a future direct-upload flow) and still
   * need it normalized before transcription.
   */
  async optimize(inputPath: string, workspaceRoot: string): Promise<string> {
    return audioProvider.optimize(inputPath, workspaceRoot);
  }

  async splitIfNecessary(optimizedPath: string, chunksDir: string): Promise<AudioChunk[]> {
    return audioProvider.splitIntoChunks(optimizedPath, chunksDir);
  }

  /** Deletes the entire per-job temp directory. Always called, success or failure. */
  async cleanup(workspaceRoot: string): Promise<void> {
    try {
      await fs.promises.rm(workspaceRoot, { recursive: true, force: true });
      logger.debug("Temp workspace cleaned up", { workspaceRoot });
    } catch (err) {
      logger.warn("Failed to clean up temp workspace", {
        workspaceRoot,
        error: (err as Error).message,
      });
    }
  }
}

export const audioService = new AudioService();