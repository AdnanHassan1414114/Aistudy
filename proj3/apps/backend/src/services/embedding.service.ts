import { OpenAIEmbeddingProvider, GeminiEmbeddingProvider } from "../providers";
import { EmbeddingResult, IEmbeddingProvider } from "../interfaces";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { sleep, backoffDelay } from "../utils/retry";
import { env } from "../config/env";

/**
 * Every embedding request goes through this service — question embeddings
 * (chat) and chunk embeddings (indexing) alike — so there is exactly one
 * place that knows which provider/model is active. Mirrors AIService's
 * shape so future embedding providers can be swapped in via env config
 * without touching callers.
 */


// Conservative caps, deliberately well under any embedding provider's
// documented per-request limits (both item count and total size) — exact
// vendor limits vary by model and can change, so this stays conservative
// rather than pinned to one provider's current published numbers.
//
// Without this, a long document's chunks were all sent in a single
// request. If that ever exceeded a provider's hard per-request limit, the
// whole document failed to index — and since exceeding a hard limit isn't
// a transient problem, the existing retry logic would retry the exact
// same oversized request twice more, fail identically each time, and then
// give up on the entire document with zero chunks indexed.
const MAX_ITEMS_PER_EMBED_BATCH = 100;
const MAX_CHARS_PER_EMBED_BATCH = 100_000;

/** Splits texts into request-sized batches, bounded by both item count and
 *  total character length, while preserving order across batches. */
function splitIntoEmbeddingBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;

  for (const text of texts) {
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= MAX_ITEMS_PER_EMBED_BATCH || currentChars + text.length > MAX_CHARS_PER_EMBED_BATCH);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) batches.push(current);

  return batches;
}

function createDefaultEmbeddingProvider(): IEmbeddingProvider {
  return env.EMBEDDING_PROVIDER === "gemini" ? new GeminiEmbeddingProvider() : new OpenAIEmbeddingProvider();
}


export class EmbeddingService {
  private provider: IEmbeddingProvider;

constructor(provider: IEmbeddingProvider = createDefaultEmbeddingProvider()) {
    this.provider = provider;
  }

  /** Embeds a single question at query time. `signal` cancels the request
   *  (and skips further retries) if the caller no longer needs the result —
   *  e.g. the chat client disconnected mid-request. */
  async embedQuery(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
    return this.withRetry(() => this.provider.embed(text, signal), 2, signal);
  }

  /** Embeds many chunks at indexing time. Splits into provider-safe
   *  batches (see splitIntoEmbeddingBatches) and processes them
   *  sequentially — one oversized/failed batch no longer takes the whole
   *  document down with it, and results stay in the original chunk order
   *  so callers can zip them back up against their chunk list by index. */
  async embedChunks(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    const batches = splitIntoEmbeddingBatches(texts);
    const results: EmbeddingResult[] = [];
    for (const batch of batches) {
      const batchResults = await this.withRetry(() => this.provider.embedBatch(batch));
      results.push(...batchResults);
    }
    return results;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        // A caller-initiated cancellation isn't a provider failure — don't
        // retry it (nothing to gain, the caller already stopped listening)
        // and don't wrap it in a generic "failed after retries" AppError,
        // which would misreport a cancellation as a real outage upstream.
        if (signal?.aborted) throw err;
        logger.warn("Embedding request failed", { attempt, maxRetries, error: (err as Error).message });
        if (attempt < maxRetries) await sleep(backoffDelay(attempt));
      }
    }
    logger.error("Embedding request failed after retries", { error: (lastError as Error)?.message });
    throw AppError.internal("Embedding provider request failed after retries.");
  }
}

export const embeddingService = new EmbeddingService();