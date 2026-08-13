import { env } from "../../config/env";
import { EmbeddingResult, IEmbeddingProvider } from "../../interfaces";
import { logger } from "../../utils/logger";
import { AppError } from "../../utils/appError";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Concrete IEmbeddingProvider backed by Google's free Gemini Embeddings
 * API (text-embedding-004, 768 dimensions). Used when Groq is selected
 * as the chat provider, since Groq has no embedding models of its own.
 * Uses plain fetch — no new SDK dependency needed.
 *
 * IMPORTANT: 768 dimensions != OpenAI's 1536. The `embedding` column in
 * prisma/schema.prisma (KnowledgeChunk model) must match — see
 * EMBEDDING_DIMENSIONS in .env and the corresponding `vector(N)` type.
 */
export class GeminiEmbeddingProvider implements IEmbeddingProvider {
  private apiKey: string;
  private model: string;

  constructor() {
    this.apiKey = env.GEMINI_API_KEY;
    this.model = env.GEMINI_EMBEDDING_MODEL;
  }

  async embed(text: string, signal?: AbortSignal): Promise<EmbeddingResult> {
    const [result] = await this.embedBatch([text], signal);
    return result;
  }

  async embedBatch(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];

    logger.debug("Gemini embedding requested", { model: this.model, count: texts.length });

    const url = `${GEMINI_BASE_URL}/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    // Unlike the OpenAI SDK (constructed with `timeout: AI_REQUEST_TIMEOUT_MS`),
    // this is a raw fetch with no built-in timeout — without one, a stalled
    // Gemini request would hang every retry attempt indefinitely. We also
    // want to honor a caller-provided `signal` (e.g. the client disconnected)
    // so we combine both into a single controller rather than requiring
    // `AbortSignal.any` (Node 20+ only).
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), env.AI_REQUEST_TIMEOUT_MS);
    const onExternalAbort = () => timeoutController.abort();
    signal?.addEventListener("abort", onExternalAbort);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: `models/${this.model}`,
            content: { parts: [{ text }] },
            outputDimensionality: env.EMBEDDING_DIMENSIONS,
          })),
        }),
        signal: timeoutController.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw AppError.internal(`Gemini embedding request failed: ${response.status} ${errBody}`);
      }

      const data = (await response.json()) as { embeddings: { values: number[] }[] };

      return data.embeddings.map((item) => ({
        embedding: item.values,
        model: this.model,
        tokenCount: 0, // Gemini's embed endpoint doesn't return token usage
      }));
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}