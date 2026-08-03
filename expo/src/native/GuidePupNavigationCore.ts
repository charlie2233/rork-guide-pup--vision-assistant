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
export type GuidePupSensoryFeedbackOutcome = "failure" | "success";
export type GuidePupDistributionEnvironment =
  | "apple-sandbox"
  | "app-store-production"
  | "xcode"
  | "unknown"
  | "none";

export interface GuidePupDistributionEvidence {
  appStoreAppIdMatched: boolean;
  bundleVersionMatched: boolean;
  transactionVerified: boolean;
  identityMatched: boolean;
  environment: GuidePupDistributionEnvironment;
}

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

export interface GuidePupAnnouncementDeliveryOptions {
  completionTimeoutMs?: number;
  signal?: AbortSignal;
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
  getDistributionEvidence?(): Promise<GuidePupDistributionEvidence>;
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

const fallbackDistributionEvidence: GuidePupDistributionEvidence = {
  appStoreAppIdMatched: false,
  bundleVersionMatched: false,
  transactionVerified: false,
  identityMatched: false,
  environment: "none",
};

let fallbackAnnouncementOwnerToken: string | null = null;
let announcementOwnerSequence = 0;
const FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MINIMUM_MS = 15_000;
const FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MAXIMUM_MS = 120_000;
const FALLBACK_ANNOUNCEMENT_COMPLETION_GRACE_MS = 8_000;
const FALLBACK_ANNOUNCEMENT_COMPLETION_MS_PER_WORD = 2_400;
let fallbackAnnouncementGeneration = 0;

interface PendingFallbackAnnouncement {
  cancel(error: Error): void;
  generation: number;
  ownerToken: string;
  requestGeneration: number;
}

let pendingFallbackAnnouncement: PendingFallbackAnnouncement | null = null;
let fallbackAnnouncementRequestGeneration = 0;

export function getFallbackAnnouncementCompletionTimeoutMs(
  message: string,
  requestedTimeoutMs?: number,
) {
  if (
    typeof requestedTimeoutMs === "number"
    && Number.isFinite(requestedTimeoutMs)
    && requestedTimeoutMs > 0
  ) {
    return Math.max(1, Math.floor(requestedTimeoutMs));
  }

  const wordCount = Math.max(1, message.trim().split(/\s+/).filter(Boolean).length);
  const estimatedTimeoutMs =
    wordCount * FALLBACK_ANNOUNCEMENT_COMPLETION_MS_PER_WORD
    + FALLBACK_ANNOUNCEMENT_COMPLETION_GRACE_MS;
  return Math.min(
    FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MAXIMUM_MS,
    Math.max(FALLBACK_ANNOUNCEMENT_COMPLETION_TIMEOUT_MINIMUM_MS, estimatedTimeoutMs),
  );
}

export function createGuidePupAnnouncementOwnerToken(scope: string) {
  announcementOwnerSequence += 1;
  return `${scope}-${Date.now().toString(36)}-${announcementOwnerSequence.toString(36)}`;
}

function getExecutionPath(): GuidePupNavigationCoreExecutionPath {
  return nativeModule ? "native-core" : "js-fallback";
}

function createFallbackAnnouncementMarker(generation: number) {
  const encodedGeneration = generation
    .toString(2)
    .split("")
    .map((bit) => bit === "1" ? "\u2063" : "\u2060")
    .join("");
  return `\u2063${encodedGeneration}\u2063`;
}

function cancelPendingFallbackAnnouncement(reason: string, ownerToken?: string) {
  const pending = pendingFallbackAnnouncement;
  if (!pending || (ownerToken && pending.ownerToken !== ownerToken)) {
    return false;
  }

  pending.cancel(new Error(reason));
  return true;
}

function interruptFallbackAccessibilityChannel() {
  if (Platform.OS !== "ios") {
    return false;
  }

  try {
    AccessibilityInfo.announceForAccessibilityWithOptions("\u200B", { queue: false });
    return true;
  } catch {
    return false;
  }
}

function waitForFallbackAnnouncementCompletion(
  message: string,
  ownerToken: string,
  requestGeneration: number,
  options?: GuidePupAnnouncementDeliveryOptions,
) {
  if (
    Platform.OS !== "ios"
    || fallbackAnnouncementOwnerToken !== ownerToken
    || fallbackAnnouncementRequestGeneration !== requestGeneration
    || options?.signal?.aborted
  ) {
    return Promise.reject(new Error("VoiceOver announcement ownership is no longer current."));
  }
  if (
    typeof AccessibilityInfo.addEventListener !== "function"
    || typeof AccessibilityInfo.announceForAccessibilityWithOptions !== "function"
  ) {
    return Promise.reject(new Error("VoiceOver announcement completion is unavailable."));
  }

  const completionTimeoutMs = getFallbackAnnouncementCompletionTimeoutMs(
    message,
    options?.completionTimeoutMs,
  );
  const generation = fallbackAnnouncementGeneration + 1;
  fallbackAnnouncementGeneration = generation;
  const postedAnnouncement = `${message}${createFallbackAnnouncementMarker(generation)}`;
  const signal = options?.signal;

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: ReturnType<typeof AccessibilityInfo.addEventListener> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (subscription) {
        subscription.remove();
        subscription = null;
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal?.removeEventListener("abort", handleAbort);
      if (pendingFallbackAnnouncement?.generation === generation) {
        pendingFallbackAnnouncement = null;
      }
    }

    function settle(error?: Error, interrupt = false) {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (interrupt) {
        interruptFallbackAccessibilityChannel();
      }
      if (error) {
        reject(error);
        return;
      }
      resolve();
    }

    function handleAbort() {
      settle(new Error("VoiceOver announcement delivery was cancelled."), true);
    }

    try {
      subscription = AccessibilityInfo.addEventListener(
        "announcementFinished",
        (event) => {
          if (
            pendingFallbackAnnouncement?.generation !== generation
            || pendingFallbackAnnouncement.ownerToken !== ownerToken
            || pendingFallbackAnnouncement.requestGeneration !== requestGeneration
            || fallbackAnnouncementOwnerToken !== ownerToken
            || fallbackAnnouncementRequestGeneration !== requestGeneration
            || event.announcement !== postedAnnouncement
          ) {
            return;
          }
          if (!event.success) {
            settle(new Error("VoiceOver announcement delivery failed."), true);
            return;
          }
          settle();
        },
      );
      timeoutId = setTimeout(() => {
        settle(
          new Error(
            `VoiceOver announcement completion did not arrive within ${completionTimeoutMs} ms.`,
          ),
          true,
        );
      }, completionTimeoutMs);
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (
        signal?.aborted
        || fallbackAnnouncementOwnerToken !== ownerToken
        || fallbackAnnouncementRequestGeneration !== requestGeneration
      ) {
        settle(new Error("VoiceOver announcement ownership is no longer current."));
        return;
      }
      pendingFallbackAnnouncement = {
        cancel: settle,
        generation,
        ownerToken,
        requestGeneration,
      };
      AccessibilityInfo.announceForAccessibilityWithOptions(postedAnnouncement, { queue: false });
    } catch (error) {
      settle(
        error instanceof Error
          ? error
          : new Error("VoiceOver announcement delivery could not start."),
        true,
      );
    }
  });
}

function beginAnnouncementRequest() {
  fallbackAnnouncementRequestGeneration += 1;
  const requestGeneration = fallbackAnnouncementRequestGeneration;
  const pendingCancelled = cancelPendingFallbackAnnouncement(
    "VoiceOver announcement was replaced by newer output.",
  );
  if (pendingCancelled && !interruptFallbackAccessibilityChannel()) {
    throw new Error("VoiceOver announcement interruption could not be posted.");
  }
  return requestGeneration;
}

function invalidateAnnouncementRequests() {
  fallbackAnnouncementRequestGeneration += 1;
}

function announcementRequestIsCurrent(
  requestGeneration: number,
  ownerToken: string,
  signal?: AbortSignal,
) {
  return (
    Platform.OS === "ios"
    && fallbackAnnouncementOwnerToken === ownerToken
    && fallbackAnnouncementRequestGeneration === requestGeneration
    && !signal?.aborted
  );
}

function settleNativeAnnouncementDelivery(input: {
  cancel: () => Promise<void>;
  deliver: () => Promise<void>;
  signal?: AbortSignal;
}) {
  const signal = input.signal;
  if (!signal) {
    return input.deliver();
  }
  if (signal.aborted) {
    void input.cancel().catch(() => undefined);
    return Promise.reject(new Error("VoiceOver announcement delivery was cancelled."));
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      signal.removeEventListener("abort", handleAbort);
    };
    const settle = (error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
        return;
      }
      resolve();
    };
    const handleAbort = () => {
      void input.cancel().catch(() => undefined);
      settle(new Error("VoiceOver announcement delivery was cancelled."));
    };

    signal.addEventListener("abort", handleAbort, { once: true });
    if (signal.aborted) {
      handleAbort();
      return;
    }
    void Promise.resolve()
      .then(input.deliver)
      .then(
        () => settle(),
        (error) => settle(error),
      );
  });
}

async function deliverAnnouncementWithFallback(input: {
  message: string;
  nativeCancellation: (() => Promise<void>) | null;
  nativeDelivery: (() => Promise<void>) | null;
  options?: GuidePupAnnouncementDeliveryOptions;
  ownerToken: string;
}) {
  if (
    Platform.OS !== "ios"
    || fallbackAnnouncementOwnerToken !== input.ownerToken
    || input.options?.signal?.aborted
  ) {
    throw new Error("VoiceOver announcement ownership is no longer current.");
  }

  const requestGeneration = beginAnnouncementRequest();
  if (input.nativeDelivery) {
    let nativeRejected = false;
    try {
      await settleNativeAnnouncementDelivery({
        cancel: input.nativeCancellation
          ?? (() => Promise.resolve()),
        deliver: input.nativeDelivery,
        signal: input.options?.signal,
      });
    } catch {
      nativeRejected = true;
    }
    if (!announcementRequestIsCurrent(
      requestGeneration,
      input.ownerToken,
      input.options?.signal,
    )) {
      throw new Error("VoiceOver announcement ownership is no longer current.");
    }
    if (!nativeRejected) {
      return;
    }
  }

  await waitForFallbackAnnouncementCompletion(
    input.message,
    input.ownerToken,
    requestGeneration,
    input.options,
  );
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

  const previousOwnerToken = fallbackAnnouncementOwnerToken;
  const ownerChanged = previousOwnerToken !== null && previousOwnerToken !== trimmedOwnerToken;
  if (ownerChanged) {
    invalidateAnnouncementRequests();
  }
  const pendingCancelled = ownerChanged
    ? cancelPendingFallbackAnnouncement(
      "VoiceOver announcement ownership changed.",
      previousOwnerToken,
    )
    : false;
  const fallbackInterrupted =
    !pendingCancelled || interruptFallbackAccessibilityChannel();
  fallbackAnnouncementOwnerToken = trimmedOwnerToken;
  if (nativeModule) {
    await nativeModule.claimAnnouncementOwner(trimmedOwnerToken).catch(() => undefined);
  }
  if (!fallbackInterrupted) {
    throw new Error("VoiceOver announcement interruption could not be posted.");
  }
}

async function releaseAnnouncementOwner(ownerToken: string) {
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }

  const ownerIsCurrent = fallbackAnnouncementOwnerToken === trimmedOwnerToken;
  if (ownerIsCurrent) {
    invalidateAnnouncementRequests();
  }
  const pendingCancelled = cancelPendingFallbackAnnouncement(
    "VoiceOver announcement ownership was released.",
    trimmedOwnerToken,
  );
  const fallbackInterrupted =
    !pendingCancelled || interruptFallbackAccessibilityChannel();
  if (fallbackAnnouncementOwnerToken === trimmedOwnerToken) {
    fallbackAnnouncementOwnerToken = null;
  }
  let nativeReleased = true;
  if (nativeModule) {
    try {
      await nativeModule.releaseAnnouncementOwner(trimmedOwnerToken);
    } catch {
      nativeReleased = false;
    }
  }
  if (!fallbackInterrupted) {
    throw new Error("VoiceOver announcement interruption could not be posted.");
  }
  if (!nativeReleased) {
    throw new Error("Native VoiceOver announcement owner release could not be confirmed.");
  }
}

async function announce(
  message: string,
  ownerToken: string,
  options?: GuidePupAnnouncementDeliveryOptions,
) {
  const trimmed = message.trim();
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmed || !trimmedOwnerToken) {
    return;
  }

  await deliverAnnouncementWithFallback({
    message: trimmed,
    nativeCancellation: nativeModule
      ? () => nativeModule.cancelAnnouncement(trimmedOwnerToken)
      : null,
    nativeDelivery: nativeModule
      ? () => nativeModule.announce(trimmed, trimmedOwnerToken)
      : null,
    options,
    ownerToken: trimmedOwnerToken,
  });
}

async function cancelAnnouncement(ownerToken: string) {
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }

  const ownerIsCurrent = fallbackAnnouncementOwnerToken === trimmedOwnerToken;
  if (ownerIsCurrent) {
    invalidateAnnouncementRequests();
  }
  const pendingCancelled = cancelPendingFallbackAnnouncement(
    "VoiceOver announcement delivery was cancelled.",
    trimmedOwnerToken,
  );
  const fallbackInterrupted =
    !pendingCancelled || interruptFallbackAccessibilityChannel();
  let nativeInterrupted = true;
  if (nativeModule) {
    try {
      await nativeModule.cancelAnnouncement(trimmedOwnerToken);
    } catch {
      nativeInterrupted = false;
    }
  } else if (
    !pendingCancelled
    &&
    Platform.OS === "ios"
    && fallbackAnnouncementOwnerToken === trimmedOwnerToken
  ) {
    if (!interruptFallbackAccessibilityChannel()) {
      throw new Error("VoiceOver announcement interruption could not be posted.");
    }
  }
  if (!fallbackInterrupted) {
    throw new Error("VoiceOver announcement interruption could not be posted.");
  }
  if (!nativeInterrupted) {
    throw new Error("Native VoiceOver announcement interruption could not be confirmed.");
  }
}

async function interruptAllAnnouncements() {
  invalidateAnnouncementRequests();
  const pendingCancelled = cancelPendingFallbackAnnouncement(
    "VoiceOver announcements were interrupted.",
  );
  const fallbackInterrupted =
    !pendingCancelled || interruptFallbackAccessibilityChannel();
  let nativeInterrupted = true;
  if (nativeModule) {
    try {
      await nativeModule.interruptAllAnnouncements();
    } catch {
      nativeInterrupted = false;
    }
  } else if (!pendingCancelled) {
    if (!interruptFallbackAccessibilityChannel()) {
      throw new Error("VoiceOver announcement interruption could not be posted.");
    }
  }
  if (!fallbackInterrupted) {
    throw new Error("VoiceOver announcement interruption could not be posted.");
  }
  if (!nativeInterrupted) {
    throw new Error("Native VoiceOver announcements could not be interrupted.");
  }
}

async function supersedeAnnouncement(
  message: string,
  ownerToken: string,
  options?: GuidePupAnnouncementDeliveryOptions,
) {
  const trimmed = message.trim();
  const trimmedOwnerToken = ownerToken.trim();
  if (!trimmedOwnerToken) {
    return;
  }
  if (!trimmed) {
    await cancelAnnouncement(trimmedOwnerToken);
    return;
  }
  await deliverAnnouncementWithFallback({
    message: trimmed,
    nativeCancellation: nativeModule
      ? () => nativeModule.cancelAnnouncement(trimmedOwnerToken)
      : null,
    nativeDelivery: nativeModule
      ? () => nativeModule.supersedeAnnouncement(trimmed, trimmedOwnerToken)
      : null,
    options,
    ownerToken: trimmedOwnerToken,
  });
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

async function playHapticWithOutcome(
  type: GuidePupNavigationCoreHapticType,
): Promise<GuidePupSensoryFeedbackOutcome> {
  recordHapticSnapshot({ type });

  if (nativeModule) {
    try {
      await nativeModule.playHaptic(type);
      recordHapticSnapshot({ executionPath: "native-core", outcome: "success", type });
      return "success";
    } catch {
      // Fall through to the JS haptics fallback if the native bridge rejects.
    }
  }

  try {
    await playFallbackHaptic(type);
    recordHapticSnapshot({ executionPath: "js-fallback", outcome: "success", type });
    return "success";
  } catch (error) {
    recordHapticSnapshot({
      error: error instanceof Error ? error.message : "Haptic feedback failed.",
      executionPath: "js-fallback",
      outcome: "failure",
      type,
    });
    return "failure";
  }
}

async function playHaptic(type: GuidePupNavigationCoreHapticType) {
  const outcome = await playHapticWithOutcome(type);
  if (outcome === "failure") {
    throw new Error("Haptic feedback failed.");
  }
}

async function playAudioCueWithOutcome(
  type: GuidePupNavigationCoreAudioCueType,
): Promise<GuidePupSensoryFeedbackOutcome> {
  recordAudioCueSnapshot({ type });

  if (!nativeModule) {
    recordAudioCueSnapshot({
      error: "Native audio cues are unavailable.",
      executionPath: "js-fallback",
      outcome: "failure",
      type,
    });
    return "failure";
  }

  try {
    await nativeModule.playAudioCue(type);
    recordAudioCueSnapshot({ executionPath: "native-core", outcome: "success", type });
    return "success";
  } catch (error) {
    recordAudioCueSnapshot({
      error: error instanceof Error ? error.message : "Audio cue failed.",
      executionPath: "native-core",
      outcome: "failure",
      type,
    });
    return "failure";
  }
}

async function playAudioCue(type: GuidePupNavigationCoreAudioCueType) {
  await playAudioCueWithOutcome(type);
}

async function getState(): Promise<GuidePupNavigationCoreState> {
  if (nativeModule) {
    return nativeModule.getState();
  }

  return fallbackState;
}

async function getDistributionEvidence(): Promise<GuidePupDistributionEvidence> {
  if (!nativeModule?.getDistributionEvidence) {
    return fallbackDistributionEvidence;
  }

  try {
    const evidence = await nativeModule.getDistributionEvidence();
    if (
      typeof evidence?.transactionVerified !== "boolean"
      || typeof evidence?.appStoreAppIdMatched !== "boolean"
      || typeof evidence?.bundleVersionMatched !== "boolean"
      || typeof evidence?.identityMatched !== "boolean"
      || ![
        "apple-sandbox",
        "app-store-production",
        "xcode",
        "unknown",
        "none",
      ].includes(evidence.environment)
      || (
        evidence.transactionVerified
          ? evidence.environment === "none"
            || !evidence.appStoreAppIdMatched
            || !evidence.bundleVersionMatched
          : evidence.environment !== "none"
            || evidence.identityMatched
            || evidence.appStoreAppIdMatched
            || evidence.bundleVersionMatched
      )
    ) {
      return fallbackDistributionEvidence;
    }

    return evidence;
  } catch {
    return fallbackDistributionEvidence;
  }
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
  getDistributionEvidence,
  getState,
  implementation: getExecutionPath(),
  interruptAllAnnouncements,
  isAvailable,
  isNativeAvailable() {
    return Boolean(nativeModule);
  },
  playAudioCue,
  playAudioCueWithOutcome,
  playHaptic,
  playHapticWithOutcome,
  releaseAnnouncementOwner,
  startSession,
  stopSession,
  supersedeAnnouncement,
};
