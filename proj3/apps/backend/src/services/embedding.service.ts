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


function createDefaultEmbeddingProvider(): IEmbeddingProvider {
  return env.EMBEDDING_PROVIDER === "gemini" ? new GeminiEmbeddingProvider() : new OpenAIEmbeddingProvider();
}


export class EmbeddingService {
  private provider: IEmbeddingProvider;

constructor(provider: IEmbeddingProvider = createDefaultEmbeddingProvider()) {
    this.provider = provider;
  }

  /** Embeds a single question at query time. */
  async embedQuery(text: string): Promise<EmbeddingResult> {
    return this.withRetry(() => this.provider.embed(text));
  }

  /** Embeds many chunks at indexing time. Batches internally via the provider. */
  async embedChunks(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];
    return this.withRetry(() => this.provider.embedBatch(texts));
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        logger.warn("Embedding request failed", { attempt, maxRetries, error: (err as Error).message });
        if (attempt < maxRetries) await sleep(backoffDelay(attempt));
      }
    }
    logger.error("Embedding request failed after retries", { error: (lastError as Error)?.message });
    throw AppError.internal("Embedding provider request failed after retries.");
  }
}

export const embeddingService = new EmbeddingService();
