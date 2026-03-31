import { jsonResponse } from "../lib/http";
import { getPromptVersion } from "../lib/prompts";
import { getProviderSummary } from "../providers";

export function handleHealth(env: Env, requestId: string) {
  return jsonResponse(env, {
    defaultProvider: getProviderSummary(env),
    environment: env.ENVIRONMENT || "development",
    ok: true,
    promptVersion: getPromptVersion(env),
    requestId,
    service: "guidepup-api",
  });
}
