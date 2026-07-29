import Constants from "expo-constants";
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
import {
  assertFreshFrameForUpload,
  createAbortError,
  isAbortError,
  throwIfAborted,
} from "./runtimeSafety";
import { addBreadcrumb, setDiagnosticTag } from "./clientDiagnostics";

const HEALTH_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEALTH_GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const HEALTH_WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const HEALTH_PROVIDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export const VisionAnalyzeResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(["turn-left", "turn-right", "forward", "stop"]),
  fallbackReason: z.string().nullable(),
  hazardLevel: z.enum(["none", "low", "medium", "high"]),
  latencyMs: z.number().min(0),
  lighting: z.enum(["dark", "dim", "normal", "bright", "unknown"]),
  message: z.string().trim().min(1),
  model: z.string().min(1),
  obstacle: z.boolean(),
  promptVersion: z.string().min(1),
  requestId: z.string().optional(),
  provider: z.string().min(1),
  sceneDescription: z.string().trim().min(1),
  surfaceType: z.string().trim().min(1),
  walkability: z.enum(["clear", "caution", "uncertain"]),
});

const AnalyzeVisionErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  safeResponse: VisionAnalyzeResponseSchema.optional(),
});

const HealthCheckResponseSchema = z.object({
  analyzeDeviceRateLimitPerMinute: z.number().int().min(1).max(60),
  analyzeIpRateLimitPerMinute: z.number().int().min(10).max(300),
  benchmarkProviders: z.array(z.string().regex(HEALTH_PROVIDER_NAME_PATTERN))
    .max(4)
    .refine((providers) => new Set(providers).size === providers.length)
    .optional(),
  bootstrapIpRateLimitPerMinute: z.number().int().min(1).max(60),
  defaultMaxCompletionTokens: z.number().int().min(128).max(1200),
  defaultModel: z.string().trim().min(1).max(64),
  defaultProvider: z.string().regex(HEALTH_PROVIDER_NAME_PATTERN),
  defaultReasoningEffort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  defaultRequestTimeoutMs: z.number().int().min(3000).max(30000),
  defaultRetryCount: z.number().int().min(0).max(2),
  defaultRetryDelayMs: z.number().int().min(0).max(2000),
  deploymentIdentityValid: z.boolean(),
  environment: z.enum(["development", "staging", "production"]),
  ok: z.boolean(),
  promptVersion: z.string().trim().min(1).max(40),
  providerGlobalCallLimitPerMinute: z.number().int().min(20).max(600),
  requestId: z.string().regex(HEALTH_REQUEST_ID_PATTERN),
  service: z.literal("guidepup-api"),
  sessionTtlSeconds: z.number().int().min(5 * 60).max(7 * 24 * 60 * 60),
  sourceRevision: z.union([
    z.string().regex(HEALTH_GIT_REVISION_PATTERN),
    z.literal("development"),
  ]),
  structuredOutputMode: z.literal("json_schema_strict"),
  workerIdentity: z.string().regex(HEALTH_WORKER_ID_PATTERN),
  workerVersionId: z.union([
    z.string().regex(HEALTH_REQUEST_ID_PATTERN),
    z.literal("development"),
  ]),
}).superRefine((value, context) => {
  if (value.ok !== value.deploymentIdentityValid) {
    context.addIssue({
      code: "custom",
      message: "Health status must match deployment identity validity.",
      path: ["deploymentIdentityValid"],
    });
  }
  if (
    value.environment !== "development"
    && !HEALTH_GIT_REVISION_PATTERN.test(value.sourceRevision)
  ) {
    context.addIssue({
      code: "custom",
      message: "Deployed health requires a source revision.",
      path: ["sourceRevision"],
    });
  }
  if (
    value.environment !== "development"
    && !HEALTH_REQUEST_ID_PATTERN.test(value.workerVersionId)
  ) {
    context.addIssue({
      code: "custom",
      message: "Deployed health requires a Worker version.",
      path: ["workerVersionId"],
    });
  }
});

export type VisionAnalyzeResponse = z.infer<typeof VisionAnalyzeResponseSchema>;
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema> & {
  latencyMs: number;
};

export type VisionInteractionMode = "guidance" | "scene-query";

type GuidePupClientPlatform = "ios" | "android" | "web" | "unknown";

export type GuidePupCaptureHeuristics = {
  captureLatencyMs?: number;
  frameAgeMs?: number;
  imageSource?: "uri" | "base64" | "unknown";
  resizedForUpload?: boolean;
  uploadedHeight?: number;
  uploadedWidth?: number;
};

export type AnalyzeVisionPayload = {
  appVersion?: string;
  captureHeuristics?: GuidePupCaptureHeuristics;
  detail?: "low" | "high";
  frameId?: string;
  frameSummary?: string;
  hasImage?: boolean;
  imageBase64: string;
  interactionMode: VisionInteractionMode;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  nativePath?: "native-core" | "js-fallback";
  sampledFrame?: boolean;
  priorGuidance?: string;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  timestampMs?: number;
};

export type AnalyzeVisionOptions = {
  allowRetry?: boolean;
  minimumCapturedAtMs?: number;
  signal?: AbortSignal;
};

async function fetchWithTimeout(url: string, init: RequestInit, externalSignal?: AbortSignal) {
  throwIfAborted(externalSignal);

  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, appConfig.apiTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (externalSignal?.aborted) {
      throw createAbortError();
    }
    if (timedOut) {
      throw new Error("Guide Pup API request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function getPlatform(): GuidePupClientPlatform {
  if (Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web") {
    return Platform.OS;
  }

  return "unknown";
}

function getAppVersion() {
  return Constants.expoConfig?.version || "unknown";
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
    appVersion: payload.appVersion || getAppVersion(),
    captureHeuristics: payload.captureHeuristics,
    detail: payload.detail,
    frameId: payload.frameId,
    frameSummary: payload.frameSummary,
    frameTimestampMs: payload.timestampMs,
    hasImage: payload.hasImage ?? Boolean(payload.imageBase64),
    interactionMode: payload.interactionMode,
    nativePath: payload.nativePath,
    platform: getPlatform(),
    priorGuidanceSummary: payload.priorGuidance,
    sampledFrame: payload.sampledFrame ?? true,
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
    appVersion?: string;
    captureHeuristics?: GuidePupCaptureHeuristics;
    detail?: "low" | "high";
    direction?: VisionAnalyzeResponse["direction"];
    error?: string;
    frameId?: string;
    frameSummary?: string;
    frameTimestampMs?: number;
    hazardLevel?: VisionAnalyzeResponse["hazardLevel"];
    hasImage?: boolean;
    interactionMode?: VisionInteractionMode;
    fallbackReason?: string | null;
    latencyMs?: number;
    lighting?: VisionAnalyzeResponse["lighting"];
    message?: string;
    model?: string;
    nativePath?: AnalyzeVisionPayload["nativePath"];
    obstacle?: boolean;
    platform?: GuidePupClientPlatform;
    priorGuidanceSummary?: string;
    promptVersion?: string;
    requestId?: string;
    provider?: string;
    sampledFrame?: boolean;
    safeReason?: string;
    sceneDescription?: string;
    sessionId?: string;
    sourceHeight?: number;
    sourceWidth?: number;
    surfaceType?: string;
    walkability?: VisionAnalyzeResponse["walkability"];
    confidence?: number;
  },
) {
  recordAnalyzeEvent({
    ...input,
    appVersion: sanitizeMessage(input.appVersion, 64),
    captureHeuristics: input.captureHeuristics,
    error: sanitizeMessage(input.error, 120),
    frameId: sanitizeMessage(input.frameId, 80),
    frameSummary: sanitizeMessage(input.frameSummary, 280),
    frameTimestampMs: input.frameTimestampMs,
    hasImage: input.hasImage,
    lighting: input.lighting,
    message: sanitizeMessage(input.message, 160),
    nativePath: input.nativePath,
    outcome,
    platform: input.platform,
    priorGuidanceSummary: sanitizeMessage(input.priorGuidanceSummary, 120),
    promptVersion: sanitizeMessage(input.promptVersion, 40),
    requestId: input.requestId,
    provider: sanitizeMessage(input.provider, 64),
    fallbackReason: sanitizeMessage(input.fallbackReason ?? undefined, 120),
    sampledFrame: input.sampledFrame,
    safeReason: sanitizeMessage(input.safeReason, 120),
    sceneDescription: sanitizeMessage(input.sceneDescription, 160),
    sessionId: sanitizeMessage(input.sessionId, 80),
    surfaceType: sanitizeMessage(input.surfaceType, 80),
    walkability: input.walkability,
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
      defaultMaxCompletionTokens: result.defaultMaxCompletionTokens,
      defaultProvider: result.defaultProvider,
      defaultReasoningEffort: result.defaultReasoningEffort,
      defaultRequestTimeoutMs: result.defaultRequestTimeoutMs,
      defaultRetryCount: result.defaultRetryCount,
      defaultRetryDelayMs: result.defaultRetryDelayMs,
      deploymentIdentityValid: result.deploymentIdentityValid,
      environment: result.environment,
      ok: result.ok,
      promptVersion: result.promptVersion,
      providerGlobalCallLimitPerMinute: result.providerGlobalCallLimitPerMinute,
      requestId: result.requestId,
      latencyMs: result.latencyMs,
      sessionTtlSeconds: result.sessionTtlSeconds,
      sourceRevision: result.sourceRevision,
      structuredOutputMode: result.structuredOutputMode,
      workerIdentity: result.workerIdentity,
      workerVersionId: result.workerVersionId,
      analyzeDeviceRateLimitPerMinute: result.analyzeDeviceRateLimitPerMinute,
      analyzeIpRateLimitPerMinute: result.analyzeIpRateLimitPerMinute,
      bootstrapIpRateLimitPerMinute: result.bootstrapIpRateLimitPerMinute,
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

export async function analyzeVision(
  payload: AnalyzeVisionPayload,
  options: AnalyzeVisionOptions = {},
): Promise<VisionAnalyzeResponse> {
  const { allowRetry = true, minimumCapturedAtMs, signal } = options;
  throwIfAborted(signal);
  assertFreshFrameForUpload({
    capturedAtMs: payload.timestampMs,
    minimumCapturedAtMs,
    signal,
  });

  const startedAt = Date.now();
  const telemetryEnvelope = buildAnalyzeTelemetryEnvelope(payload);
  let analyzeTelemetryRecorded = false;
  let requestId: string | undefined;

  addBreadcrumb({
    category: "api.analyze",
    data: {
      detail: payload.detail || "low",
      interactionMode: payload.interactionMode,
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
    if (isAbortError(error)) {
      throw error;
    }
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
  throwIfAborted(signal);
  assertFreshFrameForUpload({
    capturedAtMs: payload.timestampMs,
    minimumCapturedAtMs,
    signal,
  });

  try {
    const response = await fetchWithTimeout(`${requireApiBaseUrl()}/v1/vision/analyze`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.sessionToken}`,
        "content-type": "application/json",
        "x-guidepup-device-id": session.deviceId,
      },
      body: JSON.stringify({
        appVersion: payload.appVersion || getAppVersion(),
        captureHeuristics: payload.captureHeuristics,
        detail: payload.detail || "low",
        frameId: payload.frameId,
        frameSummary: payload.frameSummary,
        hasImage: payload.hasImage ?? Boolean(payload.imageBase64),
        imageBase64: payload.imageBase64,
        interactionMode: payload.interactionMode,
        mimeType: payload.mimeType,
        nativePath: payload.nativePath,
        platform: getPlatform(),
        priorGuidance: payload.priorGuidance,
        sampledFrame: payload.sampledFrame ?? true,
        sessionId: payload.sessionId,
        sourceHeight: payload.sourceHeight,
        sourceWidth: payload.sourceWidth,
        timestampMs: payload.timestampMs,
      }),
    }, signal);

    throwIfAborted(signal);
    const rawText = await response.text();
    throwIfAborted(signal);
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
      throwIfAborted(signal);
      return analyzeVision(payload, {
        allowRetry: false,
        minimumCapturedAtMs,
        signal,
      });
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
          walkability: safeResponse.walkability,
        });
        analyzeTelemetryRecorded = true;
        setDiagnosticTag("vision.provider", safeResponse.provider);
        setDiagnosticTag("vision.model", safeResponse.model);
        setDiagnosticTag("vision.promptVersion", safeResponse.promptVersion);
        setDiagnosticTag("vision.requestId", requestId);
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
        throwIfAborted(signal);
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
      walkability: result.walkability,
    });
    analyzeTelemetryRecorded = true;
    setDiagnosticTag("vision.provider", result.provider);
    setDiagnosticTag("vision.model", result.model);
    setDiagnosticTag("vision.promptVersion", result.promptVersion);
    setDiagnosticTag("vision.requestId", requestId);
    addBreadcrumb({
      category: "api.analyze",
      data: {
        direction: result.direction,
        interactionMode: payload.interactionMode,
        latencyMs,
        requestId,
        provider: result.provider,
      },
      level: "info",
      message: "Vision analyze succeeded",
      type: "http",
    });
    throwIfAborted(signal);
    return result;
  } catch (error) {
    if (isAbortError(error) && signal?.aborted) {
      throw createAbortError();
    }
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
