import { sanitizePrivacyString, sanitizePrivacyValue } from "./privacySanitizer";

type ErrorContext = Record<string, unknown>;

type BreadcrumbInput = {
  category?: string;
  data?: Record<string, unknown>;
  level?: "debug" | "info" | "warning" | "error" | "fatal" | "log";
  message?: string;
  type?: string;
};

// Launch diagnostics stay on-device. The shipping client intentionally embeds
// no crash-reporting SDK; these helpers preserve bounded local call sites.
export function addBreadcrumb(_breadcrumb: BreadcrumbInput) {}

export function setDiagnosticTag(_key: string, _value?: string) {}

export function captureAppError(error: unknown, context: ErrorContext = {}) {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitizedMessage = sanitizePrivacyString(rawMessage) || "Guide Pup encountered an error.";
  const sanitizedContext = sanitizePrivacyValue(context) as Record<string, unknown>;

  if (__DEV__) {
    console.error("[GuidePupError]", {
      context: sanitizedContext,
      message: sanitizedMessage,
    });
  }
}
