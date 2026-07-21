import OpenAI from "openai";
import { env } from "../../config/env";
import { AICompletionOptions, AICompletionResult, AIStreamEvent, IAIProvider } from "../../interfaces";
import { logger } from "../../utils/logger";

/**
 * Concrete IAIProvider backed by the OpenAI Responses/Chat API. Nothing
 * outside this file should import the `openai` package.
 */
export class OpenAIProvider implements IAIProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: env.AI_REQUEST_TIMEOUT_MS });
  }

  async complete(prompt: string, options: AICompletionOptions = {}): Promise<AICompletionResult> {
    const { systemPrompt, temperature = 0.3, maxTokens = 4096, jsonMode = false } = options;

    logger.debug("OpenAI completion requested", { model: env.OPENAI_MODEL, jsonMode });

    const completion = await this.client.chat.completions.create({
      model: env.OPENAI_MODEL,
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
    };
  }

  async streamComplete(
    prompt: string,
    options: AICompletionOptions = {},
    onEvent: (event: AIStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<AICompletionResult> {
    const { systemPrompt, temperature = 0.3, maxTokens = 4096 } = options;

    logger.debug("OpenAI streaming completion requested", { model: env.OPENAI_MODEL });

    const stream = await this.client.chat.completions.create(
      {
        model: env.OPENAI_MODEL,
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
    let model = env.OPENAI_MODEL;

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        content += delta;
        onEvent({ delta, done: false });
      }
      if (chunk.model) model = chunk.model;
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? 0;
        completionTokens = chunk.usage.completion_tokens ?? 0;
        totalTokens = chunk.usage.total_tokens ?? 0;
      }
    }

    const usage = { promptTokens, completionTokens, totalTokens, model };
    onEvent({ delta: "", done: true, usage });

    return { content, ...usage };
  }
}
