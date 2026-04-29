import { createOpenAICompatibleProvider } from "./openai-compatible";
import { getBenchmarkProviderNames } from "./config";

export function getVisionProvider(env: Env) {
  return createOpenAICompatibleProvider(env);
}

export function getProviderSummary(env: Env) {
  return {
    model: env.OPENAI_MODEL || "gpt-4.1",
    provider: "openai-compatible",
  };
}

export function getBenchmarkProviderNamesForEnv(env: Env) {
  return getBenchmarkProviderNames(env);
}
