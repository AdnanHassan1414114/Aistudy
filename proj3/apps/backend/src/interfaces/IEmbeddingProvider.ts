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
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}
