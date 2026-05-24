import { createOpenAICompatibleProvider, getOpenAIProviderRuntimeConfig } from "./openai-compatible";
import { getBenchmarkProviderNames } from "./config";

export function getVisionProvider(env: Env) {
  return createOpenAICompatibleProvider(env);
}

export function getProviderSummary(env: Env) {
  const runtimeConfig = getOpenAIProviderRuntimeConfig(env);

  return {
    maxCompletionTokens: runtimeConfig.maxCompletionTokens,
    model: runtimeConfig.model,
    provider: "openai-compatible",
    reasoningEffort: runtimeConfig.reasoningEffort,
    requestTimeoutMs: runtimeConfig.requestTimeoutMs,
    retryCount: runtimeConfig.retryCount,
    retryDelayMs: runtimeConfig.retryDelayMs,
    structuredOutputMode: runtimeConfig.structuredOutputMode,
  };
}

export function getBenchmarkProviderNamesForEnv(env: Env) {
  return getBenchmarkProviderNames(env);
}
