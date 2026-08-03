import { useSyncExternalStore } from "react";

import { appConfig, isConfiguredUrl } from "./config";

export type DiagnosticsAnalyzeOutcome =
  | "success"
  | "safe-response"
  | "failure"
  | "invalid-response"
  | "timeout"
  | "unauthorized"
  | "preprocess-failure";

export type DiagnosticsAnalyzeDirection = "turn-left" | "turn-right" | "forward" | "stop";
export type DiagnosticsHazardLevel = "none" | "low" | "medium" | "high";
export type DiagnosticsLighting = "dark" | "dim" | "normal" | "bright" | "unknown";
export type DiagnosticsWalkability = "clear" | "caution" | "uncertain";
export type DiagnosticsVisionInteractionMode = "guidance" | "scene-query";
export type DiagnosticsSessionStatus = "unknown" | "bootstrapping" | "ready" | "cleared" | "failed";
export type DiagnosticsNavigationExecutionPath = "native-core" | "js-fallback";
export type DiagnosticsVoiceExecutionPath = "native-voice" | "js-fallback";
export type DiagnosticsVoiceRecognitionPhase = "partial" | "final";
export type DiagnosticsSpeechListeningOverlapReason = "stop-barge-in" | "unexpected";
export type DiagnosticsStopBargeInRecognitionPhase = "partial" | "final";
export type DiagnosticsStopBargeInRecognizedCommand = "stop-guidance-partial" | "stop-guidance";
export type DiagnosticsHapticOutcome = "none" | "success" | "failure";
export type DiagnosticsAudioCueOutcome = "none" | "success" | "failure";
export type DiagnosticsRecoveryState = "idle" | "recovering" | "interrupted" | "background" | "exhausted";
export type DiagnosticsDistributionEnvironment =
  | "apple-sandbox"
  | "app-store-production"
  | "xcode"
  | "unknown"
  | "none";

const DIAGNOSTICS_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIAGNOSTICS_GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const DIAGNOSTICS_WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export interface DiagnosticsRuntimeSnapshot {
  apiBaseUrl?: string;
  appEnv: string;
  appName: string;
  appVersion?: string;
  buildVersion?: string;
  bundleIdentifier?: string;
  candidateIdentifier?: string;
  emergencyDisclaimer: string;
  experimentalTabsEnabled: boolean;
  privacyPolicyUrl?: string;
  releaseTrack: string;
  sourceRevision?: string;
  crashReportingEnabled: boolean;
  slug?: string;
  supportEmail?: string;
  supportUrl?: string;
  websiteUrl?: string;
}

export interface DiagnosticsCameraPermissionSnapshot {
  canAskAgain: boolean;
  expires?: number | string;
  granted: boolean;
  status: string;
  updatedAt: number;
}

export interface DiagnosticsDistributionSnapshot {
  appStoreAppIdMatched: boolean;
  bundleVersionMatched: boolean;
  environment: DiagnosticsDistributionEnvironment;
  identityMatched: boolean;
  transactionVerified: boolean;
  updatedAt: number;
}

export interface DiagnosticsSessionSnapshot {
  deviceIdSuffix?: string;
  error?: string;
  expiresAt?: string;
  requestId?: string;
  status: DiagnosticsSessionStatus;
  updatedAt: number;
}

export interface DiagnosticsHealthSnapshot {
  analyzeDeviceRateLimitPerMinute?: number;
  analyzeIpRateLimitPerMinute?: number;
  benchmarkProviders?: string[];
  bootstrapIpRateLimitPerMinute?: number;
  checkedAt: number;
  defaultMaxCompletionTokens?: number;
  defaultModel?: string;
  defaultProvider?: string;
  defaultReasoningEffort?: string;
  defaultRequestTimeoutMs?: number;
  defaultRetryCount?: number;
  defaultRetryDelayMs?: number;
  deploymentIdentityValid?: boolean;
  environment?: string;
  error?: string;
  ok: boolean;
  promptVersion?: string;
  providerGlobalCallLimitPerMinute?: number;
  requestId?: string;
  latencyMs?: number;
  sessionTtlSeconds?: number;
  sourceRevision?: string;
  structuredOutputMode?: string;
  workerIdentity?: string;
  workerVersionId?: string;
}

export interface DiagnosticsCaptureHeuristics {
  captureLatencyMs?: number;
  frameAgeMs?: number;
  imageSource?: "uri" | "base64" | "unknown";
  resizedForUpload?: boolean;
  uploadedHeight?: number;
  uploadedWidth?: number;
}

export interface DiagnosticsNavigationLoopSnapshot {
  available: boolean;
  executionPath: DiagnosticsNavigationExecutionPath;
  lastCaptureLatencyMs?: number;
  lastError?: string;
  lastTotalGuidanceLoopLatencyMs?: number;
  recoveryState?: DiagnosticsRecoveryState;
  sessionActive: boolean;
  updatedAt: number;
  voiceOverRunning?: boolean;
}

export interface DiagnosticsHapticSnapshot {
  failureCount: number;
  lastAttemptedAt?: number;
  lastCompletedAt?: number;
  lastError?: string;
  lastExecutionPath?: DiagnosticsNavigationExecutionPath;
  lastOutcome: DiagnosticsHapticOutcome;
  lastType?: string;
  successCount: number;
  updatedAt: number;
}

export interface DiagnosticsAudioCueSnapshot {
  failureCount: number;
  lastAttemptedAt?: number;
  lastCompletedAt?: number;
  lastError?: string;
  lastExecutionPath?: DiagnosticsNavigationExecutionPath;
  lastOutcome: DiagnosticsAudioCueOutcome;
  lastType?: string;
  successCount: number;
  updatedAt: number;
}

export interface DiagnosticsVoiceSnapshot {
  available: boolean;
  executionPath: DiagnosticsVoiceExecutionPath;
  lastError?: string;
  lastRecognizedAt?: number;
  lastRecognizedCommand?: string;
  lastRecognizedCommandPhase?: DiagnosticsVoiceRecognitionPhase;
  lastSpeechListeningOverlapAt?: number;
  lastSpeechListeningOverlapReason?: DiagnosticsSpeechListeningOverlapReason;
  lastVoiceStateChangedAt?: number;
  listening: boolean;
  microphonePermission?: string;
  recoveryState?: DiagnosticsRecoveryState;
  speaking: boolean;
  speechListeningOverlapActive: boolean;
  speechListeningOverlapCount: number;
  speechPermission?: string;
  unexpectedSpeechListeningOverlapCount: number;
  updatedAt: number;
  voiceProcessingEnabled: boolean;
}

export interface DiagnosticsStopBargeInSnapshot {
  analysisInactiveAfterStop: boolean | null;
  armedAt?: number;
  armedDuringSpeech: boolean;
  attemptedDuringSpeech: boolean;
  audioCueAttempted: boolean;
  audioCueOutcome: "failure" | "not-attempted" | "pending" | "success";
  cameraInactiveAfterStop: boolean | null;
  cutThrough: boolean | null;
  feedbackObservedAt: number | null;
  guidancePaused: boolean;
  hapticAttempted: boolean;
  hapticOutcome: "failure" | "not-attempted" | "pending" | "success";
  lastRecognizedAt?: number;
  listeningStoppedAfterStop: boolean | null;
  postStopObservedAt: number | null;
  recognizedCommand?: DiagnosticsStopBargeInRecognizedCommand;
  recognizedDuringSpeech: boolean;
  recognizedPhase?: DiagnosticsStopBargeInRecognitionPhase;
  staleSpeechAfterStop: boolean | null;
  stopEventId?: string;
  updatedAt: number;
}

export interface DiagnosticsAnalyzeEvent {
  appVersion?: string;
  captureHeuristics?: DiagnosticsCaptureHeuristics;
  confidence?: number;
  detail?: "low" | "high";
  direction?: DiagnosticsAnalyzeDirection;
  error?: string;
  fallbackReason?: string;
  frameId?: string;
  frameSummary?: string;
  frameTimestampMs?: number;
  hazardLevel?: DiagnosticsHazardLevel;
  hasImage?: boolean;
  id: string;
  interactionMode?: DiagnosticsVisionInteractionMode;
  latencyMs?: number;
  lighting?: DiagnosticsLighting;
  message?: string;
  model?: string;
  nativePath?: DiagnosticsNavigationExecutionPath;
  obstacle?: boolean;
  platform?: string;
  priorGuidanceSummary?: string;
  requestId?: string;
  outcome: DiagnosticsAnalyzeOutcome;
  promptVersion?: string;
  provider?: string;
  sampledFrame?: boolean;
  safeReason?: string;
  sceneDescription?: string;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  surfaceType?: string;
  walkability?: DiagnosticsWalkability;
  timestamp: number;
}

export interface DiagnosticsSnapshot {
  audioCue: DiagnosticsAudioCueSnapshot;
  cameraPermission: DiagnosticsCameraPermissionSnapshot | null;
  distribution: DiagnosticsDistributionSnapshot;
  haptics: DiagnosticsHapticSnapshot;
  lastAnalyze: DiagnosticsAnalyzeEvent | null;
  lastHealthCheck: DiagnosticsHealthSnapshot | null;
  navigationLoop: DiagnosticsNavigationLoopSnapshot;
  recentAnalyzeEvents: DiagnosticsAnalyzeEvent[];
  runtime: DiagnosticsRuntimeSnapshot;
  session: DiagnosticsSessionSnapshot;
  stopBargeIn: DiagnosticsStopBargeInSnapshot;
  voice: DiagnosticsVoiceSnapshot;
}

const MAX_ANALYZE_EVENTS = 12;

const createInitialRuntime = (): DiagnosticsRuntimeSnapshot => ({
  apiBaseUrl: undefined,
  appEnv: appConfig.appEnv,
  appName: "Guide Pup",
  appVersion: undefined,
  buildVersion: undefined,
  bundleIdentifier: undefined,
  candidateIdentifier: undefined,
  emergencyDisclaimer: appConfig.emergencyDisclaimer,
  experimentalTabsEnabled: appConfig.enableExperimentalTabs,
  privacyPolicyUrl: appConfig.privacyPolicyUrl,
  releaseTrack: appConfig.releaseTrack,
  sourceRevision: undefined,
  crashReportingEnabled: false,
  slug: undefined,
  supportEmail: appConfig.supportEmail,
  supportUrl: appConfig.supportUrl,
  websiteUrl: appConfig.websiteUrl,
});

const createInitialStopBargeInSnapshot = (): DiagnosticsStopBargeInSnapshot => ({
  analysisInactiveAfterStop: null,
  armedDuringSpeech: false,
  attemptedDuringSpeech: false,
  audioCueAttempted: false,
  audioCueOutcome: "not-attempted",
  cameraInactiveAfterStop: null,
  cutThrough: null,
  feedbackObservedAt: null,
  guidancePaused: false,
  hapticAttempted: false,
  hapticOutcome: "not-attempted",
  listeningStoppedAfterStop: null,
  postStopObservedAt: null,
  recognizedDuringSpeech: false,
  staleSpeechAfterStop: null,
  updatedAt: Date.now(),
});

const createInitialSnapshot = (): DiagnosticsSnapshot => ({
  audioCue: {
    failureCount: 0,
    lastOutcome: "none",
    successCount: 0,
    updatedAt: Date.now(),
  },
  cameraPermission: null,
  distribution: {
    appStoreAppIdMatched: false,
    bundleVersionMatched: false,
    environment: "none",
    identityMatched: false,
    transactionVerified: false,
    updatedAt: Date.now(),
  },
  haptics: {
    failureCount: 0,
    lastOutcome: "none",
    successCount: 0,
    updatedAt: Date.now(),
  },
  lastAnalyze: null,
  lastHealthCheck: null,
  navigationLoop: {
    available: false,
    executionPath: "js-fallback",
    sessionActive: false,
    updatedAt: Date.now(),
  },
  recentAnalyzeEvents: [],
  runtime: createInitialRuntime(),
  session: {
    status: "unknown",
    updatedAt: Date.now(),
  },
  stopBargeIn: createInitialStopBargeInSnapshot(),
  voice: {
    available: false,
    executionPath: "js-fallback",
    listening: false,
    speaking: false,
    speechListeningOverlapActive: false,
    speechListeningOverlapCount: 0,
    unexpectedSpeechListeningOverlapCount: 0,
    updatedAt: Date.now(),
    voiceProcessingEnabled: false,
  },
});

let snapshot = createInitialSnapshot();
const listeners = new Set<() => void>();
const OMITTED_DIAGNOSTIC_TEXT = "Content omitted";
const SAFE_RECOGNIZED_COMMANDS = new Set([
  "start-guidance",
  "status",
  "help",
  "slower-speech",
  "faster-speech",
  "more-detail",
  "less-detail",
  "haptics-off",
  "haptics-on",
  "repeat",
  "what-do-you-see",
  "stop-guidance",
  "stop-guidance-partial",
]);

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(mutator: (current: DiagnosticsSnapshot) => DiagnosticsSnapshot) {
  snapshot = mutator(snapshot);
  emit();
}

export function createDiagnosticsEventId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function sanitizeUrlForDisplay(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (findDiagnosticsExportPrivacyIssues(trimmed).length > 0) {
    return OMITTED_DIAGNOSTIC_TEXT;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return trimmed;
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return trimmed;
  }
}

export function sanitizeMessage(value?: string, maxLength = 160) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (findDiagnosticsExportPrivacyIssues(trimmed).length > 0) {
    return OMITTED_DIAGNOSTIC_TEXT;
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

function sanitizeStructuredIdentifier(
  value: string | undefined,
  pattern: RegExp,
  allowedLiteral?: string,
) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return pattern.test(trimmed) || trimmed === allowedLiteral ? trimmed : undefined;
}

function omitFreeFormDiagnosticText(value?: string) {
  return value?.trim() ? OMITTED_DIAGNOSTIC_TEXT : undefined;
}

function sanitizeRecognizedCommand(value?: string) {
  const normalized = value?.trim().toLowerCase();
  return normalized && SAFE_RECOGNIZED_COMMANDS.has(normalized)
    ? normalized
    : omitFreeFormDiagnosticText(value);
}

const DIAGNOSTICS_EXPORT_PRIVACY_PATTERNS = [
  {
    label: "email address",
    pattern: /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  },
  {
    label: "phone number",
    pattern: /(?:(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]\d{3,4}[\s.-]\d{4}\b|(?:^|[^\d])(?:1)?[2-9]\d{2}[2-9]\d{6}(?!\d))/,
  },
  {
    label: "raw media",
    pattern: /data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,/i,
  },
  {
    label: "bearer credential",
    pattern: /\bbearer\s+[a-z0-9._~+/=-]{8,}/i,
  },
  {
    label: "JWT",
    pattern: /\beyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\b/i,
  },
  {
    label: "provider key",
    pattern: /\b(?:sk-(?:proj-|svcacct-)?[a-z0-9_-]{16,}|hf_[a-z0-9]{20,})\b/i,
  },
  {
    label: "keyed secret",
    pattern: /(?:^|[^a-z0-9])["']?(?:authorization|password|passcode|credential|credentials|secret|token|refresh[-_]?token|bootstrap[-_]?token|build[-_]?token|debug[-_]?benchmark[-_]?token|session[-_]?token|api[-_]?key|access[-_]?key|private[-_]?key|client[-_]?secret|signing[-_]?secret|secret[-_]?access[-_]?key|service[-_]?account[-_]?key|signature)["']?\s*[:=]\s*["']?(?:bearer\s+)?[^\s"',;}&]{8,}/i,
  },
  {
    label: "private key",
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    label: "signed URL",
    pattern: /https?:\/\/[^\s<>"']*[?&](?:x-amz-|x-goog-|signature|sig|token|key|expires)=/i,
  },
  {
    label: "local URI",
    pattern: /(?:file|content):\/\/[^\s<>"']+/i,
  },
  {
    label: "local path",
    pattern: /(?:^|[\s([{"'=])(?:\/(?:Users|private|var|tmp|Volumes|home|data|storage|sdcard)(?:\/[^\s<>"')\]}]+)+|[a-z]:\\)/i,
  },
  {
    label: "Apple device identifier",
    pattern: /(?:\b(?:udid|device(?:\s+id|\s+identifier)?)\b\s*[:=]?\s*)[0-9a-f]{40}\b/i,
  },
  {
    label: "long encoded value",
    pattern: /\b(?:[a-z0-9+/]{80,}={0,2}|[a-z0-9_-]{100,})\b/i,
  },
] as const;

export function findDiagnosticsExportPrivacyIssues(value: string) {
  return DIAGNOSTICS_EXPORT_PRIVACY_PATTERNS
    .filter(({ pattern }) => pattern.test(value))
    .map(({ label }) => label);
}

function sanitizeCaptureHeuristics(input?: DiagnosticsCaptureHeuristics) {
  if (!input) {
    return undefined;
  }

  const heuristics: DiagnosticsCaptureHeuristics = {
    captureLatencyMs: typeof input.captureLatencyMs === "number" ? input.captureLatencyMs : undefined,
    frameAgeMs: typeof input.frameAgeMs === "number" ? input.frameAgeMs : undefined,
    imageSource: input.imageSource,
    resizedForUpload: typeof input.resizedForUpload === "boolean" ? input.resizedForUpload : undefined,
    uploadedHeight: typeof input.uploadedHeight === "number" ? input.uploadedHeight : undefined,
    uploadedWidth: typeof input.uploadedWidth === "number" ? input.uploadedWidth : undefined,
  };

  return Object.values(heuristics).some((value) => value !== undefined) ? heuristics : undefined;
}

function sanitizeBoundedInteger(
  value: number | undefined,
  min: number,
  max: number,
) {
  return Number.isInteger(value) && value !== undefined && value >= min && value <= max
    ? value
    : undefined;
}

export function classifyAnalyzeError(errorMessage?: string) {
  const normalized = (errorMessage || "").toLowerCase();

  if (normalized.includes("timed out") || normalized.includes("timeout") || normalized.includes("abort")) {
    return "timeout" as const;
  }
  if (normalized.includes("unauthorized") || normalized.includes("401")) {
    return "unauthorized" as const;
  }
  if (normalized.includes("invalid response") || normalized.includes("unexpected token") || normalized.includes("json")) {
    return "invalid-response" as const;
  }
  if (
    normalized.includes("bootstr") ||
    normalized.includes("session") ||
    normalized.includes("network") ||
    normalized.includes("fetch") ||
    normalized.includes("api")
  ) {
    return "failure" as const;
  }

  return "failure" as const;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDiagnosticsSnapshot() {
  return snapshot;
}

export function useDiagnostics() {
  return useSyncExternalStore(subscribe, getDiagnosticsSnapshot, getDiagnosticsSnapshot);
}

export function setDiagnosticsRuntime(partial: Partial<DiagnosticsRuntimeSnapshot>) {
  updateSnapshot((current) => ({
    ...current,
    runtime: {
      ...current.runtime,
      ...partial,
      apiBaseUrl: partial.apiBaseUrl !== undefined ? sanitizeUrlForDisplay(partial.apiBaseUrl) : current.runtime.apiBaseUrl,
      privacyPolicyUrl:
        partial.privacyPolicyUrl !== undefined
          ? sanitizeUrlForDisplay(partial.privacyPolicyUrl)
          : current.runtime.privacyPolicyUrl,
      supportEmail: partial.supportEmail !== undefined ? partial.supportEmail : current.runtime.supportEmail,
      supportUrl: partial.supportUrl !== undefined ? sanitizeUrlForDisplay(partial.supportUrl) : current.runtime.supportUrl,
      websiteUrl: partial.websiteUrl !== undefined ? sanitizeUrlForDisplay(partial.websiteUrl) : current.runtime.websiteUrl,
    },
  }));
}

export function recordCameraPermissionSnapshot(snapshotInput: {
  canAskAgain: boolean;
  expires?: number | string;
  granted: boolean;
  status: string;
}) {
  updateSnapshot((current) => ({
    ...current,
    cameraPermission: {
      ...snapshotInput,
      updatedAt: Date.now(),
    },
  }));
}

export function recordDistributionEvidenceSnapshot(input: {
  appStoreAppIdMatched: boolean;
  bundleVersionMatched: boolean;
  environment: DiagnosticsDistributionEnvironment;
  identityMatched: boolean;
  transactionVerified: boolean;
}) {
  updateSnapshot((current) => ({
    ...current,
    distribution: {
      appStoreAppIdMatched: input.appStoreAppIdMatched,
      bundleVersionMatched: input.bundleVersionMatched,
      environment: input.environment,
      identityMatched: input.identityMatched,
      transactionVerified: input.transactionVerified,
      updatedAt: Date.now(),
    },
  }));
}

function normalizeDeviceIdSuffix(deviceId?: string) {
  if (!deviceId) {
    return undefined;
  }

  const trimmed = deviceId.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > 8 ? trimmed.slice(-8) : trimmed;
}

export function recordSessionBootstrapState(input: {
  deviceId?: string;
  error?: string;
  expiresAt?: string;
  requestId?: string;
  status: DiagnosticsSessionStatus;
}) {
  updateSnapshot((current) => ({
    ...current,
    session: {
      deviceIdSuffix: input.deviceId ? normalizeDeviceIdSuffix(input.deviceId) : current.session.deviceIdSuffix,
      error: omitFreeFormDiagnosticText(input.error),
      expiresAt: input.expiresAt ?? current.session.expiresAt,
      requestId:
        sanitizeStructuredIdentifier(input.requestId, DIAGNOSTICS_REQUEST_ID_PATTERN)
        ?? current.session.requestId,
      status: input.status,
      updatedAt: Date.now(),
    },
  }));
}

export function recordSessionCleared() {
  updateSnapshot((current) => ({
    ...current,
    session: {
      status: "cleared",
      updatedAt: Date.now(),
    },
  }));
}

export function recordHealthCheckSnapshot(input: {
  analyzeDeviceRateLimitPerMinute?: number;
  analyzeIpRateLimitPerMinute?: number;
  benchmarkProviders?: string[];
  bootstrapIpRateLimitPerMinute?: number;
  defaultMaxCompletionTokens?: number;
  defaultModel?: string;
  defaultProvider?: string;
  defaultReasoningEffort?: string;
  defaultRequestTimeoutMs?: number;
  defaultRetryCount?: number;
  defaultRetryDelayMs?: number;
  deploymentIdentityValid?: boolean;
  environment?: string;
  error?: string;
  ok: boolean;
  promptVersion?: string;
  providerGlobalCallLimitPerMinute?: number;
  requestId?: string;
  latencyMs?: number;
  sessionTtlSeconds?: number;
  sourceRevision?: string;
  structuredOutputMode?: string;
  workerIdentity?: string;
  workerVersionId?: string;
}) {
  updateSnapshot((current) => ({
    ...current,
    lastHealthCheck: {
      analyzeDeviceRateLimitPerMinute: sanitizeBoundedInteger(
        input.analyzeDeviceRateLimitPerMinute,
        1,
        60,
      ),
      analyzeIpRateLimitPerMinute: sanitizeBoundedInteger(
        input.analyzeIpRateLimitPerMinute,
        10,
        300,
      ),
      benchmarkProviders: input.benchmarkProviders
        ?.map((provider) => sanitizeMessage(provider, 64))
        .filter((provider): provider is string => Boolean(provider))
        .slice(0, 4),
      bootstrapIpRateLimitPerMinute: sanitizeBoundedInteger(
        input.bootstrapIpRateLimitPerMinute,
        1,
        60,
      ),
      checkedAt: Date.now(),
      defaultMaxCompletionTokens: sanitizeBoundedInteger(
        input.defaultMaxCompletionTokens,
        128,
        1200,
      ),
      defaultModel: sanitizeMessage(input.defaultModel, 64),
      defaultProvider: sanitizeMessage(input.defaultProvider, 64),
      defaultReasoningEffort: sanitizeMessage(input.defaultReasoningEffort, 16),
      defaultRequestTimeoutMs: sanitizeBoundedInteger(
        input.defaultRequestTimeoutMs,
        3000,
        30000,
      ),
      defaultRetryCount: sanitizeBoundedInteger(input.defaultRetryCount, 0, 2),
      defaultRetryDelayMs: sanitizeBoundedInteger(input.defaultRetryDelayMs, 0, 2000),
      deploymentIdentityValid:
        typeof input.deploymentIdentityValid === "boolean"
          ? input.deploymentIdentityValid
          : undefined,
      environment: sanitizeMessage(input.environment, 32),
      error: omitFreeFormDiagnosticText(input.error),
      latencyMs: input.latencyMs,
      ok: input.ok,
      promptVersion: sanitizeMessage(input.promptVersion, 40),
      providerGlobalCallLimitPerMinute: sanitizeBoundedInteger(
        input.providerGlobalCallLimitPerMinute,
        20,
        600,
      ),
      requestId: sanitizeStructuredIdentifier(input.requestId, DIAGNOSTICS_REQUEST_ID_PATTERN),
      sessionTtlSeconds: sanitizeBoundedInteger(
        input.sessionTtlSeconds,
        5 * 60,
        7 * 24 * 60 * 60,
      ),
      sourceRevision: sanitizeStructuredIdentifier(
        input.sourceRevision,
        DIAGNOSTICS_GIT_REVISION_PATTERN,
        "development",
      ),
      structuredOutputMode: sanitizeMessage(input.structuredOutputMode, 32),
      workerIdentity: sanitizeStructuredIdentifier(
        input.workerIdentity,
        DIAGNOSTICS_WORKER_ID_PATTERN,
      ),
      workerVersionId: sanitizeStructuredIdentifier(
        input.workerVersionId,
        DIAGNOSTICS_REQUEST_ID_PATTERN,
        "development",
      ),
    },
  }));
}

export function recordNavigationLoopSnapshot(input: {
  available?: boolean;
  executionPath?: DiagnosticsNavigationExecutionPath;
  lastCaptureLatencyMs?: number;
  lastError?: string | null;
  lastTotalGuidanceLoopLatencyMs?: number;
  recoveryState?: DiagnosticsRecoveryState;
  sessionActive?: boolean;
  voiceOverRunning?: boolean;
}) {
  updateSnapshot((current) => ({
    ...current,
    navigationLoop: {
      ...current.navigationLoop,
      available: input.available ?? current.navigationLoop.available,
      executionPath: input.executionPath ?? current.navigationLoop.executionPath,
      lastCaptureLatencyMs: input.lastCaptureLatencyMs ?? current.navigationLoop.lastCaptureLatencyMs,
      lastError:
        input.lastError === undefined
          ? current.navigationLoop.lastError
          : omitFreeFormDiagnosticText(input.lastError ?? undefined),
      lastTotalGuidanceLoopLatencyMs:
        input.lastTotalGuidanceLoopLatencyMs ?? current.navigationLoop.lastTotalGuidanceLoopLatencyMs,
      recoveryState: input.recoveryState ?? current.navigationLoop.recoveryState,
      sessionActive: input.sessionActive ?? current.navigationLoop.sessionActive,
      updatedAt: Date.now(),
      voiceOverRunning: input.voiceOverRunning ?? current.navigationLoop.voiceOverRunning,
    },
  }));
}

export function recordHapticSnapshot(input: {
  error?: string;
  executionPath?: DiagnosticsNavigationExecutionPath;
  outcome?: Exclude<DiagnosticsHapticOutcome, "none">;
  type: string;
}) {
  const now = Date.now();
  updateSnapshot((current) => {
    const outcome = input.outcome ?? "none";
    const isCompletion = Boolean(input.outcome);

    return {
      ...current,
      haptics: {
        failureCount: current.haptics.failureCount + (input.outcome === "failure" ? 1 : 0),
        lastAttemptedAt: isCompletion ? current.haptics.lastAttemptedAt : now,
        lastCompletedAt: isCompletion ? now : current.haptics.lastCompletedAt,
        lastError: omitFreeFormDiagnosticText(input.error),
        lastExecutionPath: input.executionPath ?? current.haptics.lastExecutionPath,
        lastOutcome: outcome,
        lastType: sanitizeMessage(input.type, 40),
        successCount: current.haptics.successCount + (input.outcome === "success" ? 1 : 0),
        updatedAt: now,
      },
    };
  });
}

export function recordAudioCueSnapshot(input: {
  error?: string;
  executionPath?: DiagnosticsNavigationExecutionPath;
  outcome?: Exclude<DiagnosticsAudioCueOutcome, "none">;
  type: string;
}) {
  const now = Date.now();
  updateSnapshot((current) => {
    const outcome = input.outcome ?? "none";
    const isCompletion = Boolean(input.outcome);

    return {
      ...current,
      audioCue: {
        failureCount: current.audioCue.failureCount + (input.outcome === "failure" ? 1 : 0),
        lastAttemptedAt: isCompletion ? current.audioCue.lastAttemptedAt : now,
        lastCompletedAt: isCompletion ? now : current.audioCue.lastCompletedAt,
        lastError: omitFreeFormDiagnosticText(input.error),
        lastExecutionPath: input.executionPath ?? current.audioCue.lastExecutionPath,
        lastOutcome: outcome,
        lastType: sanitizeMessage(input.type, 40),
        successCount: current.audioCue.successCount + (input.outcome === "success" ? 1 : 0),
        updatedAt: now,
      },
    };
  });
}

export function recordVoiceSnapshot(input: {
  available?: boolean;
  executionPath?: DiagnosticsVoiceExecutionPath;
  lastError?: string | null;
  lastRecognizedAt?: number;
  lastRecognizedCommand?: string | null;
  lastRecognizedCommandPhase?: DiagnosticsVoiceRecognitionPhase;
  speechListeningOverlapReason?: DiagnosticsSpeechListeningOverlapReason;
  lastVoiceStateChangedAt?: number;
  listening?: boolean;
  microphonePermission?: string;
  recoveryState?: DiagnosticsRecoveryState;
  speaking?: boolean;
  speechPermission?: string;
  voiceProcessingEnabled?: boolean;
}) {
  const now = Date.now();
  const hasVoiceStateChange = input.listening !== undefined || input.speaking !== undefined;

  updateSnapshot((current) => {
    const nextListening = input.listening ?? current.voice.listening;
    const nextSpeaking = input.speaking ?? current.voice.speaking;
    const nextOverlapActive = nextListening && nextSpeaking;
    const isNewOverlap = nextOverlapActive && !current.voice.speechListeningOverlapActive;
    const nextOverlapReason: DiagnosticsSpeechListeningOverlapReason | undefined = isNewOverlap
      ? input.speechListeningOverlapReason ?? "unexpected"
      : current.voice.lastSpeechListeningOverlapReason;

    return {
      ...current,
      voice: {
      ...current.voice,
      available: input.available ?? current.voice.available,
      executionPath: input.executionPath ?? current.voice.executionPath,
      lastError:
        input.lastError === undefined
          ? current.voice.lastError
          : omitFreeFormDiagnosticText(input.lastError ?? undefined),
      lastRecognizedCommand:
        input.lastRecognizedCommand === undefined
          ? current.voice.lastRecognizedCommand
          : sanitizeRecognizedCommand(input.lastRecognizedCommand ?? undefined),
      lastRecognizedAt:
        input.lastRecognizedCommandPhase !== undefined || input.lastRecognizedAt !== undefined
          ? input.lastRecognizedAt ?? now
          : current.voice.lastRecognizedAt,
      lastRecognizedCommandPhase: input.lastRecognizedCommandPhase ?? current.voice.lastRecognizedCommandPhase,
      lastSpeechListeningOverlapAt: isNewOverlap ? now : current.voice.lastSpeechListeningOverlapAt,
      lastSpeechListeningOverlapReason: nextOverlapReason,
      lastVoiceStateChangedAt:
        input.lastVoiceStateChangedAt ?? (hasVoiceStateChange ? now : current.voice.lastVoiceStateChangedAt),
      listening: nextListening,
      microphonePermission:
        input.microphonePermission === undefined
          ? current.voice.microphonePermission
          : sanitizeMessage(input.microphonePermission, 32),
      recoveryState: input.recoveryState ?? current.voice.recoveryState,
      speaking: nextSpeaking,
      speechListeningOverlapActive: nextOverlapActive,
      speechListeningOverlapCount:
        current.voice.speechListeningOverlapCount + (isNewOverlap ? 1 : 0),
      speechPermission:
        input.speechPermission === undefined
          ? current.voice.speechPermission
          : sanitizeMessage(input.speechPermission, 32),
      unexpectedSpeechListeningOverlapCount:
        current.voice.unexpectedSpeechListeningOverlapCount
        + (isNewOverlap && nextOverlapReason === "unexpected" ? 1 : 0),
      updatedAt: now,
      voiceProcessingEnabled: input.voiceProcessingEnabled ?? current.voice.voiceProcessingEnabled,
    },
    };
  });
}

export function recordStopBargeInSnapshot(input: Partial<Omit<DiagnosticsStopBargeInSnapshot, "updatedAt">>) {
  const now = Date.now();

  updateSnapshot((current) => ({
    ...current,
    stopBargeIn: {
      ...current.stopBargeIn,
      analysisInactiveAfterStop:
        input.analysisInactiveAfterStop !== undefined
          ? input.analysisInactiveAfterStop
          : current.stopBargeIn.analysisInactiveAfterStop,
      armedAt: input.armedAt ?? current.stopBargeIn.armedAt,
      armedDuringSpeech: input.armedDuringSpeech ?? current.stopBargeIn.armedDuringSpeech,
      attemptedDuringSpeech: input.attemptedDuringSpeech ?? current.stopBargeIn.attemptedDuringSpeech,
      audioCueAttempted: input.audioCueAttempted ?? current.stopBargeIn.audioCueAttempted,
      audioCueOutcome: input.audioCueOutcome ?? current.stopBargeIn.audioCueOutcome,
      cameraInactiveAfterStop:
        input.cameraInactiveAfterStop !== undefined
          ? input.cameraInactiveAfterStop
          : current.stopBargeIn.cameraInactiveAfterStop,
      cutThrough: input.cutThrough !== undefined ? input.cutThrough : current.stopBargeIn.cutThrough,
      feedbackObservedAt:
        input.feedbackObservedAt !== undefined
          ? input.feedbackObservedAt
          : current.stopBargeIn.feedbackObservedAt,
      guidancePaused: input.guidancePaused ?? current.stopBargeIn.guidancePaused,
      hapticAttempted: input.hapticAttempted ?? current.stopBargeIn.hapticAttempted,
      hapticOutcome: input.hapticOutcome ?? current.stopBargeIn.hapticOutcome,
      lastRecognizedAt: input.lastRecognizedAt ?? current.stopBargeIn.lastRecognizedAt,
      listeningStoppedAfterStop:
        input.listeningStoppedAfterStop !== undefined
          ? input.listeningStoppedAfterStop
          : current.stopBargeIn.listeningStoppedAfterStop,
      postStopObservedAt:
        input.postStopObservedAt !== undefined
          ? input.postStopObservedAt
          : current.stopBargeIn.postStopObservedAt,
      recognizedCommand: input.recognizedCommand ?? current.stopBargeIn.recognizedCommand,
      recognizedDuringSpeech: input.recognizedDuringSpeech ?? current.stopBargeIn.recognizedDuringSpeech,
      recognizedPhase: input.recognizedPhase ?? current.stopBargeIn.recognizedPhase,
      staleSpeechAfterStop:
        input.staleSpeechAfterStop !== undefined
          ? input.staleSpeechAfterStop
          : current.stopBargeIn.staleSpeechAfterStop,
      stopEventId: input.stopEventId ?? current.stopBargeIn.stopEventId,
      updatedAt: now,
    },
  }));
}

export function resetStopBargeInSnapshot() {
  updateSnapshot((current) => ({
    ...current,
    stopBargeIn: createInitialStopBargeInSnapshot(),
  }));
}

export function recordAnalyzeEvent(
  input: Omit<DiagnosticsAnalyzeEvent, "id" | "timestamp"> & {
    timestamp?: number;
    id?: string;
  },
) {
  const event: DiagnosticsAnalyzeEvent = {
    ...input,
    appVersion: sanitizeMessage(input.appVersion, 64),
    captureHeuristics: sanitizeCaptureHeuristics(input.captureHeuristics),
    confidence: input.confidence,
    direction: input.direction,
    error: omitFreeFormDiagnosticText(input.error),
    fallbackReason: omitFreeFormDiagnosticText(input.fallbackReason),
    frameId: sanitizeMessage(input.frameId, 80),
    frameSummary: omitFreeFormDiagnosticText(input.frameSummary),
    frameTimestampMs: input.frameTimestampMs,
    id: input.id || createDiagnosticsEventId(),
    hasImage: input.hasImage,
    interactionMode: input.interactionMode,
    latencyMs: input.latencyMs,
    lighting: input.lighting,
    message: omitFreeFormDiagnosticText(input.message),
    model: sanitizeMessage(input.model, 64),
    nativePath: input.nativePath,
    platform: sanitizeMessage(input.platform, 16),
    priorGuidanceSummary: omitFreeFormDiagnosticText(input.priorGuidanceSummary),
    promptVersion: sanitizeMessage(input.promptVersion, 40),
    provider: sanitizeMessage(input.provider, 64),
    requestId: sanitizeStructuredIdentifier(input.requestId, DIAGNOSTICS_REQUEST_ID_PATTERN),
    sampledFrame: input.sampledFrame,
    safeReason: omitFreeFormDiagnosticText(input.safeReason),
    sceneDescription: omitFreeFormDiagnosticText(input.sceneDescription),
    sessionId: sanitizeMessage(input.sessionId, 80),
    surfaceType: omitFreeFormDiagnosticText(input.surfaceType),
    walkability: input.walkability,
    timestamp: input.timestamp ?? Date.now(),
  };

  updateSnapshot((current) => ({
    ...current,
    lastAnalyze: event,
    recentAnalyzeEvents: [event, ...current.recentAnalyzeEvents].slice(0, MAX_ANALYZE_EVENTS),
  }));
}

export function formatDiagnosticsEventSummary(event: DiagnosticsAnalyzeEvent) {
  const pieces = [`${event.outcome}`];
  if (typeof event.latencyMs === "number") {
    pieces.push(`${Math.round(event.latencyMs)}ms`);
  }
  if (event.direction) {
    pieces.push(event.direction);
  }
  if (event.hazardLevel) {
    pieces.push(`hazard:${event.hazardLevel}`);
  }
  if (typeof event.confidence === "number") {
    pieces.push(`conf:${Math.round(event.confidence * 100)}%`);
  }
  return pieces.join(" • ");
}

export function getAnalyzeExecutionPath(event: DiagnosticsAnalyzeEvent | null) {
  if (!event) {
    return "Not found in repo";
  }

  if (event.outcome === "success") {
    return "provider-backed";
  }

  if (event.outcome === "safe-response") {
    return "safe fallback";
  }

  return "request failed";
}

export interface DiagnosticsEvidenceSettingsSnapshot {
  descriptionMode?: string;
  hapticsEnabled?: boolean;
  speechRate?: string;
}

function inferEvidenceReleaseTrack(releaseTrack: string) {
  if (releaseTrack === "testflight") {
    return "testflight";
  }
  if (releaseTrack === "app-store") {
    return "store";
  }
  return "preview";
}

function inferEvidenceEnvironment(input: DiagnosticsSnapshot) {
  const apiBaseUrl = input.runtime.apiBaseUrl || "";
  if (input.lastHealthCheck?.environment === "production" || apiBaseUrl.includes("production")) {
    return "production";
  }
  return "staging";
}

function analyzeEventHasStructuredFields(event?: DiagnosticsAnalyzeEvent | null) {
  return Boolean(
    event?.outcome === "success"
    && event.confidence !== undefined
    && event.direction
    && event.hazardLevel
    && event.lighting
    && event.message
    && event.model
    && event.obstacle !== undefined
    && event.promptVersion
    && event.provider
    && event.sceneDescription
    && event.surfaceType
    && event.walkability,
  );
}

function findAnalyzeEventForPath(input: DiagnosticsSnapshot, nativePath: DiagnosticsNavigationExecutionPath) {
  return input.recentAnalyzeEvents.find((event) => event.nativePath === nativePath && event.outcome === "success")
    || (input.lastAnalyze?.nativePath === nativePath ? input.lastAnalyze : undefined);
}

function findAnalyzeEventForInteractionMode(
  input: DiagnosticsSnapshot,
  interactionMode: DiagnosticsVisionInteractionMode,
) {
  return input.recentAnalyzeEvents.find((event) =>
    event.interactionMode === interactionMode && Boolean(event.requestId))
    || (
      input.lastAnalyze?.interactionMode === interactionMode
        ? input.lastAnalyze
        : undefined
    );
}

function buildCameraPathEvidence(nativePath: DiagnosticsNavigationExecutionPath, event?: DiagnosticsAnalyzeEvent) {
  return {
    captureHeuristics: {
      captureLatencyMs: event?.captureHeuristics?.captureLatencyMs ?? -1,
      frameAgeMs: event?.captureHeuristics?.frameAgeMs ?? -1,
      imageSource: event?.captureHeuristics?.imageSource || "unknown",
      resizedForUpload: event?.captureHeuristics?.resizedForUpload ?? false,
      uploadedHeight: event?.captureHeuristics?.uploadedHeight || 0,
      uploadedWidth: event?.captureHeuristics?.uploadedWidth || 0,
    },
    frameSummary: "",
    hasImage: event?.hasImage === true,
    nativePath,
    outcome: event?.outcome === "success" ? "success" : "missing",
    requestId: event?.requestId || "",
    sampledFrame: event?.sampledFrame === true,
    sourceHeight: event?.sourceHeight || 0,
    sourceWidth: event?.sourceWidth || 0,
    uploadedHeight: event?.captureHeuristics?.uploadedHeight || 0,
    uploadedWidth: event?.captureHeuristics?.uploadedWidth || 0,
  };
}

function buildNoScreenSequenceDraft(input: DiagnosticsSnapshot) {
  const baseStep = (id: string) => ({
    eventId: "",
    id,
    noScreenRequired: false,
    notes: "",
    observedAt: "",
    pass: false,
    spokenFeedbackConfirmed: false,
    voiceRecognized: false,
  });

  return [
    {
      ...baseStep("cold-prompt"),
      voiceRecognized: undefined,
    },
    {
      ...baseStep("start-guidance"),
      cameraSessionActive: input.navigationLoop.sessionActive,
    },
    {
      ...baseStep("status"),
      statusIncludesSettings: false,
    },
    {
      ...baseStep("help"),
      helpIncludesBoundedCommandList: false,
      settingsChanged: false,
    },
    {
      ...baseStep("slower-speech"),
      settingPersisted: false,
    },
    {
      ...baseStep("faster-speech"),
      settingPersisted: false,
    },
    {
      ...baseStep("more-detail"),
      settingPersisted: false,
    },
    {
      ...baseStep("less-detail"),
      settingPersisted: false,
    },
    {
      ...baseStep("haptics-off"),
      hapticBehaviorConfirmed: false,
    },
    {
      ...baseStep("haptics-on"),
      hapticBehaviorConfirmed: false,
    },
    {
      ...baseStep("repeat"),
      repeatedLastUtterance: false,
    },
    {
      ...baseStep("what-do-you-see"),
      conversationLane: false,
      sampledFrameUsed: input.lastAnalyze?.sampledFrame === true,
      settingsChanged: false,
    },
    {
      ...baseStep("stop-guidance"),
      eventId: input.stopBargeIn.stopEventId || "",
      observedAt: input.stopBargeIn.lastRecognizedAt
        ? new Date(input.stopBargeIn.lastRecognizedAt).toISOString()
        : "",
      stopCutThrough: input.stopBargeIn.cutThrough === true
        && input.stopBargeIn.recognizedDuringSpeech
        && input.stopBargeIn.recognizedPhase === "partial"
        && input.stopBargeIn.analysisInactiveAfterStop === true
        && input.stopBargeIn.cameraInactiveAfterStop === true
        && input.stopBargeIn.listeningStoppedAfterStop === true
        && input.stopBargeIn.staleSpeechAfterStop === false,
    },
  ];
}

function buildStopBargeInEvidenceDraft(input: DiagnosticsSnapshot) {
  const toIsoDate = (value?: number | null) =>
    typeof value === "number" && Number.isFinite(value)
      ? new Date(value).toISOString()
      : "";

  return {
    analysisInactiveAfterStop: input.stopBargeIn.analysisInactiveAfterStop,
    armedDuringSpeech: input.stopBargeIn.armedDuringSpeech,
    attemptedDuringSpeech: input.stopBargeIn.attemptedDuringSpeech,
    audioCueAttempted: input.stopBargeIn.audioCueAttempted,
    audioCueOutcome: input.stopBargeIn.audioCueOutcome,
    cameraInactiveAfterStop: input.stopBargeIn.cameraInactiveAfterStop,
    cutThrough: input.stopBargeIn.cutThrough,
    eventId: input.stopBargeIn.stopEventId || "",
    feedbackObservedAt: toIsoDate(input.stopBargeIn.feedbackObservedAt),
    guidancePaused: input.stopBargeIn.guidancePaused,
    hapticAttempted: input.stopBargeIn.hapticAttempted,
    hapticOutcome: input.stopBargeIn.hapticOutcome,
    lastSpeechListeningOverlapReason:
      input.voice.lastSpeechListeningOverlapReason || "",
    listeningStoppedAfterStop: input.stopBargeIn.listeningStoppedAfterStop,
    observedAt: toIsoDate(input.stopBargeIn.lastRecognizedAt),
    postStopObservedAt: toIsoDate(input.stopBargeIn.postStopObservedAt),
    recognizedCommand: input.stopBargeIn.recognizedCommand || "",
    recognizedDuringSpeech: input.stopBargeIn.recognizedDuringSpeech,
    recognizedPhase: input.stopBargeIn.recognizedPhase || "",
    speechListeningInvariant:
      input.voice.unexpectedSpeechListeningOverlapCount === 0
      && (
        !input.voice.speechListeningOverlapActive
        || input.voice.lastSpeechListeningOverlapReason === "stop-barge-in"
      )
        ? "PASS"
        : "FAIL",
    staleSpeechAfterStop: input.stopBargeIn.staleSpeechAfterStop,
    unexpectedSpeechListeningOverlapCount:
      input.voice.unexpectedSpeechListeningOverlapCount,
  };
}

export function buildNoScreenSmokeEvidenceDraft(
  input = getDiagnosticsSnapshot(),
  options: { settings?: DiagnosticsEvidenceSettingsSnapshot } = {},
) {
  const generatedAt = new Date().toISOString();
  const releaseTrack = inferEvidenceReleaseTrack(input.runtime.releaseTrack);
  const environment = inferEvidenceEnvironment(input);
  const providerBacked = input.lastAnalyze?.outcome === "success";
  const nativeCoreEvent = findAnalyzeEventForPath(input, "native-core");
  const jsFallbackEvent = findAnalyzeEventForPath(input, "js-fallback");
  const guidanceEvent = findAnalyzeEventForInteractionMode(input, "guidance");
  const sceneQueryEvent = findAnalyzeEventForInteractionMode(input, "scene-query");
  const currentSettings = {
    descriptionMode: options.settings?.descriptionMode || "short",
    hapticsEnabled: options.settings?.hapticsEnabled ?? true,
    speechRate: options.settings?.speechRate || "normal",
  };
  const stopBargeInConfirmed = input.stopBargeIn.cutThrough === true
    && input.stopBargeIn.recognizedDuringSpeech
    && input.stopBargeIn.recognizedPhase === "partial"
    && input.stopBargeIn.analysisInactiveAfterStop === true
    && input.stopBargeIn.cameraInactiveAfterStop === true
    && input.stopBargeIn.listeningStoppedAfterStop === true
    && input.stopBargeIn.staleSpeechAfterStop === false
    && typeof input.stopBargeIn.postStopObservedAt === "number";

  return {
    appStoreConnectBuildRecordIdentifier: "",
    artifactVersion: 3,
    assistiveTech: {
      audioCuesAudible: false,
      hapticsFelt: false,
      speechInputConfirmed: false,
      spokenOutputConfirmed: false,
      voiceProcessingEnabled: input.voice.voiceProcessingEnabled,
      voiceOverRunning: input.navigationLoop.voiceOverRunning === true,
    },
    backendSmoke: {
      analyzeStatusCode: providerBacked ? 200 : 0,
      apiBaseUrl: input.runtime.apiBaseUrl || "",
      artifactVersion: 0,
      bootstrapStatusCode: input.session.status === "ready" ? 200 : 0,
      environment,
      executionPath: getAnalyzeExecutionPath(input.lastAnalyze),
      generatedAt: "",
      healthStatusCode: input.lastHealthCheck?.ok ? 200 : 0,
      model: input.lastAnalyze?.model || input.lastHealthCheck?.defaultModel || "",
      promptVersion: input.lastAnalyze?.promptVersion || input.lastHealthCheck?.promptVersion || "",
      provenance: {
        sourceRevision: input.lastHealthCheck?.sourceRevision || "",
        workerDeploymentId: "",
        workerVersionCreatedAt: "",
        workerVersionId: input.lastHealthCheck?.workerVersionId || "",
      },
      providerBacked,
      requestIds: {
        analyze: input.lastAnalyze?.requestId || "",
        bootstrap: input.session.requestId || "",
        guidanceAnalyze: guidanceEvent?.requestId || "",
        health: input.lastHealthCheck?.requestId || "",
        sceneQueryAnalyze: sceneQueryEvent?.requestId || "",
      },
      structuredOutputValid: analyzeEventHasStructuredFields(input.lastAnalyze),
      walkability: input.lastAnalyze?.walkability || "",
    },
    cameraPaths: {
      jsFallback: buildCameraPathEvidence("js-fallback", jsFallbackEvent),
      nativeCore: buildCameraPathEvidence("native-core", nativeCoreEvent),
    },
    commandSequences: {
      jsFallback: {
        analyzeRequestId: jsFallbackEvent?.requestId || "",
        completedAt: "",
        executionId: "",
        executionPath: "js-fallback",
        startedAt: "",
        steps: buildNoScreenSequenceDraft(input),
        stopBargeIn: buildStopBargeInEvidenceDraft(input),
      },
      nativeCore: {
        analyzeRequestId: nativeCoreEvent?.requestId || "",
        completedAt: "",
        executionId: "",
        executionPath: "native-core",
        startedAt: "",
        steps: buildNoScreenSequenceDraft(input),
        stopBargeIn: buildStopBargeInEvidenceDraft(input),
      },
    },
    device: {
      appVersion: input.runtime.appVersion || "",
      buildNumber: input.runtime.buildVersion || "",
      buildProfile: releaseTrack,
      bundleIdentifier: input.runtime.bundleIdentifier || "",
      identifierSuffix: input.session.deviceIdSuffix || "",
      model: "",
      osVersion: "",
    },
    deviceReadiness: {
      coreDeviceExecutionReady: false,
      coreDeviceProbe: {
        checkedAt: "",
        exitStatus: null,
        outcome: "not-run",
        type: "devicectl-process-info",
      },
      ddiServicesAvailable: false,
      developerModeEnabled: false,
      paired: false,
      result: "draft",
      trusted: false,
      tunnelConnected: false,
      usbOrSameLan: false,
      xcodeDestinationAvailable: false,
      xctraceVisible: false,
    },
    diagnostics: {
      audioCues: {
        failureCount: input.audioCue.failureCount,
        lastExecutionPath: input.audioCue.lastExecutionPath || "",
        lastOutcome: input.audioCue.lastOutcome,
        lastType: input.audioCue.lastType || "",
        successCount: input.audioCue.successCount,
      },
      haptics: {
        failureCount: input.haptics.failureCount,
        lastExecutionPath: input.haptics.lastExecutionPath || "",
        lastOutcome: input.haptics.lastOutcome,
        lastType: input.haptics.lastType || "",
        successCount: input.haptics.successCount,
      },
      jsFallbackCaptureConfirmed: Boolean(jsFallbackEvent),
      nativeCameraCaptureConfirmed: Boolean(nativeCoreEvent),
      noRawMediaOrSecrets: true,
      settingsPersistedAfterRestart: false,
      speechListeningInvariant:
        input.voice.unexpectedSpeechListeningOverlapCount === 0
        && (!input.voice.speechListeningOverlapActive || input.voice.lastSpeechListeningOverlapReason === "stop-barge-in")
          ? "PASS"
          : "FAIL",
      stopBargeInConfirmed,
      unexpectedSpeechListeningOverlapCount: input.voice.unexpectedSpeechListeningOverlapCount,
      voiceProcessingEnabled: input.voice.voiceProcessingEnabled,
      voiceOverRunning: input.navigationLoop.voiceOverRunning === true,
    },
    generatedAt,
    humanAttestation: {
      attestedAt: "",
      blindParticipantSelfAttested: false,
      installationSourceConfirmed: false,
      nonvisualOperationConfirmed: false,
      participantRoleConfirmed: false,
      sensoryObservationsConfirmed: false,
    },
    installationEvidence: {
      appStoreAppIdMatched: input.distribution.appStoreAppIdMatched,
      appTransactionVerified: input.distribution.transactionVerified,
      appIdentityMatched: input.distribution.identityMatched,
      bundleVersionMatched: input.distribution.bundleVersionMatched,
      distributionEnvironment: input.distribution.environment,
      installedValidationIpaSha256: "",
      storeKitEvidencePurpose: "apple-signed-app-identity-only",
    },
    installationSource: "unverified",
    interactionAssistance: "unverified",
    interruptionRecovery: {
      audioRoute: {
        attempted: false,
        boundedRecoveryConfirmed: false,
        conservativeStopConfirmed: false,
        explicitRestartConfirmed: false,
        explicitRestartRequired: false,
        guidanceInactiveAfterInterruption: false,
        noContinuedGuidance: false,
        recoveryLatencyMs: -1,
      },
      backgroundForeground: {
        attempted: false,
        boundedRecoveryConfirmed: false,
        conservativeStopConfirmed: false,
        explicitRestartConfirmed: false,
        explicitRestartRequired: false,
        guidanceInactiveAfterInterruption: false,
        noContinuedGuidance: false,
        recoveryLatencyMs: -1,
      },
    },
    noScreen: {
      cleanInstallOrReset: false,
      nonvisualOperation: false,
      noScreenUsed: false,
      visualScreenInspectionUsed: false,
      voiceAndVoiceOverOnly: false,
    },
    operator: "operator-required",
    participantLabel: "participant-required",
    participantRole: "unverified",
    privacy: {
      containsFullDeviceIds: false,
      containsIdentityContactData: false,
      containsRawAudio: false,
      containsRawMedia: false,
      containsSecrets: false,
      containsSignedUrls: false,
    },
    provenance: {
      apiBaseUrlLabel: environment,
      apiEnvironment: environment,
      appVersion: input.runtime.appVersion || "",
      artifactType: "real-iphone-no-screen-smoke",
      buildNumber: input.runtime.buildVersion || "",
      buildProfile: releaseTrack,
      bundleIdentifier: input.runtime.bundleIdentifier || "",
      candidateBinarySha256: "",
      candidateIdentifier: input.runtime.candidateIdentifier || "",
      generatedAt,
      releaseTrack,
      runId: `no-screen-smoke-${generatedAt.replace(/[:.]/g, "-")}`,
      schemaVersion: 3,
      sourceRevision: input.runtime.sourceRevision || "",
    },
    settingsPersistence: {
      afterRelaunch: currentSettings,
      afterRestore: currentSettings,
      afterVoiceChange: currentSettings,
      before: currentSettings,
      nonDefaultSettingSurvivedRelaunch: false,
      restoredDefaultsAfterValidation: false,
    },
    validationMode: "real-iphone-no-screen",
    visualScreenUse: "unverified",
    visualPromptingUsed: null,
    voiceOver: {
      runningAtExport: input.navigationLoop.voiceOverRunning === true,
      runningAtStart: false,
      runningAtStop: false,
      runningDuringGuidance: input.navigationLoop.voiceOverRunning === true,
    },
  };
}

export function buildNoScreenSmokeEvidenceDraftJson(
  input = getDiagnosticsSnapshot(),
  options: { settings?: DiagnosticsEvidenceSettingsSnapshot } = {},
) {
  return JSON.stringify(buildNoScreenSmokeEvidenceDraft(input, options), null, 2);
}

export function buildDiagnosticsReport(input = getDiagnosticsSnapshot()) {
  const lines: string[] = [];
  const { runtime, cameraPermission, session, lastHealthCheck, lastAnalyze, recentAnalyzeEvents } = input;

  lines.push("# Guide Pup Diagnostics");
  lines.push("");
  lines.push("## Runtime");
  lines.push(`- App: ${runtime.appName}`);
  lines.push(`- Environment: ${runtime.appEnv}`);
  lines.push(`- Release track: ${runtime.releaseTrack}`);
  lines.push(`- Candidate identifier: ${runtime.candidateIdentifier || "Not found in repo"}`);
  lines.push(`- Source revision: ${runtime.sourceRevision || "Not found in repo"}`);
  lines.push(`- App transaction verified: ${input.distribution.transactionVerified ? "yes" : "no"}`);
  lines.push(`- App identity matched: ${input.distribution.identityMatched ? "yes" : "no"}`);
  lines.push(`- Distribution environment: ${input.distribution.environment}`);
  lines.push(`- Version: ${runtime.appVersion || "Not found in repo"}`);
  lines.push(`- Build: ${runtime.buildVersion || "Not found in repo"}`);
  lines.push(`- Bundle ID: ${runtime.bundleIdentifier || "Not found in repo"}`);
  lines.push(`- API base URL: ${runtime.apiBaseUrl || "Not configured"}`);
  lines.push(`- Crash reporting: ${runtime.crashReportingEnabled ? "enabled" : "not embedded"}`);
  lines.push(`- Experimental tabs: ${runtime.experimentalTabsEnabled ? "enabled" : "disabled"}`);
  lines.push(`- Website: ${runtime.websiteUrl || "Not found in repo"}`);
  lines.push(`- Privacy URL: ${runtime.privacyPolicyUrl || "Not found in repo"}`);
  lines.push(`- Support URL: ${runtime.supportUrl || "Not found in repo"}`);
  lines.push("");
  lines.push("## Camera");
  lines.push(
    cameraPermission
      ? `- Status: ${cameraPermission.status} (${cameraPermission.granted ? "granted" : "not granted"})`
      : "- Status: Not checked yet",
  );
  lines.push("");
  lines.push("## Session bootstrap");
  lines.push(`- Status: ${session.status}`);
  lines.push(`- Device suffix: ${session.deviceIdSuffix || "Not found in repo"}`);
  lines.push(`- Bootstrap request ID: ${session.requestId || "Not found in repo"}`);
  lines.push(`- Expires at: ${session.expiresAt || "Not found in repo"}`);
  lines.push(`- Error recorded: ${session.error ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Voice control");
  lines.push(`- Native voice module available: ${input.voice.available ? "yes" : "no"}`);
  lines.push(`- Execution path: ${input.voice.executionPath}`);
  lines.push(`- Microphone permission: ${input.voice.microphonePermission || "Not found in repo"}`);
  lines.push(`- Speech recognition permission: ${input.voice.speechPermission || "Not found in repo"}`);
  lines.push(`- Listening active: ${input.voice.listening ? "yes" : "no"}`);
  lines.push(`- Speaking active: ${input.voice.speaking ? "yes" : "no"}`);
  lines.push(`- Speech/listening overlap active: ${input.voice.speechListeningOverlapActive ? "yes" : "no"}`);
  lines.push(`- Speech/listening overlap count: ${input.voice.speechListeningOverlapCount}`);
  lines.push(`- Unexpected speech/listening overlap count: ${input.voice.unexpectedSpeechListeningOverlapCount}`);
  lines.push(`- Last speech/listening overlap reason: ${input.voice.lastSpeechListeningOverlapReason || "None"}`);
  lines.push(
    `- Last speech/listening overlap timestamp: ${
      typeof input.voice.lastSpeechListeningOverlapAt === "number"
        ? new Date(input.voice.lastSpeechListeningOverlapAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(
    `- Speech/listening invariant: ${
      input.voice.unexpectedSpeechListeningOverlapCount === 0
      && (!input.voice.speechListeningOverlapActive || input.voice.lastSpeechListeningOverlapReason === "stop-barge-in")
        ? "PASS"
        : "FAIL"
    }`,
  );
  lines.push(`- Last recognized command: ${input.voice.lastRecognizedCommand || "None"}`);
  lines.push(`- Last recognition phase: ${input.voice.lastRecognizedCommandPhase || "None"}`);
  lines.push(
    `- Last recognition timestamp: ${
      typeof input.voice.lastRecognizedAt === "number"
        ? new Date(input.voice.lastRecognizedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(
    `- Last voice state timestamp: ${
      typeof input.voice.lastVoiceStateChangedAt === "number"
        ? new Date(input.voice.lastVoiceStateChangedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(`- Voice-module error recorded: ${input.voice.lastError ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Guidance loop");
  lines.push(`- Native module available: ${input.navigationLoop.available ? "yes" : "no"}`);
  lines.push(`- Execution path: ${input.navigationLoop.executionPath}`);
  lines.push(`- Session active: ${input.navigationLoop.sessionActive ? "yes" : "no"}`);
  lines.push(`- VoiceOver running: ${input.navigationLoop.voiceOverRunning ? "yes" : "no"}`);
  lines.push(
    `- Last capture latency: ${
      typeof input.navigationLoop.lastCaptureLatencyMs === "number"
        ? `${Math.round(input.navigationLoop.lastCaptureLatencyMs)}ms`
        : "Not found in repo"
    }`,
  );
  lines.push(
    `- Last total guidance loop latency: ${
      typeof input.navigationLoop.lastTotalGuidanceLoopLatencyMs === "number"
        ? `${Math.round(input.navigationLoop.lastTotalGuidanceLoopLatencyMs)}ms`
        : "Not found in repo"
    }`,
  );
  lines.push(`- Native/core error recorded: ${input.navigationLoop.lastError ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Audio cues");
  lines.push(`- Last type: ${input.audioCue.lastType || "None"}`);
  lines.push(`- Last outcome: ${input.audioCue.lastOutcome}`);
  lines.push(`- Last execution path: ${input.audioCue.lastExecutionPath || "Not found in repo"}`);
  lines.push(
    `- Last attempted at: ${
      typeof input.audioCue.lastAttemptedAt === "number"
        ? new Date(input.audioCue.lastAttemptedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(
    `- Last completed at: ${
      typeof input.audioCue.lastCompletedAt === "number"
        ? new Date(input.audioCue.lastCompletedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(`- Success count: ${input.audioCue.successCount}`);
  lines.push(`- Failure count: ${input.audioCue.failureCount}`);
  lines.push(`- Error recorded: ${input.audioCue.lastError ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Haptics");
  lines.push(`- Last type: ${input.haptics.lastType || "None"}`);
  lines.push(`- Last outcome: ${input.haptics.lastOutcome}`);
  lines.push(`- Last execution path: ${input.haptics.lastExecutionPath || "Not found in repo"}`);
  lines.push(
    `- Last attempted at: ${
      typeof input.haptics.lastAttemptedAt === "number"
        ? new Date(input.haptics.lastAttemptedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(
    `- Last completed at: ${
      typeof input.haptics.lastCompletedAt === "number"
        ? new Date(input.haptics.lastCompletedAt).toISOString()
        : "Not found in repo"
    }`,
  );
  lines.push(`- Success count: ${input.haptics.successCount}`);
  lines.push(`- Failure count: ${input.haptics.failureCount}`);
  lines.push(`- Error recorded: ${input.haptics.lastError ? "yes" : "no"}`);
  lines.push("");
  lines.push("## Backend health");
  if (lastHealthCheck) {
    lines.push(`- OK: ${lastHealthCheck.ok ? "yes" : "no"}`);
    lines.push(`- Request ID: ${lastHealthCheck.requestId || "Not found in repo"}`);
    lines.push(`- Prompt version: ${lastHealthCheck.promptVersion || "Not found in repo"}`);
    lines.push(`- Default provider: ${lastHealthCheck.defaultProvider || "Not found in repo"}`);
    lines.push(`- Default model: ${lastHealthCheck.defaultModel || "Not found in repo"}`);
    lines.push(`- Benchmark providers: ${lastHealthCheck.benchmarkProviders?.join(", ") || "Not found in repo"}`);
    lines.push(`- Latency: ${typeof lastHealthCheck.latencyMs === "number" ? `${Math.round(lastHealthCheck.latencyMs)}ms` : "Not found in repo"}`);
    lines.push(`- Error recorded: ${lastHealthCheck.error ? "yes" : "no"}`);
  } else {
    lines.push("- Not checked yet");
  }
  lines.push("");
  lines.push("## Last analyze");
  if (lastAnalyze) {
    lines.push(`- Outcome: ${lastAnalyze.outcome}`);
    lines.push(`- Execution path: ${getAnalyzeExecutionPath(lastAnalyze)}`);
    lines.push(`- Latency: ${typeof lastAnalyze.latencyMs === "number" ? `${Math.round(lastAnalyze.latencyMs)}ms` : "Not found in repo"}`);
    lines.push(`- Provider: ${lastAnalyze.provider || "Not found in repo"}`);
    lines.push(`- Model: ${lastAnalyze.model || "Not found in repo"}`);
    lines.push(`- Request ID: ${lastAnalyze.requestId || "Not found in repo"}`);
    lines.push(`- Prompt version: ${lastAnalyze.promptVersion || "Not found in repo"}`);
    lines.push(`- App version: ${lastAnalyze.appVersion || "Not found in repo"}`);
    lines.push(`- Frame timestamp: ${
      typeof lastAnalyze.frameTimestampMs === "number"
        ? new Date(lastAnalyze.frameTimestampMs).toISOString()
        : "Not found in repo"
    }`);
    lines.push(`- Sampled frame: ${typeof lastAnalyze.sampledFrame === "boolean" ? String(lastAnalyze.sampledFrame) : "Not found in repo"}`);
    lines.push(`- Has image: ${typeof lastAnalyze.hasImage === "boolean" ? String(lastAnalyze.hasImage) : "Not found in repo"}`);
    lines.push(`- Native path: ${lastAnalyze.nativePath || "Not found in repo"}`);
    lines.push(`- Platform: ${lastAnalyze.platform || "Not found in repo"}`);
    lines.push(`- Detail: ${lastAnalyze.detail || "Not found in repo"}`);
    lines.push(`- Capture latency: ${
      typeof lastAnalyze.captureHeuristics?.captureLatencyMs === "number"
        ? `${Math.round(lastAnalyze.captureHeuristics.captureLatencyMs)}ms`
        : "Not found in repo"
    }`);
    lines.push(`- Frame age: ${
      typeof lastAnalyze.captureHeuristics?.frameAgeMs === "number"
        ? `${Math.round(lastAnalyze.captureHeuristics.frameAgeMs)}ms`
        : "Not found in repo"
    }`);
    lines.push(`- Image source: ${lastAnalyze.captureHeuristics?.imageSource || "Not found in repo"}`);
    lines.push(`- Resized for upload: ${
      typeof lastAnalyze.captureHeuristics?.resizedForUpload === "boolean"
        ? String(lastAnalyze.captureHeuristics.resizedForUpload)
        : "Not found in repo"
    }`);
    lines.push(`- Uploaded size: ${
      typeof lastAnalyze.captureHeuristics?.uploadedWidth === "number" && typeof lastAnalyze.captureHeuristics?.uploadedHeight === "number"
        ? `${lastAnalyze.captureHeuristics.uploadedWidth}x${lastAnalyze.captureHeuristics.uploadedHeight}`
        : "Not found in repo"
    }`);
    lines.push(`- Source size: ${
      typeof lastAnalyze.sourceWidth === "number" && typeof lastAnalyze.sourceHeight === "number"
        ? `${lastAnalyze.sourceWidth}x${lastAnalyze.sourceHeight}`
        : "Not found in repo"
    }`);
    lines.push(`- Direction: ${lastAnalyze.direction || "Not found in repo"}`);
    lines.push(`- Obstacle: ${typeof lastAnalyze.obstacle === "boolean" ? String(lastAnalyze.obstacle) : "Not found in repo"}`);
    lines.push(`- Hazard level: ${lastAnalyze.hazardLevel || "Not found in repo"}`);
    lines.push(`- Lighting: ${lastAnalyze.lighting || "Not found in repo"}`);
    lines.push(`- Surface type: ${lastAnalyze.surfaceType || "Not found in repo"}`);
    lines.push(`- Walkability: ${lastAnalyze.walkability || "Not found in repo"}`);
    lines.push(`- Confidence: ${typeof lastAnalyze.confidence === "number" ? `${Math.round(lastAnalyze.confidence * 100)}%` : "Not found in repo"}`);
    lines.push("- Scene and free-form error text: omitted from export");
  } else {
    lines.push("- Not found in repo");
  }
  lines.push("");
  lines.push("## Recent analyze events");
  if (recentAnalyzeEvents.length === 0) {
    lines.push("- None");
  } else {
    recentAnalyzeEvents.forEach((event) => {
      lines.push(`- ${new Date(event.timestamp).toISOString()} • ${formatDiagnosticsEventSummary(event)}`);
    });
  }

  return lines.join("\n");
}

export function isPublicUrlConfigured(value?: string) {
  return Boolean(value && isConfiguredUrl(value));
}
