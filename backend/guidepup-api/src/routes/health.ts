import { jsonResponse } from "../lib/http";
import { getPromptVersion } from "../lib/prompts";
import { getBenchmarkProviderNamesForEnv, getProviderSummary } from "../providers";

export function handleHealth(request: Request, env: Env, requestId: string) {
  return jsonResponse(request, env, {
    benchmarkProviders:
      env.ENVIRONMENT === "production" ? undefined : getBenchmarkProviderNamesForEnv(env),
    defaultProvider: getProviderSummary(env),
    environment: env.ENVIRONMENT || "development",
    ok: true,
    promptVersion: getPromptVersion(env),
    requestId,
    service: "guidepup-api",
  });
}
