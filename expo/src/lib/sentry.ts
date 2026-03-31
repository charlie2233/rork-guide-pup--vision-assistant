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

let sentryInitialized = false;

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

function applyRuntimeTags() {
  const { buildNumber, release, version } = getReleaseMetadata();
  const expoConfig = Constants.expoConfig;
  const extra = expoConfig?.extra as Record<string, unknown> | undefined;

  Sentry.setTag("app.environment", appConfig.appEnv);
  Sentry.setTag("app.platform", Platform.OS);

  if (release) {
    Sentry.setTag("app.release", release);
  }

  if (buildNumber) {
    Sentry.setTag("app.dist", buildNumber);
  }

  if (version) {
    Sentry.setTag("app.version", version);
  }

  if (expoConfig?.name) {
    Sentry.setTag("expo.name", expoConfig.name);
  }

  if (expoConfig?.slug) {
    Sentry.setTag("expo.slug", expoConfig.slug);
  }

  if (expoConfig?.runtimeVersion) {
    Sentry.setTag("expo.runtimeVersion", String(expoConfig.runtimeVersion));
  }

  if (extra && typeof extra === "object") {
    Sentry.setContext("expo", sanitizeValue(extra) as Record<string, unknown>);
  }
}

export function initializeSentry() {
  if (sentryInitialized || !appConfig.sentryDsn) {
    return sentryInitialized;
  }

  const { buildNumber, release } = getReleaseMetadata();

  Sentry.init({
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
    enableAutoSessionTracking: true,
    enableNative: true,
    environment: appConfig.appEnv,
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
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

  Sentry.addBreadcrumb({
    ...breadcrumb,
    data: breadcrumb.data ? (sanitizeValue(breadcrumb.data) as Record<string, unknown>) : undefined,
  });
}

export function captureAppError(error: unknown, context: ErrorContext = {}) {
  const message = error instanceof Error ? error.message : String(error);

  console.error("[GuidePupError]", {
    context,
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
