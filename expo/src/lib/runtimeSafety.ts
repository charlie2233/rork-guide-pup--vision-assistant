export const MAX_FRAME_AGE_BEFORE_UPLOAD_MS = 2_000;
export const MAX_FRAME_AGE_AT_ACTUATION_MS = 5_000;
export const MAX_ANALYSIS_LATENCY_AT_ACTUATION_MS = 4_500;

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
