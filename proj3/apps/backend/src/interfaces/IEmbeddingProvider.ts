export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

/**
 * Abstraction over any embedding provider (OpenAI today, others pluggable
 * later via env configuration). Never call a vendor SDK directly from a
 * service — always go through this interface, mirroring IAIProvider.
 */
export interface IEmbeddingProvider {
  /** `signal` lets a caller (e.g. a chat request the client disconnected
   *  from) cancel an in-flight embedding call instead of paying for and
   *  waiting on a response nobody will read. */
  embed(text: string, signal?: AbortSignal): Promise<EmbeddingResult>;
  embedBatch(texts: string[], signal?: AbortSignal): Promise<EmbeddingResult[]>;
}