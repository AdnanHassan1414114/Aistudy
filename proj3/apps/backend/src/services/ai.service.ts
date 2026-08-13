import { OpenAIProvider, GroqProvider } from "../providers";
import { AICompletionOptions, AICompletionResult, AIStreamEvent, IAIProvider } from "../interfaces";
import { logger } from "../utils/logger";
import { AppError } from "../utils/appError";
import { sleep, backoffDelay } from "../utils/retry";
import { aiUsageLogRepository } from "../repositories";
import { env } from "../config/env";


function createDefaultAIProvider(): IAIProvider {
  return env.AI_PROVIDER === "groq" ? new GroqProvider() : new OpenAIProvider();
}

interface CompleteOptions extends AICompletionOptions {
  maxRetries?: number;
  /** When provided (with `stage`), the call is recorded to AiUsageLog for debugging. */
  jobId?: string;
  stage?: string;
}

/**
 * Every AI request goes through this service: it picks the provider,
 * retries transient failures, and logs which provider/model handled the
 * call. Business logic never talks to OpenAI/Groq directly.
 */
export class AIService {
  private provider: IAIProvider;

  constructor(provider: IAIProvider = createDefaultAIProvider())  {
    this.provider = provider;
  }

  async complete(prompt: string, options: CompleteOptions = {}): Promise<AICompletionResult> {
    const { maxRetries = 2, jobId, stage, ...completionOptions } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.provider.complete(prompt, completionOptions);
        logger.info("AI completion succeeded", { model: result.model, totalTokens: result.totalTokens });

        if (jobId && stage) {
          await this.recordUsage(jobId, stage, result.model);
        }

        return result;
      } catch (err) {
        lastError = err;
        logger.warn("AI completion attempt failed", { attempt, maxRetries, error: (err as Error).message });
        if (attempt < maxRetries) {
          await sleep(backoffDelay(attempt));
        }
      }
    }

    logger.error("AI completion failed after all retries", { error: (lastError as Error)?.message });
    throw AppError.internal("AI provider request failed after retries.");
  }

  /**
   * Streaming variant for chat. Retries once (spec: "If LLM fails, retry
   * once") — only before any tokens have been emitted to the caller,
   * since a partially-streamed response can't be safely retried.
   */
  async streamComplete(
    prompt: string,
    options: CompleteOptions,
    onEvent: (event: AIStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AICompletionResult> {
    const { maxRetries = 1, jobId, stage, ...completionOptions } = options;
    const streamFn = this.provider.streamComplete;

    if (!streamFn) {
      // Fallback for providers without native streaming: emit the whole
      // response as one chunk so callers can treat both paths uniformly.
      const result = await this.complete(prompt, options);
      onEvent({ delta: result.content, done: false });
      onEvent({
        delta: "",
        done: true,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.totalTokens,
          model: result.model,
        },
        finishReason: result.finishReason,
      });
      return result;
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let emittedAny = false;
      try {
        const result = await streamFn.call(
          this.provider,
          prompt,
          completionOptions,
          (event) => {
            if (event.delta) emittedAny = true;
            onEvent(event);
          },
          signal
        );

        if (jobId && stage) {
          await this.recordUsage(jobId, stage, result.model);
        }
        return result;
      } catch (err) {
        lastError = err;
        logger.warn("AI streaming attempt failed", {
          attempt,
          maxRetries,
          emittedAny,
          error: (err as Error).message,
        });
        // Never retry once tokens have already reached the client.
        if (emittedAny || attempt >= maxRetries) break;
        if (signal?.aborted) break; // caller already gone, no point waiting to retry
        // Same jittered backoff `complete()` and the embedding retry
        // logic both already use — this loop was retrying immediately
        // with no pause at all, which is the least effective moment to
        // retry a rate-limit-style failure (the same limit is still very
        // likely in effect a millisecond later).
        await sleep(backoffDelay(attempt));
      }
    }

    logger.error("AI streaming failed after retries", { error: (lastError as Error)?.message });
    throw AppError.internal("AI provider streaming request failed.");
  }

  private async recordUsage(jobId: string, stage: string, model: string): Promise<void> {
    try {
      await aiUsageLogRepository.create({ jobId, stage, provider: env.AI_PROVIDER, model });
    } catch (err) {
      // Usage logging must never break the pipeline.
      logger.warn("Failed to record AI usage log", { jobId, stage, error: (err as Error).message });
    }
  }
}

export const aiService = new AIService();