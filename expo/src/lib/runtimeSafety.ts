export const MAX_FRAME_AGE_BEFORE_UPLOAD_MS = 2_000;
export const MAX_FRAME_AGE_AT_ACTUATION_MS = 5_000;
export const MAX_ANALYSIS_LATENCY_AT_ACTUATION_MS = 4_500;
export const JS_FALLBACK_VALIDATION_CAMERA_PATH = "js-fallback-validation";
export const DEFAULT_NATIVE_START_TIMEOUT_MS = 5_000;
export const DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS = 750;

export type NavigationCameraPathRequest = string | string[] | undefined;

export function shouldForceJsFallbackValidation(requestedCameraPath: NavigationCameraPathRequest) {
  const requestedPaths = Array.isArray(requestedCameraPath)
    ? requestedCameraPath
    : [requestedCameraPath];

  return requestedPaths.some((requestedPath) =>
    requestedPath === JS_FALLBACK_VALIDATION_CAMERA_PATH
  );
}

export function resolveInitialNavigationCorePath(input: {
  nativeAvailable: boolean;
  requestedCameraPath?: NavigationCameraPathRequest;
}): "js-fallback" | "native-core" {
  if (shouldForceJsFallbackValidation(input.requestedCameraPath)) {
    return "js-fallback";
  }

  return input.nativeAvailable ? "native-core" : "js-fallback";
}

export function resolveNavigationCameraStatus(input: {
  activeCameraPath: "js-fallback" | "native-core";
  cameraRecoveryGateActive: boolean;
  fallbackCameraOwned: boolean;
  nativeRecoveryReady: boolean;
  nativeSessionActive: boolean;
  permissionGranted: boolean;
  transitionReady: boolean;
}) {
  if (!input.permissionGranted) {
    return {
      cameraReady: false,
      cameraStatus: "Camera permission is not granted.",
    };
  }

  if (input.activeCameraPath === "native-core") {
    const cameraReady =
      input.transitionReady
      && !input.cameraRecoveryGateActive
      && input.nativeRecoveryReady
      && input.nativeSessionActive;
    return {
      cameraReady,
      cameraStatus: `Native camera path is ${cameraReady ? "ready" : "not ready"}.`,
    };
  }

  if (!input.fallbackCameraOwned) {
    return {
      cameraReady: false,
      cameraStatus: "Backup camera is not owned or ready.",
    };
  }

  const cameraReady = input.transitionReady;
  return {
    cameraReady,
    cameraStatus: `Backup camera is owned by this session and ${cameraReady ? "ready" : "not ready"}.`,
  };
}

export function getNavigationPrimaryControlAccessibility(isGuiding: boolean) {
  return isGuiding
    ? {
        hint: "Double tap to stop guidance.",
        label: "Stop guidance",
        visibleHint: "Tap to stop",
      }
    : {
        hint: "Double tap to return to the Home screen.",
        label: "Return Home",
        visibleHint: "Return Home",
      };
}

export type RuntimeSafetyStopReason =
  | "analysis-latency"
  | "explicit-stop"
  | "fallback-reason"
  | "hazard"
  | "low-confidence"
  | "low-visibility"
  | "missing-frame-timestamp"
  | "obstacle"
  | "pre-recovery-frame"
  | "recovery-gate"
  | "stale-frame"
  | "walkability";

export class GuidePupAbortError extends Error {
  constructor() {
    super("Guide Pup analysis was cancelled.");
    this.name = "AbortError";
  }
}

export class GuidePupStaleFrameError extends Error {
  readonly reason: "missing-frame-timestamp" | "pre-recovery-frame" | "stale-frame";

  constructor(reason: GuidePupStaleFrameError["reason"]) {
    super(
      reason === "pre-recovery-frame"
        ? "Guide Pup rejected a frame captured before recovery completed."
        : reason === "missing-frame-timestamp"
          ? "Guide Pup rejected a frame without a capture timestamp."
          : "Guide Pup rejected a stale camera frame.",
    );
    this.name = "GuidePupStaleFrameError";
    this.reason = reason;
  }
}

export class GuidePupDeadlineError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} did not settle within ${timeoutMs} ms.`);
    this.name = "GuidePupDeadlineError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export function settlePromiseWithin<TResult>(
  operation: () => Promise<TResult> | TResult,
  timeoutMs: number,
  operationName: string,
) {
  const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));

  return new Promise<TResult>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new GuidePupDeadlineError(operationName, boundedTimeoutMs));
    }, boundedTimeoutMs);

    let operationResult: Promise<TResult> | TResult;
    try {
      operationResult = operation();
    } catch (error) {
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
      return;
    }

    Promise.resolve(operationResult).then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export async function settleStopConfirmationDelivery(input: {
  deliver: () => Promise<unknown> | unknown;
  isCurrent: () => boolean;
  onFailure?: () => void;
  operationName: string;
  timeoutMs: number;
}) {
  if (!input.isCurrent()) {
    return false;
  }

  try {
    await settlePromiseWithin(input.deliver, input.timeoutMs, input.operationName);
  } catch {
    try {
      input.onFailure?.();
    } catch {
      // Delivery is already failed closed; cleanup callbacks are best effort.
    }
    return false;
  }

  return input.isCurrent();
}

export type CurrentAnnouncementDeliveryOutcome =
  | "completed"
  | "interrupted"
  | "unsafe";

export async function settleCurrentAnnouncementDelivery(input: {
  deliver: () => Promise<unknown>;
  interrupt: () => Promise<unknown>;
  isCurrent: () => boolean;
}): Promise<CurrentAnnouncementDeliveryOutcome> {
  if (!input.isCurrent()) {
    return "unsafe";
  }

  try {
    await input.deliver();
  } catch {
    if (!input.isCurrent()) {
      return "unsafe";
    }
    try {
      await input.interrupt();
    } catch {
      return "unsafe";
    }
    return input.isCurrent() ? "interrupted" : "unsafe";
  }

  return input.isCurrent() ? "completed" : "unsafe";
}

export function shouldRearmVoiceAfterStopConfirmation(input: {
  confirmationDelivered: boolean;
  guidancePaused: boolean;
  recoveryGateActive: boolean;
  shutdownConfirmed: boolean;
  stopCurrent: boolean;
}) {
  return input.confirmationDelivered
    && input.guidancePaused
    && !input.recoveryGateActive
    && input.shutdownConfirmed
    && input.stopCurrent;
}

export function shouldLeaveNavigationAfterTouchStop(input: {
  confirmationDelivered: boolean;
  shutdownConfirmed: boolean;
  stopCurrent: boolean;
}) {
  return input.confirmationDelivered
    && input.shutdownConfirmed
    && input.stopCurrent;
}

export function shouldRetainRuntimeSafetyHoldAfterVoiceRecovery(input: {
  stopSafetyFailureHold: boolean;
  touchStopFailureHold: boolean;
}) {
  return input.stopSafetyFailureHold || input.touchStopFailureHold;
}

export function shouldRetryFailedStop(input: {
  guiding: boolean;
  stopSafetyFailureHold: boolean;
  touchStopFailureHold: boolean;
}) {
  return !input.guiding
    && (input.stopSafetyFailureHold || input.touchStopFailureHold);
}

export function resolveStopRuntimeShutdownTruth(input: {
  controlOperationsConfirmed: boolean;
  runtimeQuiescent: boolean;
}) {
  return input.controlOperationsConfirmed && input.runtimeQuiescent;
}

export function createAbortError() {
  return new GuidePupAbortError();
}

export function isAbortError(error: unknown) {
  return error instanceof GuidePupAbortError
    || (error instanceof Error && error.name === "AbortError");
}

export function isStaleFrameError(error: unknown): error is GuidePupStaleFrameError {
  return error instanceof GuidePupStaleFrameError
    || (error instanceof Error && error.name === "GuidePupStaleFrameError");
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export function getFrameAgeMs(timestampMs: number | undefined, nowMs = Date.now()) {
  if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs) || timestampMs <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, nowMs - timestampMs);
}

export function assertFreshFrameForUpload(input: {
  capturedAtMs?: number;
  maxAgeMs?: number;
  minimumCapturedAtMs?: number;
  nowMs?: number;
  signal?: AbortSignal;
}) {
  throwIfAborted(input.signal);

  if (typeof input.capturedAtMs !== "number" || !Number.isFinite(input.capturedAtMs)) {
    throw new GuidePupStaleFrameError("missing-frame-timestamp");
  }
  if (
    typeof input.minimumCapturedAtMs === "number"
    && input.capturedAtMs < input.minimumCapturedAtMs
  ) {
    throw new GuidePupStaleFrameError("pre-recovery-frame");
  }
  if (getFrameAgeMs(input.capturedAtMs, input.nowMs) > (input.maxAgeMs ?? MAX_FRAME_AGE_BEFORE_UPLOAD_MS)) {
    throw new GuidePupStaleFrameError("stale-frame");
  }
}

type VisionSafetyCandidate = {
  confidence?: number;
  direction: "turn-left" | "turn-right" | "forward" | "stop";
  fallbackReason?: string | null;
  hazardLevel?: "none" | "low" | "medium" | "high";
  latencyMs?: number;
  lighting?: string;
  message: string;
  obstacle: boolean;
  walkability?: "clear" | "caution" | "uncertain";
};

function safetyStopMessage(reason: RuntimeSafetyStopReason) {
  switch (reason) {
    case "analysis-latency":
    case "missing-frame-timestamp":
    case "pre-recovery-frame":
    case "recovery-gate":
    case "stale-frame":
      return "Stop. Camera guidance is not fresh enough. Hold still while Guide Pup checks a new frame.";
    case "obstacle":
      return "Stop. An obstacle may be in the path.";
    case "hazard":
      return "Stop. The path may be unsafe.";
    case "walkability":
      return "Stop. Walkability is uncertain.";
    case "low-visibility":
      return "Stop. Visibility is too low for movement guidance.";
    case "fallback-reason":
      return "Stop. Guide Pup is using a safety fallback.";
    case "low-confidence":
      return "Stop. Guide Pup needs a clearer view.";
    case "explicit-stop":
      return "Stop. Guide Pup is holding position while the path is checked.";
  }
}

export function applyDeterministicVisionSafetyGuard<TResult extends VisionSafetyCandidate>(
  result: TResult,
  input: {
    analysisLatencyMs?: number;
    capturedAtMs?: number;
    minimumCapturedAtMs?: number;
    nowMs?: number;
    recoveryGateActive?: boolean;
  } = {},
): TResult {
  const nowMs = input.nowMs ?? Date.now();
  const frameAgeMs = getFrameAgeMs(input.capturedAtMs, nowMs);
  const measuredAnalysisLatencyMs = Math.max(
    input.analysisLatencyMs ?? 0,
    result.latencyMs ?? 0,
  );
  let reason: RuntimeSafetyStopReason | null = null;

  if (input.recoveryGateActive) {
    reason = "recovery-gate";
  } else if (!Number.isFinite(frameAgeMs)) {
    reason = "missing-frame-timestamp";
  } else if (
    typeof input.minimumCapturedAtMs === "number"
    && (input.capturedAtMs ?? 0) < input.minimumCapturedAtMs
  ) {
    reason = "pre-recovery-frame";
  } else if (frameAgeMs > MAX_FRAME_AGE_AT_ACTUATION_MS) {
    reason = "stale-frame";
  } else if (measuredAnalysisLatencyMs > MAX_ANALYSIS_LATENCY_AT_ACTUATION_MS) {
    reason = "analysis-latency";
  } else if (result.direction === "stop" && result.fallbackReason?.startsWith("ios-")) {
    return result;
  } else if (result.direction === "stop") {
    reason = "explicit-stop";
  } else if (result.fallbackReason) {
    reason = "fallback-reason";
  } else if (typeof result.confidence !== "number" || result.confidence < 0.65) {
    reason = "low-confidence";
  } else if (result.obstacle) {
    reason = "obstacle";
  } else if (result.hazardLevel === "medium" || result.hazardLevel === "high") {
    reason = "hazard";
  } else if (result.walkability === "caution" || result.walkability === "uncertain") {
    reason = "walkability";
  } else if (!["normal", "bright"].includes(result.lighting ?? "unknown")) {
    reason = "low-visibility";
  }

  if (!reason) {
    return result;
  }

  return {
    ...result,
    confidence: Math.min(result.confidence ?? 0, 0.45),
    direction: "stop",
    fallbackReason: `ios-${reason}`,
    hazardLevel: "high",
    message: safetyStopMessage(reason),
    obstacle: true,
    walkability: "uncertain",
  };
}

export function shouldOwnFallbackCamera(input: {
  focused: boolean;
  guiding: boolean;
  permissionGranted: boolean;
  runtimeSafetyHold: boolean;
  usingFallback: boolean;
}) {
  return input.focused
    && input.guiding
    && input.permissionGranted
    && !input.runtimeSafetyHold
    && input.usingFallback;
}

export function createCameraOwnershipTransitionCoordinator() {
  let currentGeneration = 0;
  let fallbackOwnershipGeneration: number | null = null;
  let fallbackReadyGeneration: number | null = null;
  let nativeOwnershipGeneration: number | null = null;
  let cancelFallbackReadinessDeadline: (() => void) | null = null;
  let operationQueue: Promise<void> = Promise.resolve();
  let currentStopRequest: {
    generation: number;
    promise: Promise<boolean>;
  } | null = null;

  const isCurrent = (generation: number) => currentGeneration === generation;
  const clearFallbackReadinessDeadline = () => {
    cancelFallbackReadinessDeadline?.();
    cancelFallbackReadinessDeadline = null;
  };
  const beginTransition = () => {
    clearFallbackReadinessDeadline();
    currentGeneration += 1;
    fallbackOwnershipGeneration = null;
    fallbackReadyGeneration = null;
    currentStopRequest = null;
    return currentGeneration;
  };
  const enqueue = <TResult>(operation: () => Promise<TResult>) => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return {
    beginTransition,
    cancelTransition(generation: number) {
      if (isCurrent(generation)) {
        clearFallbackReadinessDeadline();
        currentGeneration += 1;
        fallbackOwnershipGeneration = null;
        fallbackReadyGeneration = null;
        currentStopRequest = null;
      }
    },
    currentGeneration() {
      return currentGeneration;
    },
    hasFallbackOwnership(generation: number) {
      return isCurrent(generation) && fallbackOwnershipGeneration === generation;
    },
    isFallbackReady(generation: number) {
      return isCurrent(generation)
        && fallbackOwnershipGeneration === generation
        && fallbackReadyGeneration === generation;
    },
    isCurrent,
    releaseNativeForFallback(
      generation: number,
      stopSession: () => Promise<unknown>,
      stopTimeoutMs = DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS,
    ) {
      if (!isCurrent(generation)) {
        return Promise.resolve(false);
      }

      return enqueue(async () => {
        fallbackOwnershipGeneration = null;
        fallbackReadyGeneration = null;
        await settlePromiseWithin(
          stopSession,
          stopTimeoutMs,
          "native camera release for fallback",
        );
        nativeOwnershipGeneration = null;
        if (!isCurrent(generation)) {
          return false;
        }

        fallbackOwnershipGeneration = generation;
        return true;
      });
    },
    markFallbackReady(generation: number) {
      if (!isCurrent(generation) || fallbackOwnershipGeneration !== generation) {
        return false;
      }

      clearFallbackReadinessDeadline();
      fallbackReadyGeneration = generation;
      return true;
    },
    markFallbackUnavailable(generation: number) {
      if (!isCurrent(generation) || fallbackOwnershipGeneration !== generation) {
        return false;
      }

      clearFallbackReadinessDeadline();
      fallbackOwnershipGeneration = null;
      fallbackReadyGeneration = null;
      return true;
    },
    scheduleFallbackReadinessDeadline(
      generation: number,
      timeoutMs: number,
      onDeadline: () => void,
    ) {
      if (
        !isCurrent(generation)
        || fallbackOwnershipGeneration !== generation
        || fallbackReadyGeneration === generation
      ) {
        return () => undefined;
      }

      clearFallbackReadinessDeadline();
      let active = true;
      const boundedTimeoutMs = Math.max(1, Math.floor(timeoutMs));
      const timeoutId = setTimeout(() => {
        if (!active) {
          return;
        }
        active = false;
        cancelFallbackReadinessDeadline = null;
        if (
          isCurrent(generation)
          && fallbackOwnershipGeneration === generation
          && fallbackReadyGeneration !== generation
        ) {
          onDeadline();
        }
      }, boundedTimeoutMs);
      const cancel = () => {
        if (!active) {
          return;
        }
        active = false;
        clearTimeout(timeoutId);
      };
      cancelFallbackReadinessDeadline = cancel;
      return cancel;
    },
    requestNativeStop(
      stopSession: () => Promise<unknown>,
      maxAttempts = 1,
      attemptTimeoutMs = DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS,
    ) {
      if (currentStopRequest && isCurrent(currentStopRequest.generation)) {
        return {
          ...currentStopRequest,
          created: false,
        };
      }

      const generation = beginTransition();
      const stopRequest = {
        generation,
        promise: Promise.resolve(false),
      };
      const boundedAttempts = Math.max(1, Math.min(3, Math.floor(maxAttempts)));
      stopRequest.promise = enqueue(async () => {
        fallbackOwnershipGeneration = null;
        fallbackReadyGeneration = null;
        let lastError: unknown = null;
        for (let attempt = 0; attempt < boundedAttempts; attempt += 1) {
          try {
            await settlePromiseWithin(
              stopSession,
              attemptTimeoutMs,
              "native camera stop",
            );
            nativeOwnershipGeneration = null;
            return isCurrent(generation);
          } catch (error) {
            lastError = error;
            if (!isCurrent(generation)) {
              return false;
            }
          }
        }
        throw lastError;
      });
      currentStopRequest = stopRequest;
      void stopRequest.promise.catch(() => undefined);

      return {
        ...stopRequest,
        created: true,
      };
    },
    startNativeSession(
      generation: number,
      startSession: () => Promise<unknown>,
      stopSession: () => Promise<unknown>,
      startTimeoutMs = DEFAULT_NATIVE_START_TIMEOUT_MS,
      staleCleanupTimeoutMs = DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS,
    ) {
      if (!isCurrent(generation)) {
        return Promise.resolve(false);
      }

      return enqueue(async () => {
        if (!isCurrent(generation)) {
          return false;
        }

        fallbackOwnershipGeneration = null;
        fallbackReadyGeneration = null;
        const startPromise = Promise.resolve().then(startSession);
        try {
          await settlePromiseWithin(
            () => startPromise,
            startTimeoutMs,
            "native camera start",
          );
        } catch (error) {
          if (error instanceof GuidePupDeadlineError) {
            void startPromise.then(
              () => {
                void enqueue(async () => {
                  if (
                    nativeOwnershipGeneration !== null
                    && isCurrent(nativeOwnershipGeneration)
                  ) {
                    return;
                  }
                  await settlePromiseWithin(
                    stopSession,
                    staleCleanupTimeoutMs,
                    "late native camera cleanup",
                  ).catch(() => undefined);
                }).catch(() => undefined);
              },
              () => undefined,
            );
          }
          throw error;
        }
        if (!isCurrent(generation)) {
          await settlePromiseWithin(
            stopSession,
            staleCleanupTimeoutMs,
            "stale native camera cleanup",
          ).catch(() => undefined);
          return false;
        }

        nativeOwnershipGeneration = generation;
        return true;
      });
    },
    stopNativeSession(
      generation: number,
      stopSession: () => Promise<unknown>,
      stopTimeoutMs = DEFAULT_NATIVE_STOP_ATTEMPT_TIMEOUT_MS,
    ) {
      if (!isCurrent(generation)) {
        return Promise.resolve(false);
      }

      return enqueue(async () => {
        fallbackOwnershipGeneration = null;
        fallbackReadyGeneration = null;
        await settlePromiseWithin(
          stopSession,
          stopTimeoutMs,
          "native camera stop",
        );
        nativeOwnershipGeneration = null;
        return isCurrent(generation);
      });
    },
  };
}

export function evaluateStopRuntimeObservation(input: {
  analysisActive: boolean;
  fallbackCameraActive: boolean;
  nativeCameraActive: boolean;
  voiceListening: boolean;
  voiceSpeaking: boolean;
}) {
  const cameraInactive = !input.fallbackCameraActive && !input.nativeCameraActive;
  const analysisInactive = !input.analysisActive;
  const listeningStopped = !input.voiceListening;
  const staleSpeechAfterStop = input.voiceSpeaking;

  return {
    analysisInactive,
    cameraInactive,
    listeningStopped,
    quiescent:
      cameraInactive
      && listeningStopped
      && !staleSpeechAfterStop
      && analysisInactive,
    staleSpeechAfterStop,
  };
}
