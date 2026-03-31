import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { appConfig } from "./config";

type ErrorContext = Record<string, unknown>;
type BreadcrumbLevel = "debug" | "info" | "warning" | "error" | "fatal" | "log";

type BreadcrumbInput = {
  category?: string;
  data?: Record<string, unknown>;
  level?: BreadcrumbLevel;
  message?: string;
  type?: string;
};

type AnalyzeEventKind = "start" | "success" | "failure" | "timeout" | "unauthorized" | "invalid-response";

type AnalyzeSummary = {
  confidence?: number;
  detail?: string;
  direction?: string;
  hazardLevel?: string;
  latencyMs?: number;
  message?: string;
  model?: string;
  outcome: AnalyzeEventKind;
  promptVersion?: string;
  provider?: string;
  reason?: string;
  status?: number;
  timeoutMs?: number;
};

const ANALYZE_ENDPOINT_PATH = "/v1/vision/analyze";
const FETCH_PATCH_FLAG = Symbol.for("guidepup.fetchTelemetryInstalled");

let sentryInitialized = false;
let navigationIntegration: ReturnType<typeof Sentry.reactNavigationIntegration> | undefined;

function trimToUndefined(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function getReleaseMetadata() {
  const version = trimToUndefined(Constants.expoConfig?.version);
  const buildNumber =
    trimToUndefined(Constants.expoConfig?.ios?.buildNumber) ||
    trimToUndefined(
      typeof Constants.expoConfig?.android?.versionCode === "number"
        ? String(Constants.expoConfig.android.versionCode)
        : Constants.expoConfig?.android?.versionCode,
    );

  return {
    buildNumber,
    release: version ? `guidepup-app@${version}` : undefined,
    version,
  };
}

function isSensitiveKey(key: string) {
  return /authorization|base64|password|secret|token|image/i.test(key);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return "[redacted]";
    }

    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (depth >= 2) {
    return "[redacted]";
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeValue(nestedValue, depth + 1),
    ]),
  );
}

function sanitizeBreadcrumb(breadcrumb: BreadcrumbInput) {
  return {
    ...breadcrumb,
    data: breadcrumb.data ? (sanitizeValue(breadcrumb.data) as Record<string, unknown>) : undefined,
    message: trimToUndefined(breadcrumb.message) ?? breadcrumb.message,
  };
}

function setSafeTag(key: string, value?: string | number | boolean | null) {
  if (!sentryInitialized || value === undefined || value === null) {
    return;
  }

  Sentry.setTag(key, String(value));
}

function applyRuntimeTags() {
  const { buildNumber, release, version } = getReleaseMetadata();
  const expoConfig = Constants.expoConfig;
  const extra = expoConfig?.extra as Record<string, unknown> | undefined;

  setSafeTag("app.environment", appConfig.appEnv);
  setSafeTag("app.platform", Platform.OS);
  setSafeTag("app.release", release);
  setSafeTag("app.dist", buildNumber);
  setSafeTag("app.version", version);
  setSafeTag("expo.name", expoConfig?.name);
  setSafeTag("expo.slug", expoConfig?.slug);
  setSafeTag("expo.runtimeVersion", expoConfig?.runtimeVersion ? String(expoConfig.runtimeVersion) : undefined);

  if (extra && typeof extra === "object") {
    Sentry.setContext("expo", sanitizeValue(extra) as Record<string, unknown>);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAbortError(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function extractAnalyzeResponseSummary(raw: unknown): AnalyzeSummary | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const provider = trimToUndefined(raw.provider);
  const model = trimToUndefined(raw.model);
  const promptVersion = trimToUndefined(raw.promptVersion);
  const direction = trimToUndefined(raw.direction);
  const hazardLevel = trimToUndefined(raw.hazardLevel);
  const message = trimToUndefined(raw.message);
  const confidence = typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? raw.confidence : undefined;
  const latencyMs = typeof raw.latencyMs === "number" && Number.isFinite(raw.latencyMs) ? raw.latencyMs : undefined;

  if (!provider || !model || !promptVersion || !direction || !hazardLevel || !message) {
    return undefined;
  }

  return {
    confidence,
    direction,
    hazardLevel,
    latencyMs,
    message,
    model,
    outcome: "success",
    promptVersion,
    provider,
  };
}

function recordAnalyzeTelemetry(summary: AnalyzeSummary) {
  if (!sentryInitialized) {
    return;
  }

  const sanitized = sanitizeValue(summary) as Record<string, unknown>;

  setSafeTag("guidepup.analyze.outcome", summary.outcome);
  setSafeTag("guidepup.analyze.method", summary.detail);
  setSafeTag("guidepup.analyze.provider", summary.provider);
  setSafeTag("guidepup.analyze.model", summary.model);
  setSafeTag("guidepup.analyze.promptVersion", summary.promptVersion);
  setSafeTag("guidepup.analyze.direction", summary.direction);
  setSafeTag("guidepup.analyze.hazardLevel", summary.hazardLevel);
  setSafeTag("guidepup.analyze.confidence", summary.confidence);
  setSafeTag("guidepup.analyze.latencyMs", summary.latencyMs);
  setSafeTag("guidepup.analyze.status", summary.status);

  if (summary.timeoutMs !== undefined) {
    setSafeTag("guidepup.analyze.timeoutMs", summary.timeoutMs);
  }

  if (summary.reason) {
    setSafeTag("guidepup.analyze.reason", summary.reason);
  }

  Sentry.addBreadcrumb({
    category: "guidepup.analyze",
    data: sanitized,
    level: summary.outcome === "success" ? "info" : summary.outcome === "start" ? "debug" : "warning",
    message:
      summary.outcome === "start"
        ? "Analyze request started"
        : summary.outcome === "success"
          ? "Analyze request succeeded"
          : summary.outcome === "timeout"
            ? "Analyze request timed out"
            : summary.outcome === "unauthorized"
              ? "Analyze request unauthorized"
              : summary.outcome === "invalid-response"
                ? "Analyze request returned an invalid response"
                : "Analyze request failed",
    type: "http",
  });
}

function isAnalyzeRequestUrl(url: string) {
  try {
    return new URL(url).pathname === ANALYZE_ENDPOINT_PATH;
  } catch {
    return url.endsWith(ANALYZE_ENDPOINT_PATH);
  }
}

function extractRequestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function getRequestMethod(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method) {
    return init.method.toUpperCase();
  }

  if (typeof input !== "string" && !(input instanceof URL)) {
    return input.method.toUpperCase();
  }

  return "GET";
}

export function initializeSentry() {
  if (sentryInitialized || !appConfig.sentryDsn) {
    return sentryInitialized;
  }

  const { buildNumber, release } = getReleaseMetadata();

  if (!navigationIntegration) {
    navigationIntegration = Sentry.reactNavigationIntegration({
      enablePrefetchTracking: false,
      routeChangeTimeoutMs: 1000,
      useFullPathsForNavigationRoutes: false,
    });
  }

  Sentry.init({
    beforeBreadcrumb(breadcrumb) {
      return sanitizeBreadcrumb(breadcrumb);
    },
    beforeSend(event) {
      if (event.extra) {
        event.extra = sanitizeValue(event.extra) as Record<string, unknown>;
      }

      if (event.request?.headers) {
        delete (event.request as { headers?: unknown }).headers;
      }

      return event;
    },
    dsn: appConfig.sentryDsn,
    dist: buildNumber,
    enableAutoPerformanceTracing: true,
    enableAutoSessionTracking: true,
    enableNative: true,
    environment: appConfig.appEnv,
    integrations(defaultIntegrations) {
      return navigationIntegration ? [...defaultIntegrations, navigationIntegration] : defaultIntegrations;
    },
    release,
    sendDefaultPii: false,
    tracesSampleRate: appConfig.appEnv === "development" ? 0 : 0.1,
  });

  applyRuntimeTags();

  Sentry.addBreadcrumb({
    category: "app.lifecycle",
    level: "info",
    message: "Sentry initialized.",
  });

  sentryInitialized = true;
  return true;
}

export function registerNavigationContainer(navigationContainerRef: unknown) {
  if (!sentryInitialized || !navigationIntegration) {
    return;
  }

  navigationIntegration.registerNavigationContainer(navigationContainerRef);
}

export function installFetchTelemetry() {
  if (!appConfig.sentryDsn) {
    return;
  }

  const globalObject = globalThis as typeof globalThis & {
    [FETCH_PATCH_FLAG]?: boolean;
    fetch?: typeof fetch;
  };

  if (globalObject[FETCH_PATCH_FLAG] || typeof globalObject.fetch !== "function") {
    return;
  }

  const originalFetch = globalObject.fetch.bind(globalObject);

  globalObject.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = extractRequestUrl(input);
    const requestMethod = getRequestMethod(input, init);
    const isAnalyzeRequest = isAnalyzeRequestUrl(requestUrl);
    const requestStartedAt = Date.now();

    if (isAnalyzeRequest) {
      recordAnalyzeTelemetry({
        detail: requestMethod,
        outcome: "start",
      });
    }

    try {
      const response = await originalFetch(input, init);

      if (isAnalyzeRequest) {
        const observedLatencyMs = Date.now() - requestStartedAt;

        try {
          const clonedResponse = response.clone();
          if (response.status === 401) {
            recordAnalyzeTelemetry({
              outcome: "unauthorized",
              reason: "unauthorized",
              status: response.status,
            });
            return response;
          }

          const rawText = await clonedResponse.text();
          const rawJson = rawText ? (JSON.parse(rawText) as unknown) : {};

          const safeResponse = isRecord(rawJson) ? rawJson.safeResponse : undefined;
          const parsedSafeResponse = extractAnalyzeResponseSummary(safeResponse);

          if (!response.ok) {
            if (parsedSafeResponse) {
              recordAnalyzeTelemetry({
                ...parsedSafeResponse,
                outcome: "failure",
                reason: "safe fallback returned by backend",
                status: response.status,
              });
              return response;
            }

            recordAnalyzeTelemetry({
              outcome: "failure",
              reason: `HTTP ${response.status}`,
              status: response.status,
            });
            return response;
          }

          const parsedResponse = extractAnalyzeResponseSummary(rawJson);

          if (!parsedResponse) {
            recordAnalyzeTelemetry({
              outcome: "invalid-response",
              reason: "response did not match the expected Guide Pup schema",
              status: response.status,
            });
            return response;
          }

          recordAnalyzeTelemetry({
            ...parsedResponse,
            latencyMs: parsedResponse.latencyMs ?? observedLatencyMs,
            outcome: "success",
            status: response.status,
          });
        } catch (telemetryError) {
          recordAnalyzeTelemetry({
            outcome: "invalid-response",
            reason: telemetryError instanceof Error ? telemetryError.message : "Failed to parse analyze response",
            status: response.status,
          });
        }
      }

      return response;
    } catch (error) {
      if (isAnalyzeRequest) {
        recordAnalyzeTelemetry({
          outcome: isAbortError(error) ? "timeout" : "failure",
          reason: isAbortError(error) ? "request aborted" : error instanceof Error ? error.message : "network error",
          timeoutMs: isAbortError(error) ? appConfig.apiTimeoutMs : undefined,
        });
      }

      throw error;
    }
  }) as typeof fetch;

  globalObject[FETCH_PATCH_FLAG] = true;
}

export function setSentryTag(key: string, value?: string) {
  if (!sentryInitialized || !value) {
    return;
  }

  Sentry.setTag(key, value);
}

export function addBreadcrumb(breadcrumb: BreadcrumbInput) {
  if (!sentryInitialized) {
    return;
  }

  Sentry.addBreadcrumb(sanitizeBreadcrumb(breadcrumb));
}

export function captureAppError(error: unknown, context: ErrorContext = {}) {
  const message = error instanceof Error ? error.message : String(error);

  console.error("[GuidePupError]", {
    context: sanitizeValue(context),
    message,
  });

  if (!sentryInitialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setContext("guidepup", sanitizeValue(context) as Record<string, unknown>);

    const route = typeof context.route === "string" ? context.route : undefined;
    if (route) {
      scope.setTag("route", route);
    }

    Sentry.captureException(error);
  });
}
