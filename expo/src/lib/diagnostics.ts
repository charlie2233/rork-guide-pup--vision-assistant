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
export type DiagnosticsSessionStatus = "unknown" | "bootstrapping" | "ready" | "cleared" | "failed";
export type DiagnosticsNavigationExecutionPath = "native-core" | "js-fallback";
export type DiagnosticsVoiceExecutionPath = "native-voice" | "js-fallback";
export type DiagnosticsVoiceRecognitionPhase = "partial" | "final";
export type DiagnosticsSpeechListeningOverlapReason = "stop-barge-in" | "unexpected";
export type DiagnosticsHapticOutcome = "none" | "success" | "failure";
export type DiagnosticsAudioCueOutcome = "none" | "success" | "failure";

export interface DiagnosticsRuntimeSnapshot {
  apiBaseUrl?: string;
  appEnv: string;
  appName: string;
  appVersion?: string;
  buildVersion?: string;
  bundleIdentifier?: string;
  emergencyDisclaimer: string;
  experimentalTabsEnabled: boolean;
  privacyPolicyUrl?: string;
  releaseTrack: string;
  sentryEnabled: boolean;
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

export interface DiagnosticsSessionSnapshot {
  deviceIdSuffix?: string;
  error?: string;
  expiresAt?: string;
  requestId?: string;
  status: DiagnosticsSessionStatus;
  updatedAt: number;
}

export interface DiagnosticsHealthSnapshot {
  benchmarkProviders?: string[];
  checkedAt: number;
  defaultModel?: string;
  defaultProvider?: string;
  environment?: string;
  error?: string;
  ok: boolean;
  promptVersion?: string;
  requestId?: string;
  latencyMs?: number;
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
  speaking: boolean;
  speechListeningOverlapActive: boolean;
  speechListeningOverlapCount: number;
  speechPermission?: string;
  unexpectedSpeechListeningOverlapCount: number;
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
  timestamp: number;
}

export interface DiagnosticsSnapshot {
  audioCue: DiagnosticsAudioCueSnapshot;
  cameraPermission: DiagnosticsCameraPermissionSnapshot | null;
  haptics: DiagnosticsHapticSnapshot;
  lastAnalyze: DiagnosticsAnalyzeEvent | null;
  lastHealthCheck: DiagnosticsHealthSnapshot | null;
  navigationLoop: DiagnosticsNavigationLoopSnapshot;
  recentAnalyzeEvents: DiagnosticsAnalyzeEvent[];
  runtime: DiagnosticsRuntimeSnapshot;
  session: DiagnosticsSessionSnapshot;
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
  emergencyDisclaimer: appConfig.emergencyDisclaimer,
  experimentalTabsEnabled: appConfig.enableExperimentalTabs,
  privacyPolicyUrl: appConfig.privacyPolicyUrl,
  releaseTrack: appConfig.releaseTrack,
  sentryEnabled: Boolean(appConfig.sentryDsn),
  slug: undefined,
  supportEmail: appConfig.supportEmail,
  supportUrl: appConfig.supportUrl,
  websiteUrl: appConfig.websiteUrl,
});

const createInitialSnapshot = (): DiagnosticsSnapshot => ({
  audioCue: {
    failureCount: 0,
    lastOutcome: "none",
    successCount: 0,
    updatedAt: Date.now(),
  },
  cameraPermission: null,
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
    voiceOverRunning: false,
  },
  recentAnalyzeEvents: [],
  runtime: createInitialRuntime(),
  session: {
    status: "unknown",
    updatedAt: Date.now(),
  },
  voice: {
    available: false,
    executionPath: "js-fallback",
    listening: false,
    speaking: false,
    speechListeningOverlapActive: false,
    speechListeningOverlapCount: 0,
    unexpectedSpeechListeningOverlapCount: 0,
    updatedAt: Date.now(),
  },
});

let snapshot = createInitialSnapshot();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function updateSnapshot(mutator: (current: DiagnosticsSnapshot) => DiagnosticsSnapshot) {
  snapshot = mutator(snapshot);
  emit();
}

function createEventId() {
  return `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeUrlForDisplay(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return value.trim();
    }
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${pathname}`;
  } catch {
    return value.trim();
  }
}

export function sanitizeMessage(value?: string, maxLength = 160) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
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
      error: sanitizeMessage(input.error, 120),
      expiresAt: input.expiresAt ?? current.session.expiresAt,
      requestId: sanitizeMessage(input.requestId, 80) ?? current.session.requestId,
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
  benchmarkProviders?: string[];
  defaultModel?: string;
  defaultProvider?: string;
  environment?: string;
  error?: string;
  ok: boolean;
  promptVersion?: string;
  requestId?: string;
  latencyMs?: number;
}) {
  updateSnapshot((current) => ({
    ...current,
    lastHealthCheck: {
      benchmarkProviders: input.benchmarkProviders,
      checkedAt: Date.now(),
      defaultModel: input.defaultModel,
      defaultProvider: input.defaultProvider,
      environment: input.environment,
      error: sanitizeMessage(input.error, 120),
      latencyMs: input.latencyMs,
      ok: input.ok,
      promptVersion: input.promptVersion,
      requestId: input.requestId,
    },
  }));
}

export function recordNavigationLoopSnapshot(input: {
  available?: boolean;
  executionPath?: DiagnosticsNavigationExecutionPath;
  lastCaptureLatencyMs?: number;
  lastError?: string | null;
  lastTotalGuidanceLoopLatencyMs?: number;
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
        input.lastError === undefined ? current.navigationLoop.lastError : sanitizeMessage(input.lastError ?? undefined, 120),
      lastTotalGuidanceLoopLatencyMs:
        input.lastTotalGuidanceLoopLatencyMs ?? current.navigationLoop.lastTotalGuidanceLoopLatencyMs,
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
        lastError: sanitizeMessage(input.error, 120),
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
        lastError: sanitizeMessage(input.error, 120),
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
  speaking?: boolean;
  speechPermission?: string;
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
      lastError: input.lastError === undefined ? current.voice.lastError : sanitizeMessage(input.lastError ?? undefined, 120),
      lastRecognizedCommand:
        input.lastRecognizedCommand === undefined
          ? current.voice.lastRecognizedCommand
          : sanitizeMessage(input.lastRecognizedCommand ?? undefined, 80),
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
      microphonePermission: input.microphonePermission ?? current.voice.microphonePermission,
      speaking: nextSpeaking,
      speechListeningOverlapActive: nextOverlapActive,
      speechListeningOverlapCount:
        current.voice.speechListeningOverlapCount + (isNewOverlap ? 1 : 0),
      speechPermission: input.speechPermission ?? current.voice.speechPermission,
      unexpectedSpeechListeningOverlapCount:
        current.voice.unexpectedSpeechListeningOverlapCount
        + (isNewOverlap && nextOverlapReason === "unexpected" ? 1 : 0),
      updatedAt: now,
    },
    };
  });
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
    error: sanitizeMessage(input.error, 120),
    fallbackReason: sanitizeMessage(input.fallbackReason, 120),
    frameId: sanitizeMessage(input.frameId, 80),
    frameSummary: sanitizeMessage(input.frameSummary, 280),
    frameTimestampMs: input.frameTimestampMs,
    id: input.id || createEventId(),
    hasImage: input.hasImage,
    latencyMs: input.latencyMs,
    lighting: input.lighting,
    message: sanitizeMessage(input.message, 160),
    nativePath: input.nativePath,
    platform: sanitizeMessage(input.platform, 16),
    priorGuidanceSummary: sanitizeMessage(input.priorGuidanceSummary, 120),
    promptVersion: sanitizeMessage(input.promptVersion, 40),
    provider: sanitizeMessage(input.provider, 64),
    requestId: sanitizeMessage(input.requestId, 80),
    sampledFrame: input.sampledFrame,
    safeReason: sanitizeMessage(input.safeReason, 120),
    sceneDescription: sanitizeMessage(input.sceneDescription, 160),
    sessionId: sanitizeMessage(input.sessionId, 80),
    surfaceType: sanitizeMessage(input.surfaceType, 80),
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
    && event.surfaceType,
  );
}

function findAnalyzeEventForPath(input: DiagnosticsSnapshot, nativePath: DiagnosticsNavigationExecutionPath) {
  return input.recentAnalyzeEvents.find((event) => event.nativePath === nativePath && event.outcome === "success")
    || (input.lastAnalyze?.nativePath === nativePath ? input.lastAnalyze : undefined);
}

function buildCameraPathEvidence(nativePath: DiagnosticsNavigationExecutionPath, event?: DiagnosticsAnalyzeEvent) {
  return {
    captureHeuristics: event?.captureHeuristics || {},
    frameSummary: event?.frameSummary || "",
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
    id,
    noScreenRequired: false,
    notes: "",
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
      stopCutThrough: input.voice.lastSpeechListeningOverlapReason === "stop-barge-in",
    },
  ];
}

export function buildNoScreenSmokeEvidenceDraft(
  input = getDiagnosticsSnapshot(),
  options: { settings?: DiagnosticsEvidenceSettingsSnapshot; operator?: string } = {},
) {
  const generatedAt = new Date().toISOString();
  const releaseTrack = inferEvidenceReleaseTrack(input.runtime.releaseTrack);
  const environment = inferEvidenceEnvironment(input);
  const providerBacked = input.lastAnalyze?.outcome === "success";
  const nativeCoreEvent = findAnalyzeEventForPath(input, "native-core");
  const jsFallbackEvent = findAnalyzeEventForPath(input, "js-fallback");
  const currentSettings = {
    descriptionMode: options.settings?.descriptionMode || "short",
    hapticsEnabled: options.settings?.hapticsEnabled ?? true,
    speechRate: options.settings?.speechRate || "normal",
  };

  return {
    artifactVersion: 1,
    assistiveTech: {
      audioCuesAudible: false,
      hapticsFelt: false,
      speechInputConfirmed: input.voice.microphonePermission === "granted"
        && input.voice.speechPermission === "granted",
      spokenOutputConfirmed: input.voice.available,
      voiceOverRunning: input.navigationLoop.voiceOverRunning === true,
    },
    backendSmoke: {
      analyzeStatusCode: providerBacked ? 200 : 0,
      apiBaseUrl: input.runtime.apiBaseUrl || "",
      bootstrapStatusCode: input.session.status === "ready" ? 200 : 0,
      environment,
      executionPath: getAnalyzeExecutionPath(input.lastAnalyze),
      healthStatusCode: input.lastHealthCheck?.ok ? 200 : 0,
      model: input.lastAnalyze?.model || input.lastHealthCheck?.defaultModel || "",
      promptVersion: input.lastAnalyze?.promptVersion || input.lastHealthCheck?.promptVersion || "",
      providerBacked,
      requestIds: {
        analyze: input.lastAnalyze?.requestId || "",
        bootstrap: input.session.requestId || "",
        health: input.lastHealthCheck?.requestId || "",
      },
      structuredOutputValid: analyzeEventHasStructuredFields(input.lastAnalyze),
    },
    cameraPaths: {
      jsFallback: buildCameraPathEvidence("js-fallback", jsFallbackEvent),
      nativeCore: buildCameraPathEvidence("native-core", nativeCoreEvent),
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
      developerModeEnabled: false,
      paired: false,
      result: "draft",
      trusted: false,
      usbOrSameLan: false,
      xcodeDestinationAvailable: false,
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
      stopBargeInConfirmed: input.voice.lastSpeechListeningOverlapReason === "stop-barge-in",
      unexpectedSpeechListeningOverlapCount: input.voice.unexpectedSpeechListeningOverlapCount,
      voiceOverRunning: input.navigationLoop.voiceOverRunning === true,
    },
    generatedAt,
    noScreen: {
      cleanInstallOrReset: false,
      noScreenUsed: false,
      screenReadingUsed: false,
      visualAssistanceUsed: false,
      voiceOnlyNavigation: false,
    },
    operator: options.operator || "Internal tester",
    privacy: {
      containsFullDeviceIds: false,
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
      generatedAt,
      releaseTrack,
      runId: `no-screen-smoke-${generatedAt.replace(/[:.]/g, "-")}`,
      schemaVersion: 1,
    },
    screenUse: "draft",
    sequence: buildNoScreenSequenceDraft(input),
    settingsPersistence: {
      afterRelaunch: currentSettings,
      afterRestore: currentSettings,
      afterVoiceChange: currentSettings,
      before: currentSettings,
      nonDefaultSettingSurvivedRelaunch: false,
      restoredDefaultsAfterValidation: false,
    },
    stopBargeIn: {
      attemptedDuringSpeech: input.voice.lastSpeechListeningOverlapReason === "stop-barge-in",
      cutThrough: input.voice.lastSpeechListeningOverlapReason === "stop-barge-in",
      guidancePaused: !input.navigationLoop.sessionActive,
      lastSpeechListeningOverlapReason: input.voice.lastSpeechListeningOverlapReason || "",
      speechListeningInvariant:
        input.voice.unexpectedSpeechListeningOverlapCount === 0
        && (!input.voice.speechListeningOverlapActive || input.voice.lastSpeechListeningOverlapReason === "stop-barge-in")
          ? "PASS"
          : "FAIL",
      staleSpeechAfterStop: input.voice.speaking,
      unexpectedSpeechListeningOverlapCount: input.voice.unexpectedSpeechListeningOverlapCount,
    },
    validationMode: "real-iphone-no-screen",
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
  options: { settings?: DiagnosticsEvidenceSettingsSnapshot; operator?: string } = {},
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
  lines.push(`- Version: ${runtime.appVersion || "Not found in repo"}`);
  lines.push(`- Build: ${runtime.buildVersion || "Not found in repo"}`);
  lines.push(`- Bundle ID: ${runtime.bundleIdentifier || "Not found in repo"}`);
  lines.push(`- API base URL: ${runtime.apiBaseUrl || "Not configured"}`);
  lines.push(`- Sentry: ${runtime.sentryEnabled ? "enabled" : "disabled"}`);
  lines.push(`- Experimental tabs: ${runtime.experimentalTabsEnabled ? "enabled" : "disabled"}`);
  lines.push(`- Website: ${runtime.websiteUrl || "Not found in repo"}`);
  lines.push(`- Privacy URL: ${runtime.privacyPolicyUrl || "Not found in repo"}`);
  lines.push(`- Support URL: ${runtime.supportUrl || "Not found in repo"}`);
  lines.push(`- Support email: ${runtime.supportEmail || "Not found in repo"}`);
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
  lines.push(`- Error: ${session.error || "None"}`);
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
  lines.push(`- Last voice-module error: ${input.voice.lastError || "None"}`);
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
  lines.push(`- Last native/core error: ${input.navigationLoop.lastError || "None"}`);
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
  lines.push(`- Last error: ${input.audioCue.lastError || "None"}`);
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
  lines.push(`- Last error: ${input.haptics.lastError || "None"}`);
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
    lines.push(`- Error: ${lastHealthCheck.error || "None"}`);
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
    lines.push(`- Session ID: ${lastAnalyze.sessionId || "Not found in repo"}`);
    lines.push(`- Frame ID: ${lastAnalyze.frameId || "Not found in repo"}`);
    lines.push(`- Frame summary: ${lastAnalyze.frameSummary || "Not found in repo"}`);
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
    lines.push(`- Prior guidance summary: ${lastAnalyze.priorGuidanceSummary || "None"}`);
    lines.push(`- Direction: ${lastAnalyze.direction || "Not found in repo"}`);
    lines.push(`- Obstacle: ${typeof lastAnalyze.obstacle === "boolean" ? String(lastAnalyze.obstacle) : "Not found in repo"}`);
    lines.push(`- Hazard level: ${lastAnalyze.hazardLevel || "Not found in repo"}`);
    lines.push(`- Lighting: ${lastAnalyze.lighting || "Not found in repo"}`);
    lines.push(`- Surface type: ${lastAnalyze.surfaceType || "Not found in repo"}`);
    lines.push(`- Scene description: ${lastAnalyze.sceneDescription || "Not found in repo"}`);
    lines.push(`- Confidence: ${typeof lastAnalyze.confidence === "number" ? `${Math.round(lastAnalyze.confidence * 100)}%` : "Not found in repo"}`);
    lines.push(`- Fallback reason: ${lastAnalyze.fallbackReason || "None"}`);
    lines.push(`- Message: ${lastAnalyze.message || "Not found in repo"}`);
    lines.push(`- Error: ${lastAnalyze.error || "None"}`);
    lines.push(`- Safe reason: ${lastAnalyze.safeReason || "None"}`);
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
