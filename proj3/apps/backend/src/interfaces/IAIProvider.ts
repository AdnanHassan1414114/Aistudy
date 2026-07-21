export interface AICompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** When set, instructs the provider to return valid JSON only. */
  jsonMode?: boolean;
}

export interface AICompletionResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}

export interface AIStreamEvent {
  /** Incremental text delta. Empty string on the final "done" event. */
  delta: string;
  done: boolean;
  /** Only populated on the final event. */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; model: string };
}

/**
 * Abstraction over any LLM provider (OpenAI today, others pluggable
 * later via env configuration). Never call a vendor SDK directly from
 * a service — always go through this interface.
 */
export interface IAIProvider {
  complete(prompt: string, options?: AICompletionOptions): Promise<AICompletionResult>;

  /**
   * Streaming variant used by the chat feature so the frontend can render
   * tokens progressively. Optional so existing providers/tests that only
   * implement `complete` keep compiling; AIService falls back to a
   * simulated single-chunk stream when a provider doesn't implement it.
   */
  streamComplete?(
    prompt: string,
    options: AICompletionOptions | undefined,
    onEvent: (event: AIStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AICompletionResult>;
}
