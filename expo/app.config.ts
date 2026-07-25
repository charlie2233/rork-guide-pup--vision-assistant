import type { ConfigContext, ExpoConfig } from "expo/config";

const { launchInputs } = require("./release/launch-inputs.js") as {
  launchInputs: {
    iosBundleIdentifier: string;
  };
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

  return {
    ...resolvedConfig,
    ios: {
      ...resolvedConfig.ios,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
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
