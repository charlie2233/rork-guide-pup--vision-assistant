import { buildVisionSystemPrompt, buildVisionUserPrompt, ProviderVisionJsonSchema } from "../lib/prompts";
import { logWarn } from "../lib/logging";
import { enforceProviderCallLimit } from "../lib/rate-limit";
import { ProviderVisionSchema } from "../schemas/vision";
import { getOpenAIProviderAttempts } from "./config";
import type { ProviderInput, ProviderResult, ProviderTokenUsage, VisionProvider } from "./types";

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      refusal?: string;
    };
  }>;
  model?: string;
  usage?: {
    completion_tokens?: number;
    prompt_tokens?: number;
    total_tokens?: number;
  };
};

const STRUCTURED_OUTPUT_MODE = "json_schema_strict";
const DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS = 8_500;
const MAX_PROVIDER_REQUEST_TIMEOUT_MS = 9_000;
const MAX_PROVIDER_OUTBOUND_CALLS = 3;

class ProviderHttpError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ProviderHttpError";
    this.retryable = retryable;
  }
}

class ProviderCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCapacityError";
  }
}

function getModel(env: Env) {
  return env.OPENAI_MODEL || "gpt-5.6-sol";
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
    maxOutboundCalls: MAX_PROVIDER_OUTBOUND_CALLS,
    model,
    reasoningEffort: getReasoningEffort(env, model),
    requestTimeoutMs: parseBoundedInteger(
      readRuntimeEnv(env, "OPENAI_REQUEST_TIMEOUT_MS"),
      DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS,
      3000,
      MAX_PROVIDER_REQUEST_TIMEOUT_MS,
    ),
    retryCount: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_RETRY_COUNT"), 1, 0, 2),
    retryDelayMs: parseBoundedInteger(readRuntimeEnv(env, "OPENAI_RETRY_DELAY_MS"), 250, 0, 2000),
    structuredOutputMode: STRUCTURED_OUTPUT_MODE,
  };
}

function buildOpenAIResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "guidepup_navigation_vision",
      strict: true,
      schema: ProviderVisionJsonSchema,
    },
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

function sanitizeMetadataIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(trimmed)
    ? trimmed
    : undefined;
}

function boundedTokenCount(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? Math.min(value, 1_000_000)
    : undefined;
}

function extractTokenUsage(usage: OpenAIChatCompletionResponse["usage"]): ProviderTokenUsage | undefined {
  if (!usage) {
    return undefined;
  }
  const bounded: ProviderTokenUsage = {
    inputTokens: boundedTokenCount(usage.prompt_tokens),
    outputTokens: boundedTokenCount(usage.completion_tokens),
    totalTokens: boundedTokenCount(usage.total_tokens),
  };
  return Object.values(bounded).some((value) => value !== undefined) ? bounded : undefined;
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

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    let payload: OpenAIChatCompletionResponse | undefined;
    if (response.ok) {
      try {
        payload = (await response.json()) as OpenAIChatCompletionResponse;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        throw new Error("Provider returned invalid JSON.");
      }
    }
    return { payload, response };
  } finally {
    clearTimeout(timeout);
  }
}

type ProviderRequestBudget = {
  deadlineAt: number;
  maxOutboundCalls: number;
  outboundCalls: number;
};

function remainingBudgetMs(budget: ProviderRequestBudget) {
  return Math.max(0, budget.deadlineAt - Date.now());
}

function hasOutboundBudget(budget: ProviderRequestBudget) {
  return budget.outboundCalls < budget.maxOutboundCalls && remainingBudgetMs(budget) > 0;
}

function claimOutboundCall(budget: ProviderRequestBudget) {
  const timeoutMs = remainingBudgetMs(budget);
  if (budget.outboundCalls >= budget.maxOutboundCalls) {
    throw new Error("Provider outbound call budget exhausted.");
  }
  if (timeoutMs <= 0) {
    throw new Error("Provider request deadline exhausted.");
  }

  budget.outboundCalls += 1;
  return timeoutMs;
}

async function analyzeWithAttempt(
  input: ProviderInput,
  attempt: ReturnType<typeof getOpenAIProviderAttempts>[number],
  runtimeConfig: ReturnType<typeof getOpenAIProviderRuntimeConfig>,
  budget: ProviderRequestBudget,
  env: Env,
) {
  const startedAt = Date.now();
  const maxAttempts = runtimeConfig.retryCount + 1;
  let lastError: unknown;

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    try {
      const timeoutMs = claimOutboundCall(budget);
      const globalCallLimit = await enforceProviderCallLimit(env);
      if (!globalCallLimit.allowed) {
        const reason = globalCallLimit.reason === "infrastructure-unavailable"
          ? "Provider call safety control is unavailable."
          : "Provider call budget is exhausted.";
        throw new ProviderCapacityError(reason);
      }
      const { payload, response } = await fetchJsonWithTimeout(`${attempt.baseUrl}${attempt.path}`, {
        method: "POST",
        headers: {
          [attempt.authHeader]: `${attempt.authPrefix}${attempt.apiKey}`.trim(),
          "content-type": "application/json",
          "x-client-request-id": input.requestId,
        },
        body: JSON.stringify({
          model: runtimeConfig.model,
          store: false,
          response_format: buildOpenAIResponseFormat(),
          max_completion_tokens: runtimeConfig.maxCompletionTokens,
          ...(runtimeConfig.reasoningEffort ? { reasoning_effort: runtimeConfig.reasoningEffort } : {}),
          messages: [
            {
              role: "system",
              content: buildVisionSystemPrompt(input.promptVersion, input.interactionMode),
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
      }, timeoutMs);

      if (!response.ok) {
        throw new ProviderHttpError(`${attempt.name} failed (${response.status}).`, isRetryableStatus(response.status));
      }

      if (!payload) {
        throw new Error(`${attempt.name} returned an empty provider response.`);
      }
      const message = payload.choices?.[0]?.message;
      if (message?.refusal) {
        throw new Error("Provider refused vision analysis.");
      }
      const text = extractTextContent(message?.content);
      let parsed: ReturnType<typeof ProviderVisionSchema.parse>;
      try {
        parsed = ProviderVisionSchema.parse(JSON.parse(text.trim()));
      } catch {
        throw new Error("Provider returned an invalid structured response.");
      }

      return {
        latencyMs: Date.now() - startedAt,
        model: sanitizeMetadataIdentifier(payload.model) || runtimeConfig.model,
        parsed,
        transport: attempt.name,
        upstreamRequestId: sanitizeMetadataIdentifier(response.headers.get("x-request-id")),
        usage: extractTokenUsage(payload.usage),
      } satisfies Omit<ProviderResult, "provider">;
    } catch (error) {
      lastError = error;
      if (
        attemptIndex >= maxAttempts - 1 ||
        !isRetryableProviderError(error) ||
        !hasOutboundBudget(budget)
      ) {
        throw error;
      }

      logWarn("vision.provider_attempt_retry", {
        attempt: attempt.name,
        attemptIndex: attemptIndex + 1,
        message: error instanceof Error ? error.message : String(error),
        outboundCalls: budget.outboundCalls,
        provider: "openai-compatible",
        remainingBudgetMs: remainingBudgetMs(budget),
        requestId: input.requestId,
      });
      const retryDelayMs = Math.min(runtimeConfig.retryDelayMs, Math.max(remainingBudgetMs(budget) - 1, 0));
      await sleep(retryDelayMs);
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
    const budget: ProviderRequestBudget = {
      deadlineAt: Date.now() + runtimeConfig.requestTimeoutMs,
      maxOutboundCalls: runtimeConfig.maxOutboundCalls,
      outboundCalls: 0,
    };
    let lastError: unknown;

    for (const attempt of attempts) {
      if (!hasOutboundBudget(budget)) {
        break;
      }

      try {
        const result = await analyzeWithAttempt(input, attempt, runtimeConfig, budget, env);
        return {
          ...result,
          provider: this.name,
        };
      } catch (error) {
        if (error instanceof ProviderCapacityError) {
          throw error;
        }
        logWarn("vision.provider_attempt_failed", {
          attempt: attempt.name,
          message: error instanceof Error ? error.message : String(error),
          outboundCalls: budget.outboundCalls,
          provider: this.name,
          remainingBudgetMs: remainingBudgetMs(budget),
          requestId: input.requestId,
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
