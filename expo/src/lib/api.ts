import { Platform } from "react-native";
import { z } from "zod";

import { appConfig, requireApiBaseUrl } from "./config";
import {
  classifyAnalyzeError,
  recordAnalyzeEvent,
  recordHealthCheckSnapshot,
  sanitizeMessage,
} from "./diagnostics";
import { clearDeviceSession, ensureDeviceSession } from "./device";
import { addBreadcrumb, setSentryTag } from "./sentry";

export const VisionAnalyzeResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(["turn-left", "turn-right", "forward", "stop"]),
  fallbackReason: z.string().nullable().optional(),
  hazardLevel: z.enum(["none", "low", "medium", "high"]),
  latencyMs: z.number().min(0),
  lighting: z.enum(["dark", "dim", "normal", "bright"]).optional(),
  message: z.string().min(1),
  model: z.string().min(1),
  obstacle: z.boolean(),
  promptVersion: z.string().min(1),
  requestId: z.string().optional(),
  provider: z.string().min(1),
  sceneDescription: z.string().optional(),
  surfaceType: z.string().optional(),
});

const AnalyzeVisionErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  safeResponse: VisionAnalyzeResponseSchema.optional(),
});

const HealthCheckResponseSchema = z.object({
  benchmarkProviders: z.array(z.string().min(1)).optional(),
  defaultModel: z.string().min(1),
  defaultProvider: z.string().min(1),
  environment: z.string().min(1),
  ok: z.boolean(),
  promptVersion: z.string().min(1),
  requestId: z.string().min(1),
  service: z.string().min(1),
});

export type VisionAnalyzeResponse = z.infer<typeof VisionAnalyzeResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema> & {
  latencyMs: number;
};

export type AnalyzeVisionPayload = {
  detail?: "low" | "high";
  frameId?: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  nativePath?: "native-core" | "js-fallback";
  priorGuidance?: string;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  timestampMs?: number;
};

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), appConfig.apiTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getPlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web") {
    return Platform.OS;
  }

  return "unknown";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown error";
}

function safeParseJson(rawText: string) {
  if (!rawText.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }
}

function buildAnalyzeTelemetryEnvelope(payload: AnalyzeVisionPayload) {
  return {
    detail: payload.detail,
    frameId: payload.frameId,
    nativePath: payload.nativePath,
    priorGuidanceSummary: payload.priorGuidance,
    sessionId: payload.sessionId,
    sourceHeight: payload.sourceHeight,
    sourceWidth: payload.sourceWidth,
  };
}

function recordAnalyzeTelemetry(
  outcome:
    | "success"
    | "safe-response"
    | "failure"
    | "invalid-response"
    | "timeout"
    | "unauthorized",
  input: {
    detail?: "low" | "high";
    direction?: VisionAnalyzeResponse["direction"];
    error?: string;
    frameId?: string;
    hazardLevel?: VisionAnalyzeResponse["hazardLevel"];
    fallbackReason?: string | null;
    latencyMs?: number;
    lighting?: VisionAnalyzeResponse["lighting"];
    message?: string;
    model?: string;
    nativePath?: AnalyzeVisionPayload["nativePath"];
    obstacle?: boolean;
    priorGuidanceSummary?: string;
    promptVersion?: string;
    requestId?: string;
    provider?: string;
    safeReason?: string;
    sceneDescription?: string;
    sessionId?: string;
    sourceHeight?: number;
    sourceWidth?: number;
    surfaceType?: string;
    confidence?: number;
  },
) {
  recordAnalyzeEvent({
    ...input,
    error: sanitizeMessage(input.error, 120),
    frameId: sanitizeMessage(input.frameId, 80),
    lighting: input.lighting,
    message: sanitizeMessage(input.message, 160),
    nativePath: input.nativePath,
    outcome,
    priorGuidanceSummary: sanitizeMessage(input.priorGuidanceSummary, 120),
    promptVersion: sanitizeMessage(input.promptVersion, 40),
    requestId: sanitizeMessage(input.requestId, 80),
    provider: sanitizeMessage(input.provider, 64),
    fallbackReason: sanitizeMessage(input.fallbackReason ?? undefined, 120),
    safeReason: sanitizeMessage(input.safeReason, 120),
    sceneDescription: sanitizeMessage(input.sceneDescription, 160),
    sessionId: sanitizeMessage(input.sessionId, 80),
    surfaceType: sanitizeMessage(input.surfaceType, 80),
  });
}

export async function fetchHealthCheck(): Promise<HealthCheckResponse> {
  const startedAt = Date.now();
  let healthTelemetryRecorded = false;
  addBreadcrumb({
    category: "api.health",
    data: {
      baseUrl: appConfig.apiBaseUrl || "not-configured",
      environment: appConfig.appEnv,
    },
    level: "info",
    message: "Health check started",
    type: "http",
  });

  try {
    const response = await fetchWithTimeout(`${requireApiBaseUrl()}/health`, {
      method: "GET",
      headers: {
        "content-type": "application/json",
      },
    });
    const rawText = await response.text();
    const rawJson = safeParseJson(rawText);
    const latencyMs = Date.now() - startedAt;
    const requestId = response.headers.get("x-request-id")?.trim() || undefined;

    if (!response.ok) {
      const message = `Guide Pup API health check failed (${response.status}).`;
      recordHealthCheckSnapshot({
        error: message,
        ok: false,
      });
      healthTelemetryRecorded = true;
      addBreadcrumb({
        category: "api.health",
        data: {
          status: response.status,
        },
        level: "warning",
        message,
        type: "http",
      });
      throw new Error(message);
    }

    const parsed = HealthCheckResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      const message = "Guide Pup API returned an invalid health response.";
      recordHealthCheckSnapshot({
        error: message,
        ok: false,
      });
      healthTelemetryRecorded = true;
      addBreadcrumb({
        category: "api.health",
        level: "warning",
        message,
        type: "http",
      });
      throw new Error(message);
    }

    const result: HealthCheckResponse = {
      ...parsed.data,
      latencyMs,
      requestId: parsed.data.requestId || requestId || "not-found",
    };

    recordHealthCheckSnapshot({
      benchmarkProviders: result.benchmarkProviders,
      defaultModel: result.defaultModel,
      defaultProvider: result.defaultProvider,
      environment: result.environment,
      ok: result.ok,
      promptVersion: result.promptVersion,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
    });
    healthTelemetryRecorded = true;

    addBreadcrumb({
      category: "api.health",
      data: {
        defaultProvider: result.defaultProvider,
        defaultModel: result.defaultModel,
        latencyMs: result.latencyMs,
        promptVersion: result.promptVersion,
        requestId: result.requestId,
      },
      level: "info",
      message: "Health check succeeded",
      type: "http",
    });

    return result;
  } catch (error) {
    if (!healthTelemetryRecorded) {
      const message = getErrorMessage(error);
      recordHealthCheckSnapshot({
        error: message,
        ok: false,
      });
    }

    addBreadcrumb({
      category: "api.health",
      data: {
        error: getErrorMessage(error),
      },
      level: "error",
      message: "Health check failed",
      type: "http",
    });

    throw error;
  }
}

export async function analyzeVision(payload: AnalyzeVisionPayload, allowRetry = true): Promise<VisionAnalyzeResponse> {
  const startedAt = Date.now();
  const telemetryEnvelope = buildAnalyzeTelemetryEnvelope(payload);
  let analyzeTelemetryRecorded = false;
  let requestId: string | undefined;

  addBreadcrumb({
    category: "api.analyze",
    data: {
      detail: payload.detail || "low",
      sourceHeight: payload.sourceHeight,
      sourceWidth: payload.sourceWidth,
    },
    level: "info",
    message: "Vision analyze started",
    type: "http",
  });

  let session;
  try {
    session = await ensureDeviceSession();
  } catch (error) {
    const message = getErrorMessage(error);
    recordAnalyzeTelemetry(classifyAnalyzeError(message), {
      ...telemetryEnvelope,
      error: message,
      latencyMs: Date.now() - startedAt,
      safeReason: "session-bootstrap",
    });
    analyzeTelemetryRecorded = true;
    addBreadcrumb({
      category: "api.analyze",
      data: {
        error: message,
      },
      level: "error",
      message: "Vision analyze bootstrap failed",
      type: "http",
    });
    throw error;
  }

  try {
    const response = await fetchWithTimeout(`${requireApiBaseUrl()}/v1/vision/analyze`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
        "content-type": "application/json",
        "x-guidepup-device-id": session.deviceId,
      },
      body: JSON.stringify({
        appVersion: undefined,
        detail: payload.detail || "low",
        frameId: payload.frameId,
        imageBase64: payload.imageBase64,
        mimeType: payload.mimeType,
        nativePath: payload.nativePath,
        platform: getPlatform(),
        priorGuidance: payload.priorGuidance,
        sessionId: payload.sessionId,
        sourceHeight: payload.sourceHeight,
        sourceWidth: payload.sourceWidth,
        timestampMs: payload.timestampMs,
      }),
    });

    const rawText = await response.text();
    const rawJson = safeParseJson(rawText);
    const latencyMs = Date.now() - startedAt;
    requestId = response.headers.get("x-request-id")?.trim() || undefined;

    if (response.status === 401 && allowRetry) {
      recordAnalyzeTelemetry("unauthorized", {
        ...telemetryEnvelope,
        error: "Guide Pup session expired.",
        latencyMs,
        requestId,
        safeReason: "unauthorized",
      });
      analyzeTelemetryRecorded = true;
      addBreadcrumb({
        category: "api.analyze",
        data: {
          status: response.status,
          requestId,
        },
        level: "warning",
        message: "Vision analyze unauthorized",
        type: "http",
      });
      await clearDeviceSession();
      return analyzeVision(payload, false);
    }

    if (!response.ok) {
      const parsedError = AnalyzeVisionErrorSchema.safeParse(rawJson);
      if (parsedError.success && parsedError.data.safeResponse) {
        const safeResponse = parsedError.data.safeResponse;
        recordAnalyzeTelemetry("safe-response", {
          ...telemetryEnvelope,
          confidence: safeResponse.confidence,
          direction: safeResponse.direction,
          error: parsedError.data.error.message,
          fallbackReason: safeResponse.fallbackReason,
          hazardLevel: safeResponse.hazardLevel,
          latencyMs,
          lighting: safeResponse.lighting,
          message: safeResponse.message,
          model: safeResponse.model,
          obstacle: safeResponse.obstacle,
          promptVersion: safeResponse.promptVersion,
          requestId,
          provider: safeResponse.provider,
          safeReason: parsedError.data.error.code,
          sceneDescription: safeResponse.sceneDescription,
          surfaceType: safeResponse.surfaceType,
        });
        analyzeTelemetryRecorded = true;
        setSentryTag("vision.provider", safeResponse.provider);
        setSentryTag("vision.model", safeResponse.model);
        setSentryTag("vision.promptVersion", safeResponse.promptVersion);
        setSentryTag("vision.requestId", requestId);
        addBreadcrumb({
          category: "api.analyze",
          data: {
            direction: safeResponse.direction,
            provider: safeResponse.provider,
            requestId,
            status: response.status,
          },
          level: "info",
          message: "Vision analyze returned safe fallback response",
          type: "http",
        });
        return safeResponse;
      }

      const message = parsedError.success ? parsedError.data.error.message : `Guide Pup API request failed (${response.status}).`;
      const outcome = response.status === 408 || response.status === 504 ? "timeout" : "failure";
      recordAnalyzeTelemetry(outcome, {
        ...telemetryEnvelope,
        error: message,
        latencyMs,
        requestId,
        safeReason: parsedError.success ? parsedError.data.error.code : `http-${response.status}`,
      });
      analyzeTelemetryRecorded = true;
      addBreadcrumb({
        category: "api.analyze",
        data: {
          error: message,
          requestId,
          status: response.status,
        },
        level: response.status === 408 || response.status === 504 ? "warning" : "error",
        message: "Vision analyze failed",
        type: "http",
      });
      throw new Error(message);
    }

    const parsedResponse = VisionAnalyzeResponseSchema.safeParse(rawJson);
    if (!parsedResponse.success) {
      const message = "Guide Pup API returned an invalid response.";
      recordAnalyzeTelemetry("invalid-response", {
        ...telemetryEnvelope,
        error: message,
        latencyMs,
        requestId,
        safeReason: "invalid-json",
      });
      analyzeTelemetryRecorded = true;
      addBreadcrumb({
        category: "api.analyze",
        data: {
          requestId,
        },
        level: "warning",
        message: "Vision analyze returned invalid JSON",
        type: "http",
      });
      throw new Error(message);
    }

    const result = parsedResponse.data;
    recordAnalyzeTelemetry("success", {
      ...telemetryEnvelope,
      confidence: result.confidence,
      direction: result.direction,
      hazardLevel: result.hazardLevel,
      latencyMs,
      lighting: result.lighting,
      message: result.message,
      model: result.model,
      obstacle: result.obstacle,
      promptVersion: result.promptVersion,
      requestId,
      provider: result.provider,
      safeReason: result.direction === "stop" ? "direction-stop" : result.obstacle ? "obstacle-detected" : undefined,
      fallbackReason: result.fallbackReason,
      sceneDescription: result.sceneDescription,
      surfaceType: result.surfaceType,
    });
    analyzeTelemetryRecorded = true;
    setSentryTag("vision.provider", result.provider);
    setSentryTag("vision.model", result.model);
    setSentryTag("vision.promptVersion", result.promptVersion);
    setSentryTag("vision.requestId", requestId);
    addBreadcrumb({
      category: "api.analyze",
      data: {
        direction: result.direction,
        latencyMs,
        requestId,
        provider: result.provider,
      },
      level: "info",
      message: "Vision analyze succeeded",
      type: "http",
    });
    return result;
  } catch (error) {
    const message = getErrorMessage(error);
    const outcome = message.toLowerCase().includes("timed out") || message.toLowerCase().includes("abort") ? "timeout" : "failure";

    if (!analyzeTelemetryRecorded) {
      recordAnalyzeTelemetry(outcome, {
        ...telemetryEnvelope,
        error: message,
        latencyMs: Date.now() - startedAt,
        requestId,
        safeReason: outcome === "timeout" ? "timeout" : undefined,
      });
    }
    addBreadcrumb({
      category: "api.analyze",
      data: {
        error: message,
        requestId,
      },
      level: outcome === "timeout" ? "warning" : "error",
      message: "Vision analyze threw",
      type: "http",
    });

    throw error;
  }
}
