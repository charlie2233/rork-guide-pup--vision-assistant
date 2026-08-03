import type { ConfigContext, ExpoConfig } from "expo/config";

const { launchInputs } = require("./release/launch-inputs.js") as {
  launchInputs: {
    appleTeamId: string;
    ascAppId: string;
    iosBuildNumber: string;
    iosBundleIdentifier: string;
    iosMarketingVersion: string;
  };
};
const {
  createGuidePupCandidateBinding,
  resolveGuidePupSourceRevision,
} = require("./release/release-binding.js") as {
  createGuidePupCandidateBinding(input: {
    appVersion: string;
    buildNumber: string;
    bundleIdentifier: string;
    releaseBinding: Record<string, unknown>;
    sourceRevision: string;
    teamIdentifier: string;
  }): Record<string, unknown>;
  resolveGuidePupSourceRevision(options: {
    cwd: string;
  }): string;
};

const DEFAULT_DEV_ANDROID_PACKAGE = "dev.guidepup.visionassist";

function withDevFallback(value: string | undefined, fallback: string) {
  if (!value || value.startsWith("TODO_")) {
    return fallback;
  }

  return value;
}

export default function appConfig({ config }: ConfigContext): ExpoConfig {
  const resolvedConfig = config as ExpoConfig;
  const releaseTrack = process.env.EXPO_PUBLIC_RELEASE_TRACK?.trim();
  const releaseBinding = releaseTrack
    ? {
        apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "",
        appEnv: process.env.EXPO_PUBLIC_APP_ENV?.trim() || "",
        experimentalTabsEnabled:
          process.env.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS?.trim().toLowerCase() === "true",
        privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL?.trim() || "",
        releaseTrack,
        schemaVersion: 1,
        supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL?.trim() || "",
        websiteUrl: process.env.EXPO_PUBLIC_WEBSITE_URL?.trim() || "",
      }
    : undefined;
  const candidateBinding = releaseBinding
    ? createGuidePupCandidateBinding({
        appVersion: resolvedConfig.version || launchInputs.iosMarketingVersion,
        buildNumber: resolvedConfig.ios?.buildNumber || launchInputs.iosBuildNumber,
        bundleIdentifier: launchInputs.iosBundleIdentifier,
        releaseBinding,
        sourceRevision: resolveGuidePupSourceRevision({ cwd: __dirname }),
        teamIdentifier: launchInputs.appleTeamId,
      })
    : undefined;

  return {
    ...resolvedConfig,
    extra: {
      ...resolvedConfig.extra,
      guidePupCandidateBinding: candidateBinding,
      guidePupReleaseBinding: releaseBinding,
      guidePupReleaseTrackMarker: releaseTrack
        ? `guidepup-release-track:${releaseTrack}`
        : undefined,
    },
    ios: {
      ...resolvedConfig.ios,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
      infoPlist: {
        ...resolvedConfig.ios?.infoPlist,
        GuidePupAppStoreConnectAppID: launchInputs.ascAppId,
        GuidePupExpectedBuildNumber: launchInputs.iosBuildNumber,
      },
    },
    android: {
      ...resolvedConfig.android,
      package: withDevFallback(
        process.env.ANDROID_PACKAGE ?? resolvedConfig.android?.package,
        DEFAULT_DEV_ANDROID_PACKAGE,
      ),
    },
  };
}
