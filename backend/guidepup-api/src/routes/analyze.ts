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
  const deviceId = getDeviceId(request);
  const sessionToken = getBearerToken(request);

  if (!deviceId || !sessionToken) {
    return jsonResponse(env, {
      error: {
        code: "unauthorized",
        message: "Missing device bootstrap credentials.",
      },
    }, { status: 401 });
  }

  const sessionIsValid = await verifySessionToken(sessionToken, deviceId, env);
  if (!sessionIsValid) {
    return jsonResponse(env, {
      error: {
        code: "unauthorized",
        message: "Invalid or expired device bootstrap token.",
      },
    }, { status: 401 });
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
    }, "Stop. Guidance is cooling down.");

    logWarn("vision.rate_limited", {
      deviceId,
      requestId,
      resetAt: rateLimit.resetAt,
    });

    return jsonResponse(env, AnalyzeVisionErrorSchema.parse({
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
      },
    });
  }

  const provider = getVisionProvider(env);

  try {
    const providerResult = await provider.analyze({
      detail: body.detail,
      imageBase64: body.imageBase64,
      mimeType: body.mimeType,
      promptVersion,
      sourceHeight: body.sourceHeight,
      sourceWidth: body.sourceWidth,
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
      latencyMs: normalized.latencyMs,
      provider: normalized.provider,
      requestId,
    });

    return jsonResponse(env, normalized, {
      headers: {
        "x-rate-limit-limit": String(rateLimit.limit),
        "x-rate-limit-remaining": String(rateLimit.remaining),
        "x-rate-limit-reset-at": rateLimit.resetAt,
      },
    });
  } catch (error) {
    const providerSummary = getProviderSummary(env);
    const latencyMs = 0;
    const safeResponse = createSafeFallbackResponse({
      latencyMs,
      model: providerSummary.model,
      promptVersion,
      provider: providerSummary.provider,
    }, "Stop. Vision guidance is unavailable.");

    logError("vision.analyze_failed", {
      deviceId,
      message: error instanceof Error ? error.message : String(error),
      provider: providerSummary.provider,
      requestId,
    });
    reportBackendError(error, {
      deviceId,
      requestId,
      route: "/v1/vision/analyze",
    }, env, ctx);

    return jsonResponse(env, safeResponse);
  }
}
