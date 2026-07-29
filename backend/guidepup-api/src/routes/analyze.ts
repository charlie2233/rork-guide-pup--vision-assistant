import { jsonResponse } from "../lib/http";
import { createSafeFallbackResponse, normalizeProviderVision } from "../lib/normalize";
import { logError, logInfo, logWarn } from "../lib/logging";
import { getPromptVersion } from "../lib/prompts";
import { enforceAnalyzeIpRateLimit, enforceRateLimit } from "../lib/rate-limit";
import { reportBackendError } from "../lib/sentry";
import { verifySessionToken } from "../lib/session";
import {
  AnalyzeVisionErrorSchema,
  AnalyzeVisionRequestSchema,
} from "../schemas/vision";
import { getProviderSummary, getVisionProvider } from "../providers";

export const MAX_ANALYZE_REQUEST_BODY_BYTES = 1_600_000;

class AnalyzePayloadTooLargeError extends Error {}

function cancelUnreadRequestBody(request: Request) {
  if (!request.body || request.body.locked) {
    return;
  }

  void request.body.cancel().catch(() => undefined);
}

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

function payloadTooLargeResponse(request: Request, env: Env, requestId: string) {
  return jsonResponse(request, env, {
    error: {
      code: "payload_too_large",
      message: "Request payload is too large.",
    },
  }, {
    headers: {
      "x-request-id": requestId,
    },
    status: 413,
  });
}

async function readBoundedJsonBody(request: Request) {
  const contentLength = request.headers.get("content-length")?.trim();
  if (contentLength && /^\d+$/.test(contentLength)) {
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes) || declaredBytes > MAX_ANALYZE_REQUEST_BODY_BYTES) {
      cancelUnreadRequestBody(request);
      throw new AnalyzePayloadTooLargeError();
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return JSON.parse("");
  }

  const decoder = new TextDecoder();
  let byteCount = 0;
  let rawText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteCount += value.byteLength;
      if (byteCount > MAX_ANALYZE_REQUEST_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new AnalyzePayloadTooLargeError();
      }
      rawText += decoder.decode(value, { stream: true });
    }
  } catch (error) {
    if (!(error instanceof AnalyzePayloadTooLargeError)) {
      void reader.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  rawText += decoder.decode();

  return JSON.parse(rawText) as unknown;
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
    cancelUnreadRequestBody(request);
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

  const sessionIsValid = await verifySessionToken(sessionToken, deviceId, env).catch((error) => {
    cancelUnreadRequestBody(request);
    throw error;
  });
  if (!sessionIsValid) {
    cancelUnreadRequestBody(request);
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

  let promptVersion: string;
  let deviceRateLimit: Awaited<ReturnType<typeof enforceRateLimit>>;
  let ipRateLimit: Awaited<ReturnType<typeof enforceAnalyzeIpRateLimit>> | undefined;
  try {
    promptVersion = getPromptVersion(env);
    deviceRateLimit = await enforceRateLimit(deviceId, env);
    ipRateLimit = deviceRateLimit.allowed
      ? await enforceAnalyzeIpRateLimit(request, env)
      : undefined;
  } catch (error) {
    cancelUnreadRequestBody(request);
    throw error;
  }
  const rateLimit = deviceRateLimit.allowed && ipRateLimit
    ? ipRateLimit
    : deviceRateLimit;
  const rateLimitScope = deviceRateLimit.allowed ? "analyze-ip" : "device";

  if (!rateLimit.allowed) {
    cancelUnreadRequestBody(request);
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
      latencyMs: Date.now() - startedAt,
      rateLimitScope,
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

  let rawBody: unknown;
  try {
    rawBody = await readBoundedJsonBody(request);
  } catch (error) {
    if (error instanceof AnalyzePayloadTooLargeError) {
      return payloadTooLargeResponse(request, env, requestId);
    }
    return invalidRequestResponse(request, env, requestId);
  }

  const parsedBody = AnalyzeVisionRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return invalidRequestResponse(request, env, requestId);
  }

  const body = parsedBody.data;
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
      providerInputTokens: providerResult.usage?.inputTokens,
      providerOutputTokens: providerResult.usage?.outputTokens,
      providerTotalTokens: providerResult.usage?.totalTokens,
      transport: providerResult.transport,
      upstreamRequestId: providerResult.upstreamRequestId,
      requestId,
    });

    return jsonResponse(request, env, normalized, {
      headers: {
        "x-rate-limit-limit": String(deviceRateLimit.limit),
        "x-rate-limit-remaining": String(deviceRateLimit.remaining),
        "x-rate-limit-reset-at": deviceRateLimit.resetAt,
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
