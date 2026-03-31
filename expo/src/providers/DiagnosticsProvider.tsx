import Constants from "expo-constants";
import { Camera } from "expo-camera";
import React, { useEffect } from "react";
import { AppState } from "react-native";

import { appConfig } from "@/src/lib/config";
import {
  recordCameraPermissionSnapshot,
  recordSessionBootstrapState,
  setDiagnosticsRuntime,
} from "@/src/lib/diagnostics";
import { getStoredDeviceSession } from "@/src/lib/device";

async function refreshDiagnosticsSnapshots() {
  const [cameraPermission, session] = await Promise.all([
    Camera.getCameraPermissionsAsync().catch(() => null),
    getStoredDeviceSession().catch(() => null),
  ]);

  if (cameraPermission) {
    recordCameraPermissionSnapshot({
      canAskAgain: cameraPermission.canAskAgain,
      expires: cameraPermission.expires,
      granted: cameraPermission.granted,
      status: cameraPermission.status,
    });
  }

  if (session) {
    recordSessionBootstrapState({
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
      status: "ready",
    });
  }
}

function initializeRuntimeMetadata() {
  const expoConfig = Constants.expoConfig;

  setDiagnosticsRuntime({
    apiBaseUrl: appConfig.apiBaseUrl,
    appEnv: appConfig.appEnv,
    appName: expoConfig?.name || "Guide Pup",
    appVersion: expoConfig?.version || undefined,
    buildVersion: expoConfig?.ios?.buildNumber || String(expoConfig?.android?.versionCode || ""),
    bundleIdentifier: expoConfig?.ios?.bundleIdentifier || expoConfig?.android?.package || undefined,
    emergencyDisclaimer: appConfig.emergencyDisclaimer,
    experimentalTabsEnabled: appConfig.enableExperimentalTabs,
    privacyPolicyUrl: appConfig.privacyPolicyUrl,
    sentryEnabled: Boolean(appConfig.sentryDsn),
    slug: expoConfig?.slug,
    supportUrl: appConfig.supportUrl,
  });
}

export function DiagnosticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initializeRuntimeMetadata();
    void refreshDiagnosticsSnapshots();

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refreshDiagnosticsSnapshots();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return <>{children}</>;
}
