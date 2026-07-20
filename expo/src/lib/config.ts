import Constants from "expo-constants";
import { z } from "zod";

type LaunchSentryMode = "disabled" | "enabled";

const RawConfigSchema = z.object({
  apiBaseUrl: z.string().optional(),
  apiTimeoutMs: z.string().optional(),
  appEnv: z.string().optional(),
  emergencyDisclaimer: z.string().optional(),
  enableExperimentalTabs: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  releaseTrack: z.string().optional(),
  sentryDsn: z.string().optional(),
  supportEmail: z.string().optional(),
  supportUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
});

const rawConfig = RawConfigSchema.parse({
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  apiTimeoutMs: process.env.EXPO_PUBLIC_API_TIMEOUT_MS,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  emergencyDisclaimer: process.env.EXPO_PUBLIC_EMERGENCY_DISCLAIMER,
  enableExperimentalTabs: process.env.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS,
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  releaseTrack: process.env.EXPO_PUBLIC_RELEASE_TRACK,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL,
  supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL,
  websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL,
});

const trimToUndefined = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const launchSentryMode: LaunchSentryMode =
  Constants.expoConfig?.extra?.launchSentryMode === "enabled" ? "enabled" : "disabled";

export const resolveSentryDsn = (mode: LaunchSentryMode, value?: string) => {
  return mode === "enabled" ? trimToUndefined(value) : undefined;
};

const trimConfiguredValue = (value?: string) => {
  const trimmed = trimToUndefined(value);
  if (!trimmed || trimmed.startsWith("TODO_")) {
    return undefined;
  }

  return trimmed;
};

const parseTimeout = (value?: string) => {
  const parsed = Number.parseInt(value || "10000", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
};

export const isConfiguredUrl = (value?: string) => {
  return Boolean(trimConfiguredValue(value));
};

const websiteUrl = trimConfiguredValue(rawConfig.websiteUrl)?.replace(/\/+$/g, "");
const derivedPublicPageUrl = (pathname: string) => (websiteUrl ? `${websiteUrl}${pathname}` : undefined);
const supportEmail = trimConfiguredValue(rawConfig.supportEmail);

export const appConfig = {
  apiBaseUrl: trimConfiguredValue(rawConfig.apiBaseUrl)?.replace(/\/+$/g, "") || "",
  apiTimeoutMs: parseTimeout(rawConfig.apiTimeoutMs),
  appEnv: trimToUndefined(rawConfig.appEnv) || (__DEV__ ? "development" : "production"),
  emergencyDisclaimer:
    trimConfiguredValue(rawConfig.emergencyDisclaimer) ||
    "Guide Pup provides assistive guidance and safe fallback behavior, but it does not guarantee hazard detection. If you are in immediate danger, stop and contact local emergency services or nearby people directly.",
  enableExperimentalTabs: rawConfig.enableExperimentalTabs === "true",
  privacyPolicyUrl: trimConfiguredValue(rawConfig.privacyPolicyUrl) || derivedPublicPageUrl("/privacy"),
  releaseTrack: trimToUndefined(rawConfig.releaseTrack) || (__DEV__ ? "development-client" : "app-store"),
  safetyUrl: derivedPublicPageUrl("/safety"),
  sentryDsn: resolveSentryDsn(launchSentryMode, rawConfig.sentryDsn),
  supportEmail,
  supportUrl:
    trimConfiguredValue(rawConfig.supportUrl) ||
    derivedPublicPageUrl("/support") ||
    (supportEmail ? `mailto:${supportEmail}` : undefined),
  websiteUrl,
};

export function requireApiBaseUrl() {
  if (!appConfig.apiBaseUrl) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL is not configured.");
  }

  return appConfig.apiBaseUrl;
}
