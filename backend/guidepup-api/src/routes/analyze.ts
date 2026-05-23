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

  const body = AnalyzeVisionRequestSchema.parse(await request.json());
  const promptVersion = getPromptVersion(env);
  const rateLimit = await enforceRateLimit(deviceId, env);

  if (!rateLimit.allowed) {
    const providerSummary = getProviderSummary(env);
    const safeResponse = createSafeFallbackResponse({
      latencyMs: 0,
      model: providerSummary.model,
      promptVersion,
      provider: providerSummary.provider,
    }, "Stop. Guidance is cooling down.", "rate-limited");

    logWarn("vision.rate_limited", {
      deviceId,
      latencyMs: Date.now() - startedAt,
      requestId,
      resetAt: rateLimit.resetAt,
      promptVersion,
    });

    return jsonResponse(request, env, AnalyzeVisionErrorSchema.parse({
      error: {
        code: "rate_limited",
        message: "Too many analyze requests for this device.",
      },
      safeResponse,
    }), {
      status: 429,
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
      mimeType: body.mimeType,
      nativePath: body.nativePath,
      platform: body.platform,
      promptVersion,
      priorGuidance: body.priorGuidance,
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
