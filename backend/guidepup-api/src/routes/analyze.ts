import { jsonResponse } from "../lib/http";
import { createSafeFallbackResponse, normalizeProviderVision } from "../lib/normalize";
import { logError, logInfo, logWarn } from "../lib/logging";
import { getPromptVersion } from "../lib/prompts";
import { enforceRateLimit } from "../lib/rate-limit";
import { reportBackendError } from "../lib/sentry";
import { verifySessionToken } from "../lib/session";
import {
  AnalyzeVisionErrorSchema,
  AnalyzeVisionRequestSchema,
} from "../schemas/vision";
import { getProviderSummary, getVisionProvider } from "../providers";

function getDeviceId(request: Request) {
  return request.headers.get("x-guidepup-device-id")?.trim();
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }

  return authorization.replace(/^Bearer /, "").trim();
}

function invalidRequestResponse(request: Request, env: Env, requestId: string) {
  return jsonResponse(request, env, {
    error: {
      code: "invalid_request",
      message: "Request payload is invalid.",
    },
  }, {
    headers: {
      "x-request-id": requestId,
    },
    status: 400,
  });
}

export async function handleAnalyze(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  requestId: string,
) {
  const startedAt = Date.now();
  const deviceId = getDeviceId(request);
  const sessionToken = getBearerToken(request);

  if (!deviceId || !sessionToken) {
    return jsonResponse(request, env, {
      error: {
        code: "unauthorized",
        message: "Missing device bootstrap credentials.",
      },
    }, {
      headers: {
        "x-request-id": requestId,
      },
      status: 401,
    });
  }

  const sessionIsValid = await verifySessionToken(sessionToken, deviceId, env);
  if (!sessionIsValid) {
    return jsonResponse(request, env, {
      error: {
        code: "unauthorized",
        message: "Invalid or expired device bootstrap token.",
      },
    }, {
      headers: {
        "x-request-id": requestId,
      },
      status: 401,
    });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return invalidRequestResponse(request, env, requestId);
  }

  const parsedBody = AnalyzeVisionRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return invalidRequestResponse(request, env, requestId);
  }

  const body = parsedBody.data;
  const promptVersion = getPromptVersion(env);
  const rateLimit = await enforceRateLimit(deviceId, env);

  if (!rateLimit.allowed) {
    const infrastructureUnavailable = rateLimit.reason === "infrastructure-unavailable";
    const providerSummary = getProviderSummary(env);
    const safeResponse = createSafeFallbackResponse({
      latencyMs: 0,
      model: providerSummary.model,
      promptVersion,
      provider: providerSummary.provider,
    }, infrastructureUnavailable
      ? "Stop. Safety controls are unavailable."
      : "Stop. Guidance is cooling down.", infrastructureUnavailable
      ? "rate-limit-unavailable"
      : "rate-limited");

    logWarn(infrastructureUnavailable ? "vision.rate_limit_unavailable" : "vision.rate_limited", {
      deviceId,
      interactionMode: body.interactionMode,
      latencyMs: Date.now() - startedAt,
      requestId,
      resetAt: rateLimit.resetAt,
      promptVersion,
    });

    return jsonResponse(request, env, AnalyzeVisionErrorSchema.parse({
      error: {
        code: infrastructureUnavailable ? "safety_control_unavailable" : "rate_limited",
        message: infrastructureUnavailable
          ? "Vision safety controls are temporarily unavailable."
          : "Too many analyze requests for this device.",
      },
      safeResponse,
    }), {
      status: infrastructureUnavailable ? 503 : 429,
      headers: {
        "x-rate-limit-limit": String(rateLimit.limit),
        "x-rate-limit-remaining": String(rateLimit.remaining),
        "x-rate-limit-reset-at": rateLimit.resetAt,
        "x-request-id": requestId,
      },
    });
  }

  const provider = getVisionProvider(env);

  try {
    const providerResult = await provider.analyze({
      appVersion: body.appVersion,
      captureHeuristics: body.captureHeuristics,
      detail: body.detail,
      frameId: body.frameId,
      frameSummary: body.frameSummary,
      hasImage: body.hasImage,
      imageBase64: body.imageBase64,
      interactionMode: body.interactionMode,
      mimeType: body.mimeType,
      nativePath: body.nativePath,
      platform: body.platform,
      promptVersion,
      priorGuidance: body.priorGuidance,
      requestId,
      sampledFrame: body.sampledFrame,
      sessionId: body.sessionId,
      sourceHeight: body.sourceHeight,
      sourceWidth: body.sourceWidth,
      timestampMs: body.timestampMs,
    }, env);

    const normalized = normalizeProviderVision(providerResult.parsed, {
      latencyMs: providerResult.latencyMs,
      model: providerResult.model,
      promptVersion,
      provider: providerResult.provider,
    });

    logInfo("vision.analyze", {
      confidence: normalized.confidence,
      deviceId,
      direction: normalized.direction,
      hazardLevel: normalized.hazardLevel,
      interactionMode: body.interactionMode,
      latencyMs: Date.now() - startedAt,
      model: normalized.model,
      promptVersion: normalized.promptVersion,
      provider: normalized.provider,
      transport: providerResult.transport,
      requestId,
    });

    return jsonResponse(request, env, normalized, {
      headers: {
        "x-rate-limit-limit": String(rateLimit.limit),
        "x-rate-limit-remaining": String(rateLimit.remaining),
        "x-rate-limit-reset-at": rateLimit.resetAt,
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    const providerSummary = getProviderSummary(env);
    const latencyMs = Date.now() - startedAt;
    const safeResponse = createSafeFallbackResponse({
      latencyMs,
      model: providerSummary.model,
      promptVersion,
      provider: providerSummary.provider,
    }, "Stop. Vision guidance is unavailable.", "provider-error");

    logError("vision.analyze_failed", {
      deviceId,
      interactionMode: body.interactionMode,
      latencyMs,
      message: error instanceof Error ? error.message : String(error),
      provider: providerSummary.provider,
      promptVersion,
      safeReason: "provider-error",
      requestId,
    });
    reportBackendError(error, {
      deviceId,
      requestId,
      route: "/v1/vision/analyze",
    }, env, ctx);

    return jsonResponse(request, env, AnalyzeVisionErrorSchema.parse({
      error: {
        code: "provider_error",
        message: "Vision guidance is temporarily unavailable.",
      },
      safeResponse,
    }), {
      status: 503,
      headers: {
        "x-request-id": requestId,
      },
    });
  }
}
