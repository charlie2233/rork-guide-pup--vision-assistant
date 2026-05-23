import { buildVisionSystemPrompt, buildVisionUserPrompt, ProviderVisionJsonSchema } from "../lib/prompts";
import { logWarn, sanitizeLogMessage } from "../lib/logging";
import { ProviderVisionSchema } from "../schemas/vision";
import { getOpenAIProviderAttempts } from "./config";
import type { ProviderInput, ProviderResult, VisionProvider } from "./types";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      refusal?: string;
    };
  }>;
  model?: string;
};

class ProviderHttpError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderHttpError";
    this.retryable = retryable;
  }
}

function getModel(env: Env) {
  return env.OPENAI_MODEL || "gpt-5.5";
}

function getReasoningEffort(env: Env, model: string) {
  if (!model.startsWith("gpt-5")) {
    return undefined;
  }

  return env.OPENAI_REASONING_EFFORT || "low";
}

function readRuntimeEnv(env: Env, key: string) {
  return (env as unknown as Record<string, string | undefined>)[key]?.trim();
}

function parseBoundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export function getOpenAIProviderRuntimeConfig(env: Env) {
  const model = getModel(env);
  return {
    maxCompletionTokens: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_MAX_COMPLETION_TOKENS"), 700, 128, 1200),
    model,
    reasoningEffort: getReasoningEffort(env, model),
    requestTimeoutMs: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_REQUEST_TIMEOUT_MS"), 12000, 3000, 30000),
    retryCount: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_RETRY_COUNT"), 1, 0, 2),
    retryDelayMs: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_RETRY_DELAY_MS"), 250, 0, 2000),
  };
}

function extractTextContent(content: string | Array<{ text?: string; type?: string }> | undefined) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((item) => item.text || "").join("\n");
  }

  return "";
}

function extractJsonObject(text: string) {
  const stripped = text.replace(/```json|```/gi, "").trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Provider did not return a JSON object.");
  }

  return stripped.slice(firstBrace, lastBrace + 1);
}

function sleep(ms: number) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableProviderError(error: unknown) {
  if (error instanceof ProviderHttpError) {
    return error.retryable;
  }

  return error instanceof Error && error.name === "AbortError";
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function analyzeWithAttempt(
  input: ProviderInput,
  attempt: ReturnType<typeof getOpenAIProviderAttempts>[number],
  runtimeConfig: ReturnType<typeof getOpenAIProviderRuntimeConfig>,
) {
  const startedAt = Date.now();
  const maxAttempts = runtimeConfig.retryCount + 1;
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      const response = await fetchWithTimeout(`${attempt.baseUrl}${attempt.path}`, {
        method: "POST",
        headers: {
          [attempt.authHeader]: `${attempt.authPrefix}${attempt.apiKey}`.trim(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: runtimeConfig.model,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "guidepup_navigation_vision",
              strict: true,
              schema: ProviderVisionJsonSchema,
            },
          },
          max_completion_tokens: runtimeConfig.maxCompletionTokens,
          ...(runtimeConfig.reasoningEffort ? { reasoning_effort: runtimeConfig.reasoningEffort } : {}),
          messages: [
            {
              role: "system",
              content: buildVisionSystemPrompt(input.promptVersion),
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: buildVisionUserPrompt(input),
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${input.mimeType};base64,${input.imageBase64}`,
                    detail: input.detail,
                  },
                },
              ],
            },
          ],
        }),
      }, runtimeConfig.requestTimeoutMs);

      if (!response.ok) {
        throw new ProviderHttpError(`${attempt.name} failed (${response.status}).`, isRetryableStatus(response.status));
      }

      const payload = (await response.json()) as OpenAIChatCompletionResponse;
      const message = payload.choices?.[0]?.message;
      if (message?.refusal) {
        throw new Error(`Provider refused vision analysis: ${sanitizeLogMessage(message.refusal, 160)}`);
      }
      const text = extractTextContent(message?.content);
      const parsed = ProviderVisionSchema.parse(JSON.parse(extractJsonObject(text)));

      return {
        latencyMs: Date.now() - startedAt,
        model: payload.model || runtimeConfig.model,
        parsed,
        rawText: text,
        transport: attempt.name,
      } satisfies Omit<ProviderResult, "provider">;
    } catch (error) {
      lastError = error;
      if (attemptIndex >= maxAttempts - 1 || !isRetryableProviderError(error)) {
        throw error;
      }

      logWarn("vision.provider_attempt_retry", {
        attempt: attempt.name,
        attemptIndex: attemptIndex + 1,
        message: error instanceof Error ? error.message : String(error),
        provider: "openai-compatible",
      });
      await sleep(runtimeConfig.retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${attempt.name} failed after retries.`);
}

export class OpenAICompatibleProvider implements VisionProvider {
  readonly name = "openai-compatible";
  readonly model: string;

  constructor(model: string) {
    this.model = model;
  }

  async analyze(input: ProviderInput, env: Env): Promise<ProviderResult> {
    const attempts = getOpenAIProviderAttempts(env);
    const runtimeConfig = getOpenAIProviderRuntimeConfig(env);
    let lastError: unknown;

    for (const attempt of attempts) {
      try {
        const result = await analyzeWithAttempt(input, attempt, runtimeConfig);
        return {
          ...result,
          provider: this.name,
        };
      } catch (error) {
        logWarn("vision.provider_attempt_failed", {
          attempt: attempt.name,
          message: error instanceof Error ? error.message : String(error),
          provider: this.name,
        });
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("OpenAI-compatible provider failed without a typed error.");
  }
}

export function createOpenAICompatibleProvider(env: Env) {
  return new OpenAICompatibleProvider(getModel(env));
}
