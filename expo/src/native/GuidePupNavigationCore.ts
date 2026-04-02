import { AccessibilityInfo, NativeModules, Platform } from "react-native";
import type { CameraView } from "expo-camera";
import * as Haptics from "expo-haptics";

import type { AnalyzeFrameInput } from "@/src/logic/VisionAI";

export type GuidePupNavigationSessionState = "idle" | "running" | "paused" | "stopped";
export type GuidePupNavigationDirection = "turn-left" | "turn-right" | "forward" | "stop";

export interface GuidePupGuidanceCue {
  direction: GuidePupNavigationDirection;
  obstacle: boolean;
}

interface NativeCaptureResult {
  base64?: string;
  height?: number;
  uri?: string;
  width?: number;
}

interface GuidePupNavigationCoreNativeModule {
  announceForVoiceOver?: (message: string) => Promise<void> | void;
  captureFrame?: () => Promise<NativeCaptureResult> | NativeCaptureResult;
  emitGuidanceCue?: (cue: GuidePupGuidanceCue) => Promise<void> | void;
  setCameraSessionState?: (state: GuidePupNavigationSessionState) => Promise<void> | void;
}

const nativeModule = NativeModules.GuidePupNavigationCore as
  | GuidePupNavigationCoreNativeModule
  | undefined;

function hasNativeImplementation() {
  return Boolean(nativeModule);
}

async function captureFrame(cameraRef: CameraView | null): Promise<AnalyzeFrameInput> {
  if (nativeModule?.captureFrame) {
    const captured = await nativeModule.captureFrame();
    if (captured.uri || captured.base64) {
      return captured;
    }
  }

  if (!cameraRef) {
    throw new Error("Camera session is unavailable.");
  }

  const photo = await cameraRef.takePictureAsync({
    quality: 0.4,
    skipProcessing: true,
  });

  if (!photo?.uri && !photo?.base64) {
    throw new Error("Guide Pup could not read a camera frame.");
  }

  return {
    base64: photo.base64,
    height: photo.height,
    uri: photo.uri,
    width: photo.width,
  };
}

async function emitGuidanceCue(cue: GuidePupGuidanceCue) {
  if (nativeModule?.emitGuidanceCue) {
    await nativeModule.emitGuidanceCue(cue);
    return;
  }

  if (cue.obstacle || cue.direction === "stop") {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    return;
  }

  if (cue.direction === "turn-left") {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    return;
  }

  if (cue.direction === "turn-right") {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return;
  }

  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

async function announceForVoiceOver(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }

  if (nativeModule?.announceForVoiceOver) {
    await nativeModule.announceForVoiceOver(trimmed);
    return;
  }

  if (Platform.OS === "ios") {
    await AccessibilityInfo.announceForAccessibility(trimmed);
  }
}

async function setCameraSessionState(state: GuidePupNavigationSessionState) {
  if (nativeModule?.setCameraSessionState) {
    await nativeModule.setCameraSessionState(state);
  }
}

export const GuidePupNavigationCore = {
  announceForVoiceOver,
  captureFrame,
  emitGuidanceCue,
  implementation: hasNativeImplementation() ? ("native" as const) : ("js-fallback" as const),
  isNativeAvailable: hasNativeImplementation,
  setCameraSessionState,
};
