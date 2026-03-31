import { appConfig } from "./config";

type ErrorContext = Record<string, unknown>;

export function initializeSentry() {
  if (!appConfig.sentryDsn) {
    return;
  }

  console.log("[Sentry] EXPO_PUBLIC_SENTRY_DSN configured. Replace this lightweight scaffold with @sentry/react-native before launch.");
}

export async function captureAppError(error: unknown, context: ErrorContext = {}) {
  const message = error instanceof Error ? error.message : String(error);

  console.error("[GuidePupError]", {
    context,
    message,
  });

  if (appConfig.sentryDsn) {
    console.log("[Sentry] TODO: forward client errors with the official Expo / React Native SDK.", context);
  }
}
