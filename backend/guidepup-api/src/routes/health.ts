import { jsonResponse } from "../lib/http";
import { getPromptVersion } from "../lib/prompts";
import { getRateLimitCaps } from "../lib/rate-limit";
import { getSessionTtlSeconds } from "../lib/session";
import { getBenchmarkProviderNamesForEnv, getProviderSummary } from "../providers";

const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const WORKER_VERSION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getRuntimeDeploymentIdentity(request: Request, env: Env) {
  const apiUrl = new URL(request.url).origin;
  const environment = env.ENVIRONMENT || "development";
  const expectedApiUrl = env.EXPECTED_API_URL?.trim() || apiUrl;
  const sourceRevision = env.SOURCE_REVISION?.trim() || "development";
  const workerIdentity = env.WORKER_IDENTITY?.trim() || "guidepup-api";
  const workerVersionId = env.CF_VERSION_METADATA?.id?.trim() || "development";
  const isDeployedEnvironment = environment === "staging" || environment === "production";
  const deploymentIdentityValid =
    apiUrl === expectedApiUrl &&
    Boolean(workerIdentity) &&
    (!isDeployedEnvironment || (
      GIT_REVISION_PATTERN.test(sourceRevision) &&
      WORKER_VERSION_PATTERN.test(workerVersionId)
    ));

  return {
    apiUrl,
    deploymentIdentityValid,
    expectedApiUrl,
    sourceRevision,
    workerIdentity,
    workerVersionId,
  };
}

export function handleHealth(request: Request, env: Env, requestId: string) {
  const providerSummary = getProviderSummary(env);
  const rateLimitCaps = getRateLimitCaps(env);
  const runtimeIdentity = getRuntimeDeploymentIdentity(request, env);

  return jsonResponse(request, env, {
    analyzeDeviceRateLimitPerMinute: rateLimitCaps.analyzeDevicePerMinute,
    analyzeIpRateLimitPerMinute: rateLimitCaps.analyzeIpPerMinute,
    apiUrl: runtimeIdentity.apiUrl,
    benchmarkProviders:
      env.ENVIRONMENT === "production" ? undefined : getBenchmarkProviderNamesForEnv(env),
    bootstrapIpRateLimitPerMinute: rateLimitCaps.bootstrapIpPerMinute,
    defaultMaxCompletionTokens: providerSummary.maxCompletionTokens,
    defaultModel: providerSummary.model,
    defaultProvider: providerSummary.provider,
    defaultReasoningEffort: providerSummary.reasoningEffort,
    defaultRequestTimeoutMs: providerSummary.requestTimeoutMs,
    defaultRetryCount: providerSummary.retryCount,
    defaultRetryDelayMs: providerSummary.retryDelayMs,
    deploymentIdentityValid: runtimeIdentity.deploymentIdentityValid,
    environment: env.ENVIRONMENT || "development",
    expectedApiUrl: runtimeIdentity.expectedApiUrl,
    ok: runtimeIdentity.deploymentIdentityValid,
    promptVersion: getPromptVersion(env),
    providerGlobalCallLimitPerMinute: rateLimitCaps.providerCallsGlobalPerMinute,
    requestId,
    service: "guidepup-api",
    sessionTtlSeconds: getSessionTtlSeconds(env),
    sourceRevision: runtimeIdentity.sourceRevision,
    structuredOutputMode: providerSummary.structuredOutputMode,
    workerIdentity: runtimeIdentity.workerIdentity,
    workerVersionId: runtimeIdentity.workerVersionId,
  }, {
    status: runtimeIdentity.deploymentIdentityValid ? 200 : 503,
  });
}
