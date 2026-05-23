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

export interface DiagnosticsVoiceSnapshot {
  available: boolean;
  executionPath: DiagnosticsVoiceExecutionPath;
  lastError?: string;
  lastRecognizedCommand?: string;
  listening: boolean;
  microphonePermission?: string;
  speechPermission?: string;
  updatedAt: number;
}

export interface DiagnosticsAnalyzeEvent {
  confidence?: number;
  detail?: "low" | "high";
  direction?: DiagnosticsAnalyzeDirection;
  error?: string;
  fallbackReason?: string;
  frameId?: string;
  hazardLevel?: DiagnosticsHazardLevel;
  id: string;
  latencyMs?: number;
  lighting?: DiagnosticsLighting;
  message?: string;
  model?: string;
  nativePath?: DiagnosticsNavigationExecutionPath;
  obstacle?: boolean;
  priorGuidanceSummary?: string;
  requestId?: string;
  outcome: DiagnosticsAnalyzeOutcome;
  promptVersion?: string;
  provider?: string;
  safeReason?: string;
  sceneDescription?: string;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  surfaceType?: string;
  timestamp: number;
}

export interface DiagnosticsSnapshot {
  cameraPermission: DiagnosticsCameraPermissionSnapshot | null;
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
  cameraPermission: null,
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
  status: DiagnosticsSessionStatus;
}) {
  updateSnapshot((current) => ({
    ...current,
    session: {
      deviceIdSuffix: input.deviceId ? normalizeDeviceIdSuffix(input.deviceId) : current.session.deviceIdSuffix,
      error: sanitizeMessage(input.error, 120),
      expiresAt: input.expiresAt ?? current.session.expiresAt,
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

export function recordVoiceSnapshot(input: {
  available?: boolean;
  executionPath?: DiagnosticsVoiceExecutionPath;
  lastError?: string | null;
  lastRecognizedCommand?: string | null;
  listening?: boolean;
  microphonePermission?: string;
  speechPermission?: string;
}) {
  updateSnapshot((current) => ({
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
      listening: input.listening ?? current.voice.listening,
      microphonePermission: input.microphonePermission ?? current.voice.microphonePermission,
      speechPermission: input.speechPermission ?? current.voice.speechPermission,
      updatedAt: Date.now(),
    },
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
    confidence: input.confidence,
    direction: input.direction,
    error: sanitizeMessage(input.error, 120),
    fallbackReason: sanitizeMessage(input.fallbackReason, 120),
    frameId: sanitizeMessage(input.frameId, 80),
    id: input.id || createEventId(),
    latencyMs: input.latencyMs,
    lighting: input.lighting,
    message: sanitizeMessage(input.message, 160),
    nativePath: input.nativePath,
    priorGuidanceSummary: sanitizeMessage(input.priorGuidanceSummary, 120),
    promptVersion: sanitizeMessage(input.promptVersion, 40),
    provider: sanitizeMessage(input.provider, 64),
    requestId: sanitizeMessage(input.requestId, 80),
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
  lines.push(`- Expires at: ${session.expiresAt || "Not found in repo"}`);
  lines.push(`- Error: ${session.error || "None"}`);
  lines.push("");
  lines.push("## Voice control");
  lines.push(`- Native voice module available: ${input.voice.available ? "yes" : "no"}`);
  lines.push(`- Execution path: ${input.voice.executionPath}`);
  lines.push(`- Microphone permission: ${input.voice.microphonePermission || "Not found in repo"}`);
  lines.push(`- Speech recognition permission: ${input.voice.speechPermission || "Not found in repo"}`);
  lines.push(`- Listening active: ${input.voice.listening ? "yes" : "no"}`);
  lines.push(`- Last recognized command: ${input.voice.lastRecognizedCommand || "None"}`);
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
    lines.push(`- Session ID: ${lastAnalyze.sessionId || "Not found in repo"}`);
    lines.push(`- Frame ID: ${lastAnalyze.frameId || "Not found in repo"}`);
    lines.push(`- Native path: ${lastAnalyze.nativePath || "Not found in repo"}`);
    lines.push(`- Detail: ${lastAnalyze.detail || "Not found in repo"}`);
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
