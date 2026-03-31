import { z } from "zod";

const RawConfigSchema = z.object({
  apiBaseUrl: z.string().optional(),
  apiTimeoutMs: z.string().optional(),
  appEnv: z.string().optional(),
  emergencyDisclaimer: z.string().optional(),
  enableExperimentalTabs: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  sentryDsn: z.string().optional(),
  supportUrl: z.string().optional(),
});

const rawConfig = RawConfigSchema.parse({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  apiTimeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  emergencyDisclaimer: process.env.EXPO_PUBLIC_EMERGENCY_DISCLAIMER,
  enableExperimentalTabs: process.env.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS,
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL,
});

const trimToUndefined = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const parseTimeout = (value?: string) => {
  const parsed = Number.parseInt(value || "10000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
};

export const appConfig = {
  apiBaseUrl: trimToUndefined(rawConfig.apiBaseUrl)?.replace(/\/+$/g, "") || "",
  apiTimeoutMs: parseTimeout(rawConfig.apiTimeoutMs),
  appEnv: trimToUndefined(rawConfig.appEnv) || (__DEV__ ? "development" : "production"),
  emergencyDisclaimer:
    trimToUndefined(rawConfig.emergencyDisclaimer) || "TODO_EMERGENCY_SAFETY_DISCLAIMER",
  enableExperimentalTabs: rawConfig.enableExperimentalTabs === "true",
  privacyPolicyUrl: trimToUndefined(rawConfig.privacyPolicyUrl) || "TODO_PRIVACY_POLICY_URL",
  sentryDsn: trimToUndefined(rawConfig.sentryDsn),
  supportUrl: trimToUndefined(rawConfig.supportUrl) || "TODO_SUPPORT_URL",
};

export function requireApiBaseUrl() {
  if (!appConfig.apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured.");
  }

  return appConfig.apiBaseUrl;
}
