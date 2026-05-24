import { jsonResponse } from "../lib/http";
import { getPromptVersion } from "../lib/prompts";
import { getBenchmarkProviderNamesForEnv, getProviderSummary } from "../providers";

export function handleHealth(request: Request, env: Env, requestId: string) {
  const providerSummary = getProviderSummary(env);

  return jsonResponse(request, env, {
    benchmarkProviders:
      env.ENVIRONMENT === "production" ? undefined : getBenchmarkProviderNamesForEnv(env),
    defaultMaxCompletionTokens: providerSummary.maxCompletionTokens,
    defaultModel: providerSummary.model,
    defaultProvider: providerSummary.provider,
    defaultReasoningEffort: providerSummary.reasoningEffort,
    defaultRequestTimeoutMs: providerSummary.requestTimeoutMs,
    defaultRetryCount: providerSummary.retryCount,
    defaultRetryDelayMs: providerSummary.retryDelayMs,
    environment: env.ENVIRONMENT || "development",
    ok: true,
    promptVersion: getPromptVersion(env),
    requestId,
    service: "guidepup-api",
    structuredOutputMode: providerSummary.structuredOutputMode,
  });
}
