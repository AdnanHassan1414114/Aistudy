import OpenAI from "openai";
import { env } from "../../config/env";
import { AICompletionOptions, AICompletionResult, AIStreamEvent, IAIProvider } from "../../interfaces";
import { logger } from "../../utils/logger";

/**
 * Concrete IAIProvider backed by Groq's OpenAI-compatible Chat Completions
 * endpoint (https://api.groq.com/openai/v1). Reuses the official `openai`
 * SDK pointed at Groq's base URL, since Groq mirrors OpenAI's request/
 * response shape exactly. Free tier, no card required — used as a
 * drop-in replacement for OpenAIProvider via AI_PROVIDER=groq.
 */
export class GroqProvider implements IAIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
      timeout: env.AI_REQUEST_TIMEOUT_MS,
    });
  }

  async complete(prompt: string, options: AICompletionOptions = {}): Promise<AICompletionResult> {
    const { systemPrompt, temperature = 0.3, maxTokens = 4096, jsonMode = false } = options;

    logger.debug("Groq completion requested", { model: env.GROQ_MODEL, jsonMode });

    const completion = await this.client.chat.completions.create({
      model: env.GROQ_MODEL,
      temperature,
      max_tokens: maxTokens,
      response_format: jsonMode ? { type: "json_object" } : undefined,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        { role: "user" as const, content: prompt },
      ],
    });

    const choice = completion.choices[0];
    const content = choice?.message?.content ?? "";

    return {
      content,
      promptTokens: completion.usage?.prompt_tokens ?? 0,
      completionTokens: completion.usage?.completion_tokens ?? 0,
      totalTokens: completion.usage?.total_tokens ?? 0,
      model: completion.model,
      finishReason: choice?.finish_reason,
    };
  }

  async streamComplete(
    prompt: string,
    options: AICompletionOptions = {},
    onEvent: (event: AIStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AICompletionResult> {
    const { systemPrompt, temperature = 0.3, maxTokens = 4096 } = options;

    logger.debug("Groq streaming completion requested", { model: env.GROQ_MODEL });

    const stream = await this.client.chat.completions.create(
      {
        model: env.GROQ_MODEL,
        temperature,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
          { role: "user" as const, content: prompt },
        ],
      },
      { signal }
    );

    let content = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let model = env.GROQ_MODEL;
    let finishReason: string | undefined;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        onEvent({ delta, done: false });
      }
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      if (chunk.model) model = chunk.model;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        totalTokens = chunk.usage.total_tokens ?? 0;
      }
    }

    const usage = { promptTokens, completionTokens, totalTokens, model };
    onEvent({ delta: "", done: true, usage, finishReason });

    return { content, ...usage, finishReason };
  }
}