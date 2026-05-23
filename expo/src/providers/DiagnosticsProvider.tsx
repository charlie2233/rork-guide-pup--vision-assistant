import Constants from "expo-constants";
import { Camera } from "expo-camera";
import React, { useEffect } from "react";
import { AppState } from "react-native";

import { appConfig } from "@/src/lib/config";
import {
  getDiagnosticsSnapshot,
  recordNavigationLoopSnapshot,
  recordCameraPermissionSnapshot,
  recordSessionBootstrapState,
  recordVoiceSnapshot,
  setDiagnosticsRuntime,
} from "@/src/lib/diagnostics";
import { getStoredDeviceSession } from "@/src/lib/device";
import { GuidePupNavigationCore } from "@/src/native/GuidePupNavigationCore";
import { GuidePupVoiceControl } from "@/src/native/GuidePupVoiceControl";

async function refreshDiagnosticsSnapshots() {
  const [cameraPermission, navigationCoreState, session, voiceState] = await Promise.all([
    Camera.getCameraPermissionsAsync().catch(() => null),
    GuidePupNavigationCore.getState().catch(() => null),
    getStoredDeviceSession().catch(() => null),
    GuidePupVoiceControl.getState().catch(() => null),
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

  if (navigationCoreState) {
    const currentNavigationLoop = getDiagnosticsSnapshot().navigationLoop;
    recordNavigationLoopSnapshot({
      available: GuidePupNavigationCore.isNativeAvailable(),
      executionPath: currentNavigationLoop.executionPath,
      lastCaptureLatencyMs: navigationCoreState.lastCaptureLatencyMs,
      lastError: navigationCoreState.lastError ?? undefined,
      sessionActive: navigationCoreState.sessionActive,
      voiceOverRunning: navigationCoreState.voiceOverRunning,
    });
  }

  if (voiceState) {
    recordVoiceSnapshot({
      available: GuidePupVoiceControl.isNativeModuleAvailable(),
      executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
      lastError: voiceState.lastError ?? undefined,
      listening: voiceState.listening,
      microphonePermission: voiceState.microphonePermission,
      speaking: voiceState.speaking,
      speechPermission: voiceState.speechPermission,
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
    releaseTrack: appConfig.releaseTrack,
    sentryEnabled: Boolean(appConfig.sentryDsn),
    slug: expoConfig?.slug,
    supportEmail: appConfig.supportEmail,
    supportUrl: appConfig.supportUrl,
    websiteUrl: appConfig.websiteUrl,
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
