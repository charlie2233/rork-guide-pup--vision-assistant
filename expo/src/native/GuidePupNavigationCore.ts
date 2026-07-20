import { requireOptionalNativeModule } from "expo";
import type { CameraView } from "expo-camera";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImageManipulator from "expo-image-manipulator";
import { AccessibilityInfo, Platform } from "react-native";

import { recordAudioCueSnapshot, recordHapticSnapshot } from "@/src/lib/diagnostics";
import type { AnalyzeFrameInput } from "@/src/logic/VisionAI";

export type GuidePupNavigationCoreExecutionPath = "native-core" | "js-fallback";
export type GuidePupNavigationCoreSessionState = "idle" | "running" | "paused" | "stopped";
export type GuidePupNavigationCoreRecoveryState =
  | "idle"
  | "recovering"
  | "interrupted"
  | "background"
  | "exhausted";
export type GuidePupNavigationCoreHapticType = "stop" | "left" | "right" | "forward" | "error" | "success";
export type GuidePupNavigationCoreAudioCueType = GuidePupNavigationCoreHapticType;

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
  pendingFrameCleanupCount?: number;
  permissionStatus?: string;
  recoveryState?: GuidePupNavigationCoreRecoveryState;
  sessionActive: boolean;
  sessionState: GuidePupNavigationCoreSessionState;
  voiceOverRunning?: boolean;
}

export type GuidePupNavigationCoreStateEvent = Pick<
  GuidePupNavigationCoreState,
  "lastError" | "recoveryState" | "sessionActive" | "sessionState"
>;

interface GuidePupNavigationCoreNativeModule {
  addListener(
    eventName: "onStateChanged",
    listener: (event: GuidePupNavigationCoreStateEvent) => void,
  ): { remove(): void };
  announce(message: string, ownerToken: string): Promise<void>;
  cancelAnnouncement(ownerToken: string): Promise<void>;
  claimAnnouncementOwner(ownerToken: string): Promise<void>;
  captureFrame(): Promise<Omit<GuidePupNavigationCoreCaptureResult, "executionPath">>;
  getState(): Promise<GuidePupNavigationCoreState>;
  interruptAllAnnouncements(): Promise<void>;
  isAvailable(): Promise<boolean>;
  playAudioCue(type: GuidePupNavigationCoreAudioCueType): Promise<void>;
  playHaptic(type: GuidePupNavigationCoreHapticType): Promise<void>;
  releaseAnnouncementOwner(ownerToken: string): Promise<void>;
  startSession(options?: GuidePupNavigationCoreStartOptions): Promise<GuidePupNavigationCoreState>;
  stopSession(): Promise<GuidePupNavigationCoreState>;
  supersedeAnnouncement(message: string, ownerToken: string): Promise<void>;
}

const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<GuidePupNavigationCoreNativeModule>("GuidePupNavigationCore")
    : null;

const fallbackState: GuidePupNavigationCoreState = {
  available: false,
  lastError: null,
  pendingFrameCleanupCount: 0,
  permissionStatus: Platform.OS === "ios" ? "unknown" : "unsupported",
  recoveryState: "idle",
  sessionActive: false,
  sessionState: "idle",
  voiceOverRunning: false,
};

let fallbackAnnouncementOwnerToken: string | null = null;
let announcementOwnerSequence = 0;

export function createGuidePupAnnouncementOwnerToken(scope: string) {
  announcementOwnerSequence += 1;
  return `${scope}-${Date.now().toString(36)}-${announcementOwnerSequence.toString(36)}`;
}

function getExecutionPath(): GuidePupNavigationCoreExecutionPath {
  return nativeModule ? "native-core" : "js-fallback";
}

const pendingTemporaryFrameCleanup = new Set<string>();
const MAX_FRAME_CLEANUP_ATTEMPTS = 2;

function tryDeleteTemporaryFile(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
    return true;
  } catch {
    return false;
  }
}

function retryPendingTemporaryFrameCleanup() {
  for (let attempt = 0; attempt < MAX_FRAME_CLEANUP_ATTEMPTS && pendingTemporaryFrameCleanup.size > 0; attempt += 1) {
    for (const uri of [...pendingTemporaryFrameCleanup]) {
      if (tryDeleteTemporaryFile(uri)) {
        pendingTemporaryFrameCleanup.delete(uri);
      }
    }
  }

  fallbackState.pendingFrameCleanupCount = pendingTemporaryFrameCleanup.size;
  return pendingTemporaryFrameCleanup.size === 0;
}

function deleteTemporaryFiles(uris: Iterable<string | undefined>) {
  for (const uri of new Set(uris)) {
    if (uri?.startsWith("file://")) {
      pendingTemporaryFrameCleanup.add(uri);
    }
  }

  return retryPendingTemporaryFrameCleanup();
}

const CAMERA_FRAME_READ_ERROR = "Guide Pup could not read a camera frame.";
const CAMERA_FRAME_ENCODE_ERROR = "Guide Pup could not encode a camera frame.";
const CAMERA_FRAME_CAPTURE_ERROR = "Guide Pup could not capture a camera frame.";
const CAMERA_FRAME_CLEANUP_ERROR = "Guide Pup could not remove a temporary camera frame.";

class GuidePupFallbackCaptureError extends Error {}

function fallbackCaptureError(message: string) {
  return new GuidePupFallbackCaptureError(message);
}

function resizeActionForFrame(width: number | undefined, height: number | undefined, maxDimension: number) {
  if (!width || !height || Math.max(width, height) <= maxDimension) {
    return [];
  }

  return width >= height
    ? [{ resize: { width: maxDimension } }]
    : [{ resize: { height: maxDimension } }];
}

async function captureFrame(
  options?: GuidePupNavigationCoreCaptureOptions,
): Promise<GuidePupNavigationCoreCaptureResult> {
  if (nativeModule && !options?.forceFallback) {
    const captured = await nativeModule.captureFrame();
    return {
      ...captured,
      executionPath: "native-core",
      source: "native-core",
    };
  }

  const cameraRef = options?.cameraRef ?? null;
  if (!cameraRef) {
    fallbackState.lastError = "Camera session is unavailable.";
    throw new Error("Camera session is unavailable.");
  }

  const startedAt = Date.now();
  let originalUri: string | undefined;
  let manipulatedUri: string | undefined;
  retryPendingTemporaryFrameCleanup();

  try {
    const photo = await cameraRef.takePictureAsync({
      base64: true,
      quality: options?.compressionQuality ?? 0.4,
      skipProcessing: true,
    });
    originalUri = photo?.uri;

    if (!photo?.uri && !photo?.base64) {
      throw fallbackCaptureError(CAMERA_FRAME_READ_ERROR);
    }

    let base64 = photo.base64;
    let height = photo.height;
    let width = photo.width;

    if (photo.uri) {
      const requestedMaxDimension = options?.maxDimension ?? 768;
      const maxDimension = Number.isFinite(requestedMaxDimension) && requestedMaxDimension > 0
        ? requestedMaxDimension
        : 768;
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        resizeActionForFrame(photo.width, photo.height, maxDimension),
        {
          base64: true,
          compress: options?.compressionQuality ?? 0.4,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      manipulatedUri = manipulated.uri;
      base64 = manipulated.base64;
      height = manipulated.height;
      width = manipulated.width;
    }

    if (!base64) {
      throw fallbackCaptureError(CAMERA_FRAME_ENCODE_ERROR);
    }

    const captureLatencyMs = Date.now() - startedAt;
    fallbackState.lastCaptureLatencyMs = captureLatencyMs;
    fallbackState.lastError = null;

    return {
      base64,
      captureLatencyMs,
      executionPath: "js-fallback",
      height,
      source: "js-fallback",
      timestampMs: startedAt,
      width,
    };
  } catch (error) {
    const message = error instanceof GuidePupFallbackCaptureError
      ? error.message
      : CAMERA_FRAME_CAPTURE_ERROR;
    fallbackState.lastError = message;
    throw new Error(message);
  } finally {
    const cleanupComplete = deleteTemporaryFiles([manipulatedUri, originalUri]);
    if (!cleanupComplete && fallbackState.lastError === null) {
      fallbackState.lastError = CAMERA_FRAME_CLEANUP_ERROR;
    }
  }
}

async function startSession(options?: GuidePupNavigationCoreStartOptions) {
  if (nativeModule) {
    return nativeModule.startSession(options);
  }

  fallbackState.available = false;
  fallbackState.lastError = retryPendingTemporaryFrameCleanup()
    ? null
    : CAMERA_FRAME_CLEANUP_ERROR;
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
  if (!retryPendingTemporaryFrameCleanup()) {
    fallbackState.lastError = CAMERA_FRAME_CLEANUP_ERROR;
  } else if (fallbackState.lastError === CAMERA_FRAME_CLEANUP_ERROR) {
    fallbackState.lastError = null;
  }
  return fallbackState;
}

async function claimAnnouncementOwner(ownerToken: string) {
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }

  fallbackAnnouncementOwnerToken = trimmedOwnerToken;
  if (nativeModule) {
    await nativeModule.claimAnnouncementOwner(trimmedOwnerToken).catch(() => undefined);
  }
}

async function releaseAnnouncementOwner(ownerToken: string) {
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }

  if (fallbackAnnouncementOwnerToken === trimmedOwnerToken) {
    fallbackAnnouncementOwnerToken = null;
  }
  if (nativeModule) {
    await nativeModule.releaseAnnouncementOwner(trimmedOwnerToken).catch(() => undefined);
  }
}

async function announce(message: string, ownerToken: string) {
  const trimmed = message.trim();
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmed || !trimmedOwnerToken) {
    return;
  }

  if (nativeModule) {
    try {
      await nativeModule.announce(trimmed, trimmedOwnerToken);
      return;
    } catch {
      // Fall through to the JS accessibility path if the native bridge rejects.
    }
  }

  if (Platform.OS === "ios" && fallbackAnnouncementOwnerToken === trimmedOwnerToken) {
    await AccessibilityInfo.announceForAccessibility(trimmed);
  }
}

async function cancelAnnouncement(ownerToken: string) {
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }

  if (nativeModule) {
    await nativeModule.cancelAnnouncement(trimmedOwnerToken).catch(() => undefined);
    return;
  }

  if (Platform.OS === "ios" && fallbackAnnouncementOwnerToken === trimmedOwnerToken) {
    AccessibilityInfo.announceForAccessibilityWithOptions("\u200B", { queue: false });
  }
}

async function interruptAllAnnouncements() {
  if (nativeModule) {
    await nativeModule.interruptAllAnnouncements().catch(() => undefined);
    return;
  }

  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibilityWithOptions("\u200B", { queue: false });
  }
}

async function supersedeAnnouncement(message: string, ownerToken: string) {
  const trimmed = message.trim();
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }
  if (!trimmed) {
    await cancelAnnouncement(trimmedOwnerToken);
    return;
  }

  if (nativeModule) {
    try {
      await nativeModule.supersedeAnnouncement(trimmed, trimmedOwnerToken);
      return;
    } catch {
      // Fall through to the single JS accessibility channel.
    }
  }

  if (Platform.OS === "ios" && fallbackAnnouncementOwnerToken === trimmedOwnerToken) {
    AccessibilityInfo.announceForAccessibilityWithOptions(trimmed, { queue: false });
  }
}

async function playFallbackHaptic(type: GuidePupNavigationCoreHapticType) {
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

async function playHaptic(type: GuidePupNavigationCoreHapticType) {
  recordHapticSnapshot({ type });

  if (nativeModule) {
    try {
      await nativeModule.playHaptic(type);
      recordHapticSnapshot({ executionPath: "native-core", outcome: "success", type });
      return;
    } catch {
      // Fall through to the JS haptics fallback if the native bridge rejects.
    }
  }

  try {
    await playFallbackHaptic(type);
    recordHapticSnapshot({ executionPath: "js-fallback", outcome: "success", type });
  } catch (error) {
    recordHapticSnapshot({
      error: error instanceof Error ? error.message : "Haptic feedback failed.",
      executionPath: "js-fallback",
      outcome: "failure",
      type,
    });
    throw error;
  }
}

async function playAudioCue(type: GuidePupNavigationCoreAudioCueType) {
  recordAudioCueSnapshot({ type });

  if (!nativeModule) {
    recordAudioCueSnapshot({
      error: "Native audio cues are unavailable.",
      executionPath: "js-fallback",
      outcome: "failure",
      type,
    });
    return;
  }

  try {
    await nativeModule.playAudioCue(type);
    recordAudioCueSnapshot({ executionPath: "native-core", outcome: "success", type });
  } catch (error) {
    recordAudioCueSnapshot({
      error: error instanceof Error ? error.message : "Audio cue failed.",
      executionPath: "native-core",
      outcome: "failure",
      type,
    });
  }
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
  addStateListener(listener: (event: GuidePupNavigationCoreStateEvent) => void) {
    if (!nativeModule) {
      return {
        remove() {},
      };
    }

    return nativeModule.addListener("onStateChanged", listener);
  },
  announce,
  cancelAnnouncement,
  claimAnnouncementOwner,
  captureFrame,
  getState,
  implementation: getExecutionPath(),
  interruptAllAnnouncements,
  isAvailable,
  isNativeAvailable() {
    return Boolean(nativeModule);
  },
  playAudioCue,
  playHaptic,
  releaseAnnouncementOwner,
  startSession,
  stopSession,
  supersedeAnnouncement,
};
