import { requireOptionalNativeModule } from "expo";
import type { CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";
import { AccessibilityInfo, Platform } from "react-native";

import type { AnalyzeFrameInput } from "@/src/logic/VisionAI";

export type GuidePupNavigationCoreExecutionPath = "native-core" | "js-fallback";
export type GuidePupNavigationCoreSessionState = "idle" | "running" | "paused" | "stopped";
export type GuidePupNavigationCoreHapticType = "stop" | "left" | "right" | "forward" | "error" | "success";

export interface GuidePupNavigationCoreStartOptions {
  preferredCamera?: "back";
}

export interface GuidePupNavigationCoreCaptureOptions {
  cameraRef?: CameraView | null;
  compressionQuality?: number;
  forceFallback?: boolean;
  maxDimension?: number;
}

export interface GuidePupNavigationCoreCaptureResult extends AnalyzeFrameInput {
  captureLatencyMs?: number;
  executionPath: GuidePupNavigationCoreExecutionPath;
  timestampMs: number;
}

export interface GuidePupNavigationCoreState {
  available: boolean;
  lastCaptureLatencyMs?: number;
  lastError?: string | null;
  permissionStatus?: string;
  sessionActive: boolean;
  sessionState: GuidePupNavigationCoreSessionState;
  voiceOverRunning?: boolean;
}

interface GuidePupNavigationCoreNativeModule {
  announce(message: string): Promise<void>;
  captureFrame(): Promise<Omit<GuidePupNavigationCoreCaptureResult, "executionPath">>;
  getState(): Promise<GuidePupNavigationCoreState>;
  isAvailable(): Promise<boolean>;
  playHaptic(type: GuidePupNavigationCoreHapticType): Promise<void>;
  startSession(options?: GuidePupNavigationCoreStartOptions): Promise<GuidePupNavigationCoreState>;
  stopSession(): Promise<GuidePupNavigationCoreState>;
}

const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<GuidePupNavigationCoreNativeModule>("GuidePupNavigationCore")
    : null;

const fallbackState: GuidePupNavigationCoreState = {
  available: false,
  lastError: null,
  permissionStatus: Platform.OS === "ios" ? "unknown" : "unsupported",
  sessionActive: false,
  sessionState: "idle",
  voiceOverRunning: false,
};

function getExecutionPath(): GuidePupNavigationCoreExecutionPath {
  return nativeModule ? "native-core" : "js-fallback";
}

async function captureFrame(
  options?: GuidePupNavigationCoreCaptureOptions,
): Promise<GuidePupNavigationCoreCaptureResult> {
  if (nativeModule && !options?.forceFallback) {
    const captured = await nativeModule.captureFrame();
    return {
      ...captured,
      executionPath: "native-core",
    };
  }

  const cameraRef = options?.cameraRef ?? null;
  if (!cameraRef) {
    fallbackState.lastError = "Camera session is unavailable.";
    throw new Error("Camera session is unavailable.");
  }

  const startedAt = Date.now();
  const photo = await cameraRef.takePictureAsync({
    quality: options?.compressionQuality ?? 0.4,
    skipProcessing: true,
  });

  if (!photo?.uri && !photo?.base64) {
    fallbackState.lastError = "Guide Pup could not read a camera frame.";
    throw new Error("Guide Pup could not read a camera frame.");
  }

  const captureLatencyMs = Date.now() - startedAt;
  fallbackState.lastCaptureLatencyMs = captureLatencyMs;
  fallbackState.lastError = null;

  return {
    base64: photo.base64,
    captureLatencyMs,
    executionPath: "js-fallback",
    height: photo.height,
    timestampMs: Date.now(),
    uri: photo.uri,
    width: photo.width,
  };
}

async function startSession(options?: GuidePupNavigationCoreStartOptions) {
  if (nativeModule) {
    return nativeModule.startSession(options);
  }

  fallbackState.available = false;
  fallbackState.lastError = null;
  fallbackState.sessionActive = true;
  fallbackState.sessionState = "running";
  return fallbackState;
}

async function stopSession() {
  if (nativeModule) {
    return nativeModule.stopSession();
  }

  fallbackState.sessionActive = false;
  fallbackState.sessionState = "stopped";
  return fallbackState;
}

async function announce(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }

  if (nativeModule) {
    await nativeModule.announce(trimmed);
    return;
  }

  if (Platform.OS === "ios") {
    await AccessibilityInfo.announceForAccessibility(trimmed);
  }
}

async function playHaptic(type: GuidePupNavigationCoreHapticType) {
  if (nativeModule) {
    await nativeModule.playHaptic(type);
    return;
  }

  if (type === "stop" || type === "error") {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return;
  }

  if (type === "success") {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return;
  }

  if (type === "left") {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return;
  }

  if (type === "right") {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return;
  }

  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

async function getState(): Promise<GuidePupNavigationCoreState> {
  if (nativeModule) {
    return nativeModule.getState();
  }

  return fallbackState;
}

async function isAvailable() {
  if (nativeModule) {
    return nativeModule.isAvailable();
  }

  return false;
}

export const GuidePupNavigationCore = {
  announce,
  captureFrame,
  getState,
  implementation: getExecutionPath(),
  isAvailable,
  isNativeAvailable() {
    return Boolean(nativeModule);
  },
  playHaptic,
  startSession,
  stopSession,
};
