import OpenAI from "openai";
import { env } from "../../config/env";
import { EmbeddingResult, IEmbeddingProvider } from "../../interfaces";
import { logger } from "../../utils/logger";

/**
 * Concrete IEmbeddingProvider backed by the OpenAI Embeddings API. Nothing
 * outside this file should import the `openai` package for embeddings.
 */
export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.AI_REQUEST_TIMEOUT_MS });
  }

  async embed(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text], signal);
    return result;
  }

  async embedBatch(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    logger.debug("OpenAI embedding requested", { model: env.EMBEDDING_MODEL, count: texts.length });

    const response = await this.client.embeddings.create(
      {
        model: env.EMBEDDING_MODEL,
        input: texts,
        dimensions: env.EMBEDDING_DIMENSIONS,
      },
      { signal }
    );

    const totalTokens = response.usage?.total_tokens ?? 0;
    const perItemTokens = Math.ceil(totalTokens / Math.max(texts.length, 1));

    return response.data
      .sort((a, b) => a.index - b.index)
      .map((item) => ({
        embedding: item.embedding,
        model: response.model,
        tokenCount: perItemTokens,
      }));
  }
}