import type { ConfigContext, ExpoConfig } from "expo/config";

const appJson = require("./app.json") as { expo: ExpoConfig };

const DEFAULT_DEV_IOS_BUNDLE_IDENTIFIER = "app.rork.guide-pup-vision-assist";
const DEFAULT_DEV_ANDROID_PACKAGE = "dev.guidepup.visionassist";

function withDevFallback(value: string | undefined, fallback: string) {
  if (!value || value.startsWith("TODO_")) {
    return fallback;
  }

  return value;
}

export default function appConfig(_context: ConfigContext): ExpoConfig {
  const config = appJson.expo;

  return {
    ...config,
    ios: {
      ...config.ios,
      bundleIdentifier: withDevFallback(
        process.env.IOS_BUNDLE_IDENTIFIER ?? config.ios?.bundleIdentifier,
        DEFAULT_DEV_IOS_BUNDLE_IDENTIFIER,
      ),
    },
    android: {
      ...config.android,
      package: withDevFallback(
        process.env.ANDROID_PACKAGE ?? config.android?.package,
        DEFAULT_DEV_ANDROID_PACKAGE,
      ),
    },
  };
}
