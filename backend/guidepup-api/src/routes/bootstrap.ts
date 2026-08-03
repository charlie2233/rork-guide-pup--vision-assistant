import { jsonResponse } from "../lib/http";
import { logInfo, logWarn } from "../lib/logging";
import { getPromptVersion } from "../lib/prompts";
import {
  enforceBootstrapRateLimit,
  getRateLimitPerMinute,
} from "../lib/rate-limit";
import { issueSessionToken } from "../lib/session";
import {
  BootstrapDeviceRequestSchema,
  BootstrapDeviceResponseSchema,
} from "../schemas/device";

export async function handleBootstrap(request: Request, env: Env, requestId: string) {
  const rateLimit = await enforceBootstrapRateLimit(request, env);
  if (!rateLimit.allowed) {
    const infrastructureUnavailable = rateLimit.reason === "infrastructure-unavailable";
    logWarn(infrastructureUnavailable ? "device.bootstrap_rate_limit_unavailable" : "device.bootstrap_rate_limited", {
      requestId,
      resetAt: rateLimit.resetAt,
    });

    return jsonResponse(request, env, {
      error: {
        code: infrastructureUnavailable ? "safety_control_unavailable" : "rate_limited",
        message: infrastructureUnavailable
          ? "Device bootstrap is temporarily unavailable."
          : "Too many device bootstrap requests.",
      },
    }, {
      headers: {
        "x-rate-limit-limit": String(rateLimit.limit),
        "x-rate-limit-remaining": String(rateLimit.remaining),
        "x-rate-limit-reset-at": rateLimit.resetAt,
        "x-request-id": requestId,
      },
      status: infrastructureUnavailable ? 503 : 429,
    });
  }

  const body = BootstrapDeviceRequestSchema.parse(await request.json());
  const deviceId = body.deviceId || crypto.randomUUID();
  const session = await issueSessionToken(deviceId, env);
  const response = BootstrapDeviceResponseSchema.parse({
    apiVersion: "v1",
    deviceId,
    expiresAt: session.expiresAt,
    issuedAt: session.issuedAt,
    promptVersion: getPromptVersion(env),
    rateLimitPerMinute: getRateLimitPerMinute(env),
    sessionToken: session.sessionToken,
  });

  logInfo("device.bootstrap", {
    appVersion: body.appVersion,
    deviceId,
    platform: body.platform || "unknown",
    rateLimitRemaining: rateLimit.remaining,
    requestId,
  });

  return jsonResponse(request, env, response);
}
