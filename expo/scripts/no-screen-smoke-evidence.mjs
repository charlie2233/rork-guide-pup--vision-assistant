import fs from "node:fs";
import path from "node:path";
import {
  findDisallowedKeys,
  findSensitivePatterns,
} from "./evidence-privacy.mjs";
import {
  isGitRevision,
  isSanitizedRequestId,
  isWorkerIdentifier,
  SMOKE_ARTIFACT_VERSION,
  SMOKE_CLOCK_SKEW_MS,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";

export const NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH = "release/no-screen-smoke.latest.json";
export const NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS = SMOKE_EVIDENCE_MAX_AGE_SECONDS;
export const NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS = SMOKE_CLOCK_SKEW_MS;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const REQUIRED_NO_SCREEN_SEQUENCE = [
  "cold-prompt",
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
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanTrue(value) {
  return value === true;
}

function isBooleanFalse(value) {
  return value === false;
}

function isIsoDate(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isUuidLike(value) {
  return isNonEmptyString(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isIdentifierSuffix(value) {
  return value === undefined || (isNonEmptyString(value) && /^[A-Za-z0-9-]{1,8}$/.test(value));
}

function modelMatchesExpected(value, expected) {
  if (!expected) {
    return isNonEmptyString(value);
  }

  return isNonEmptyString(value) && (value === expected || value.startsWith(`${expected}-`));
}

function getPathValue(source, fieldPath) {
  return fieldPath.split(".").reduce((value, segment) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    return value[segment];
  }, source);
}

function settingsSnapshotsEqual(left, right) {
  return (
    left?.speechRate === right?.speechRate &&
    left?.descriptionMode === right?.descriptionMode &&
    left?.hapticsEnabled === right?.hapticsEnabled
  );
}

function requireMatchingFields(source, fieldPaths, invalid) {
  const values = fieldPaths.map((fieldPath) => [fieldPath, getPathValue(source, fieldPath)]);
  if (values.some(([, value]) => value === undefined || value === null || value === "")) {
    return;
  }

  const firstValue = values[0][1];
  for (const [fieldPath, value] of values.slice(1)) {
    if (value !== firstValue) {
      invalid.push(`${fieldPath}.matches.${values[0][0]}`);
    }
  }
}

function isCompleteSettingsSnapshot(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    ["slow", "normal", "fast"].includes(value.speechRate) &&
    ["short", "detailed"].includes(value.descriptionMode) &&
    typeof value.hapticsEnabled === "boolean"
  );
}

export function readNoScreenSmokeEvidenceArtifact(projectDir, relativePath = NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH) {
  const artifactPath = path.resolve(projectDir, relativePath);
  if (!fs.existsSync(artifactPath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

export function validateNoScreenSmokeEvidenceArtifact(artifact, options = {}) {
  const missing = [];
  const invalid = [];
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();

  const requireField = (fieldPath, validator, label = fieldPath) => {
    const value = getPathValue(artifact, fieldPath);
    if (value === undefined || value === null || value === "") {
      missing.push(label);
      return;
    }
    if (!validator(value)) {
      invalid.push(label);
    }
  };

  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return {
      invalid: ["artifact"],
      missing,
      valid: false,
    };
  }

  requireField("artifactVersion", (value) => value === 1);
  requireField("generatedAt", isIsoDate);
  requireField("operator", isNonEmptyString);
  requireField("validationMode", (value) => value === "real-iphone-no-screen");
  requireField("screenUse", (value) => value === "none");

  requireField("provenance.schemaVersion", (value) => value === 1);
  requireField("provenance.artifactType", (value) => value === "real-iphone-no-screen-smoke");
  requireField("provenance.generatedAt", isIsoDate);
  requireField("provenance.runId", isNonEmptyString);
  requireField("provenance.sourceRevision", isGitRevision);
  requireField("provenance.candidateBinarySha256", (value) => SHA256_PATTERN.test(value));
  requireField("provenance.releaseTrack", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.buildProfile", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.appVersion", isNonEmptyString);
  requireField("provenance.buildNumber", isNonEmptyString);
  requireField("provenance.bundleIdentifier", isNonEmptyString);
  requireField("provenance.apiEnvironment", (value) => ["staging", "production"].includes(value));
  requireField("provenance.apiBaseUrlLabel", (value) => ["staging", "production"].includes(value));

  const generatedAtMs = Date.parse(artifact.generatedAt);
  if (Number.isFinite(generatedAtMs)) {
    if (generatedAtMs > nowMs + NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS) {
      invalid.push("generatedAt.in-future");
    }
    if (generatedAtMs < nowMs - NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS * 1000) {
      invalid.push("generatedAt.stale");
    }
  }

  requireField("noScreen.noScreenUsed", isBooleanTrue);
  requireField("noScreen.screenReadingUsed", isBooleanFalse);
  requireField("noScreen.visualAssistanceUsed", isBooleanFalse);
  requireField("noScreen.voiceOnlyNavigation", isBooleanTrue);
  requireField("noScreen.cleanInstallOrReset", isBooleanTrue);

  requireField("privacy.containsRawMedia", isBooleanFalse);
  requireField("privacy.containsRawAudio", isBooleanFalse);
  requireField("privacy.containsSecrets", isBooleanFalse);
  requireField("privacy.containsSignedUrls", isBooleanFalse);
  requireField("privacy.containsFullDeviceIds", isBooleanFalse);

  requireField("device.model", isNonEmptyString);
  requireField("device.osVersion", isNonEmptyString);
  requireField("device.appVersion", isNonEmptyString);
  requireField("device.buildNumber", isNonEmptyString);
  requireField("device.bundleIdentifier", isNonEmptyString);
  requireField("device.buildProfile", (value) => ["preview", "testflight", "store"].includes(value));
  if (!isIdentifierSuffix(artifact.device?.identifierSuffix)) {
    invalid.push("device.identifierSuffix");
  }
  if (options.expectedBundleIdentifier && artifact.device?.bundleIdentifier !== options.expectedBundleIdentifier) {
    invalid.push(`device.bundleIdentifier:${artifact.device?.bundleIdentifier ?? "missing"}`);
  }
  if (options.expectedBundleIdentifier && artifact.provenance?.bundleIdentifier !== options.expectedBundleIdentifier) {
    invalid.push(`provenance.bundleIdentifier:${artifact.provenance?.bundleIdentifier ?? "missing"}`);
  }
  if (options.expectedAppVersion && artifact.device?.appVersion !== options.expectedAppVersion) {
    invalid.push(`device.appVersion:${artifact.device?.appVersion ?? "missing"}`);
  }
  if (options.expectedAppVersion && artifact.provenance?.appVersion !== options.expectedAppVersion) {
    invalid.push(`provenance.appVersion:${artifact.provenance?.appVersion ?? "missing"}`);
  }
  if (options.expectedBuildNumber && artifact.device?.buildNumber !== options.expectedBuildNumber) {
    invalid.push(`device.buildNumber:${artifact.device?.buildNumber ?? "missing"}`);
  }
  if (options.expectedBuildNumber && artifact.provenance?.buildNumber !== options.expectedBuildNumber) {
    invalid.push(`provenance.buildNumber:${artifact.provenance?.buildNumber ?? "missing"}`);
  }
  if (options.expectedReleaseTrack && artifact.provenance?.releaseTrack !== options.expectedReleaseTrack) {
    invalid.push(`provenance.releaseTrack:${artifact.provenance?.releaseTrack ?? "missing"}`);
  }
  if (options.expectedBuildProfile && artifact.device?.buildProfile !== options.expectedBuildProfile) {
    invalid.push(`device.buildProfile:${artifact.device?.buildProfile ?? "missing"}`);
  }
  if (options.expectedBuildProfile && artifact.provenance?.buildProfile !== options.expectedBuildProfile) {
    invalid.push(`provenance.buildProfile:${artifact.provenance?.buildProfile ?? "missing"}`);
  }
  if (options.expectedSourceRevision && artifact.provenance?.sourceRevision !== options.expectedSourceRevision) {
    invalid.push("provenance.sourceRevision-mismatch");
  }
  if (
    options.expectedCandidateBinarySha256 &&
    artifact.provenance?.candidateBinarySha256 !== options.expectedCandidateBinarySha256
  ) {
    invalid.push("provenance.candidateBinarySha256-mismatch");
  }
  if (options.expectedApiEnvironment && artifact.backendSmoke?.environment !== options.expectedApiEnvironment) {
    invalid.push(`backendSmoke.environment:${artifact.backendSmoke?.environment ?? "missing"}`);
  }
  if (options.expectedApiEnvironment && artifact.provenance?.apiEnvironment !== options.expectedApiEnvironment) {
    invalid.push(`provenance.apiEnvironment:${artifact.provenance?.apiEnvironment ?? "missing"}`);
  }
  if (options.requireCandidateBinding && !isGitRevision(options.expectedSourceRevision)) {
    invalid.push("provenance.expectedSourceRevision-unavailable");
  }
  if (
    options.requireCandidateBinding &&
    !SHA256_PATTERN.test(options.expectedCandidateBinarySha256 ?? "")
  ) {
    invalid.push("provenance.expectedCandidateBinarySha256-unavailable");
  }

  requireMatchingFields(artifact, ["generatedAt", "provenance.generatedAt"], invalid);
  requireMatchingFields(artifact, ["device.appVersion", "provenance.appVersion"], invalid);
  requireMatchingFields(artifact, ["device.buildNumber", "provenance.buildNumber"], invalid);
  requireMatchingFields(artifact, ["device.buildProfile", "provenance.buildProfile"], invalid);
  requireMatchingFields(artifact, ["provenance.releaseTrack", "provenance.buildProfile"], invalid);
  requireMatchingFields(artifact, ["device.bundleIdentifier", "provenance.bundleIdentifier"], invalid);
  requireMatchingFields(artifact, ["backendSmoke.environment", "provenance.apiEnvironment", "provenance.apiBaseUrlLabel"], invalid);
  requireMatchingFields(artifact, ["backendSmoke.provenance.sourceRevision", "provenance.sourceRevision"], invalid);

  requireField("deviceReadiness.result", (value) => value === "ready");
  requireField("deviceReadiness.paired", isBooleanTrue);
  requireField("deviceReadiness.trusted", isBooleanTrue);
  requireField("deviceReadiness.developerModeEnabled", isBooleanTrue);
  requireField("deviceReadiness.usbOrSameLan", isBooleanTrue);
  requireField("deviceReadiness.xcodeDestinationAvailable", isBooleanTrue);

  requireField("assistiveTech.voiceOverRunning", isBooleanTrue);
  requireField("assistiveTech.speechInputConfirmed", isBooleanTrue);
  requireField("assistiveTech.spokenOutputConfirmed", isBooleanTrue);
  requireField("assistiveTech.voiceProcessingEnabled", isBooleanTrue);
  requireField("assistiveTech.audioCuesAudible", isBooleanTrue);
  requireField("assistiveTech.hapticsFelt", isBooleanTrue);

  requireField("backendSmoke.environment", (value) => ["staging", "production"].includes(value));
  requireField("backendSmoke.apiBaseUrl", (value) => isNonEmptyString(value) && (!options.expectedApiBaseUrl || value === options.expectedApiBaseUrl));
  requireField("backendSmoke.healthStatusCode", (value) => value === 200);
  requireField("backendSmoke.bootstrapStatusCode", (value) => value === 200);
  requireField("backendSmoke.analyzeStatusCode", (value) => value === 200);
  requireField("backendSmoke.providerBacked", isBooleanTrue);
  requireField("backendSmoke.executionPath", (value) => value === "provider-backed");
  requireField("backendSmoke.structuredOutputValid", isBooleanTrue);
  requireField("backendSmoke.walkability", (value) => ["clear", "caution", "uncertain"].includes(value));
  requireField("backendSmoke.model", (value) => modelMatchesExpected(value, options.expectedVisionModel));
  requireField("backendSmoke.promptVersion", (value) => isNonEmptyString(value) && (!options.expectedPromptVersion || value === options.expectedPromptVersion));
  requireField("backendSmoke.artifactVersion", (value) => value === SMOKE_ARTIFACT_VERSION);
  requireField("backendSmoke.generatedAt", isIsoDate);
  requireField("backendSmoke.provenance.sourceRevision", isGitRevision);
  requireField("backendSmoke.provenance.workerDeploymentId", isWorkerIdentifier);
  requireField("backendSmoke.provenance.workerVersionId", isWorkerIdentifier);
  requireField("backendSmoke.provenance.workerVersionCreatedAt", isIsoDate);
  requireField("backendSmoke.requestIds.health", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.bootstrap", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.analyze", isUuidLike);
  requireField("backendSmoke.requestIds.guidanceAnalyze", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.sceneQueryAnalyze", isSanitizedRequestId);

  const backendGeneratedAtMs = Date.parse(artifact.backendSmoke?.generatedAt);
  if (
    Number.isFinite(generatedAtMs) &&
    Number.isFinite(backendGeneratedAtMs) &&
    backendGeneratedAtMs > generatedAtMs + NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS
  ) {
    invalid.push("backendSmoke.generatedAt.after-no-screen-evidence");
  }

  const expectedBackendSmoke = options.expectedBackendSmokeArtifact;
  if (options.requireCandidateBinding && (!expectedBackendSmoke || typeof expectedBackendSmoke !== "object")) {
    invalid.push("backendSmoke.expectedArtifact-unavailable");
  }
  if (expectedBackendSmoke && typeof expectedBackendSmoke === "object") {
    const expectedBindings = [
      ["backendSmoke.artifactVersion", expectedBackendSmoke.artifactVersion],
      ["backendSmoke.generatedAt", expectedBackendSmoke.generatedAt],
      ["backendSmoke.provenance.sourceRevision", expectedBackendSmoke.provenance?.sourceRevision],
      ["backendSmoke.provenance.workerDeploymentId", expectedBackendSmoke.provenance?.workerDeploymentId],
      ["backendSmoke.provenance.workerVersionId", expectedBackendSmoke.provenance?.workerVersionId],
      ["backendSmoke.provenance.workerVersionCreatedAt", expectedBackendSmoke.provenance?.workerVersionCreatedAt],
      ["backendSmoke.requestIds.health", expectedBackendSmoke.health?.requestId],
      ["backendSmoke.requestIds.bootstrap", expectedBackendSmoke.bootstrap?.requestId],
      ["backendSmoke.requestIds.guidanceAnalyze", expectedBackendSmoke.lanes?.guidance?.analyze?.requestId],
      ["backendSmoke.requestIds.sceneQueryAnalyze", expectedBackendSmoke.lanes?.["scene-query"]?.analyze?.requestId],
    ];
    for (const [fieldPath, expectedValue] of expectedBindings) {
      if (expectedValue === undefined || expectedValue === null || expectedValue === "") {
        invalid.push(`${fieldPath}.expected-unavailable`);
      } else if (getPathValue(artifact, fieldPath) !== expectedValue) {
        invalid.push(`${fieldPath}.candidate-mismatch`);
      }
    }
  }

  requireField("diagnostics.speechListeningInvariant", (value) => value === "PASS");
  requireField("diagnostics.unexpectedSpeechListeningOverlapCount", (value) => value === 0);
  requireField("diagnostics.stopBargeInConfirmed", isBooleanTrue);
  requireField("diagnostics.voiceOverRunning", isBooleanTrue);
  requireField("diagnostics.settingsPersistedAfterRestart", isBooleanTrue);
  requireField("diagnostics.nativeCameraCaptureConfirmed", isBooleanTrue);
  requireField("diagnostics.jsFallbackCaptureConfirmed", isBooleanTrue);
  requireField("diagnostics.noRawMediaOrSecrets", isBooleanTrue);
  requireField("diagnostics.haptics.successCount", (value) => Number.isInteger(value) && value > 0);
  requireField("diagnostics.audioCues.successCount", (value) => Number.isInteger(value) && value > 0);

  requireField("stopBargeIn.attemptedDuringSpeech", isBooleanTrue);
  requireField("stopBargeIn.analysisInactiveAfterStop", isBooleanTrue);
  requireField("stopBargeIn.armedDuringSpeech", isBooleanTrue);
  requireField("stopBargeIn.audioCueAttempted", isBooleanTrue);
  requireField("stopBargeIn.cameraInactiveAfterStop", isBooleanTrue);
  requireField("stopBargeIn.cutThrough", isBooleanTrue);
  requireField("stopBargeIn.hapticAttempted", isBooleanTrue);
  requireField("stopBargeIn.lastSpeechListeningOverlapReason", (value) => value === "stop-barge-in");
  requireField("stopBargeIn.listeningStoppedAfterStop", isBooleanTrue);
  requireField("stopBargeIn.postStopObservedAt", (value) => Number.isFinite(value) && value > 0);
  requireField("stopBargeIn.recognizedCommand", (value) => value === "stop-guidance-partial");
  requireField("stopBargeIn.recognizedDuringSpeech", isBooleanTrue);
  requireField("stopBargeIn.recognizedPhase", (value) => value === "partial");
  requireField("stopBargeIn.unexpectedSpeechListeningOverlapCount", (value) => value === 0);
  requireField("stopBargeIn.speechListeningInvariant", (value) => value === "PASS");
  requireField("stopBargeIn.staleSpeechAfterStop", isBooleanFalse);
  requireField("stopBargeIn.guidancePaused", isBooleanTrue);

  requireField("voiceOver.runningAtStart", isBooleanTrue);
  requireField("voiceOver.runningDuringGuidance", isBooleanTrue);
  requireField("voiceOver.runningAtStop", isBooleanTrue);
  requireField("voiceOver.runningAtExport", isBooleanTrue);

  requireField("settingsPersistence.nonDefaultSettingSurvivedRelaunch", isBooleanTrue);
  requireField("settingsPersistence.restoredDefaultsAfterValidation", isBooleanTrue);
  for (const snapshot of ["before", "afterVoiceChange", "afterRelaunch", "afterRestore"]) {
    requireField(`settingsPersistence.${snapshot}.speechRate`, (value) => ["slow", "normal", "fast"].includes(value));
    requireField(`settingsPersistence.${snapshot}.descriptionMode`, (value) => ["short", "detailed"].includes(value));
    requireField(`settingsPersistence.${snapshot}.hapticsEnabled`, (value) => typeof value === "boolean");
  }

  const settingsBefore = artifact.settingsPersistence?.before;
  const settingsAfterVoiceChange = artifact.settingsPersistence?.afterVoiceChange;
  const settingsAfterRelaunch = artifact.settingsPersistence?.afterRelaunch;
  const settingsAfterRestore = artifact.settingsPersistence?.afterRestore;
  if (isCompleteSettingsSnapshot(settingsBefore) && isCompleteSettingsSnapshot(settingsAfterVoiceChange)) {
    if (settingsSnapshotsEqual(settingsBefore, settingsAfterVoiceChange)) {
      invalid.push("settingsPersistence.afterVoiceChange.differsFromBefore");
    }
  }
  if (isCompleteSettingsSnapshot(settingsAfterVoiceChange) && isCompleteSettingsSnapshot(settingsAfterRelaunch)) {
    if (!settingsSnapshotsEqual(settingsAfterVoiceChange, settingsAfterRelaunch)) {
      invalid.push("settingsPersistence.afterRelaunch.matchesAfterVoiceChange");
    }
  }
  if (isCompleteSettingsSnapshot(settingsBefore) && isCompleteSettingsSnapshot(settingsAfterRestore)) {
    if (!settingsSnapshotsEqual(settingsBefore, settingsAfterRestore)) {
      invalid.push("settingsPersistence.afterRestore.matchesBefore");
    }
  }

  for (const [pathName, expectedNativePath] of [
    ["nativeCore", "native-core"],
    ["jsFallback", "js-fallback"],
  ]) {
    const prefix = `cameraPaths.${pathName}`;
    requireField(`${prefix}.outcome`, (value) => value === "success");
    requireField(`${prefix}.nativePath`, (value) => value === expectedNativePath);
    requireField(`${prefix}.requestId`, isUuidLike);
    requireField(`${prefix}.sampledFrame`, isBooleanTrue);
    requireField(`${prefix}.hasImage`, isBooleanTrue);
    requireField(`${prefix}.frameSummary`, isNonEmptyString);
    requireField(`${prefix}.sourceHeight`, (value) => Number.isInteger(value) && value > 0);
    requireField(`${prefix}.sourceWidth`, (value) => Number.isInteger(value) && value > 0);
    requireField(`${prefix}.uploadedHeight`, (value) => Number.isInteger(value) && value > 0);
    requireField(`${prefix}.uploadedWidth`, (value) => Number.isInteger(value) && value > 0);
    requireField(`${prefix}.captureHeuristics`, (value) => value && typeof value === "object" && !Array.isArray(value));
    requireField(`${prefix}.captureHeuristics.imageSource`, (value) => ["uri", "base64", "unknown"].includes(value));
    requireField(`${prefix}.captureHeuristics.frameAgeMs`, (value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
    requireField(`${prefix}.captureHeuristics.resizedForUpload`, (value) => typeof value === "boolean");
    requireField(`${prefix}.captureHeuristics.uploadedHeight`, (value) => Number.isInteger(value) && value > 0);
    requireField(`${prefix}.captureHeuristics.uploadedWidth`, (value) => Number.isInteger(value) && value > 0);

    const uploadedHeight = getPathValue(artifact, `${prefix}.uploadedHeight`);
    const uploadedWidth = getPathValue(artifact, `${prefix}.uploadedWidth`);
    const heuristicsHeight = getPathValue(artifact, `${prefix}.captureHeuristics.uploadedHeight`);
    const heuristicsWidth = getPathValue(artifact, `${prefix}.captureHeuristics.uploadedWidth`);
    if (Number.isInteger(uploadedHeight) && Number.isInteger(heuristicsHeight) && uploadedHeight !== heuristicsHeight) {
      invalid.push(`${prefix}.captureHeuristics.uploadedHeightMatchesPath`);
    }
    if (Number.isInteger(uploadedWidth) && Number.isInteger(heuristicsWidth) && uploadedWidth !== heuristicsWidth) {
      invalid.push(`${prefix}.captureHeuristics.uploadedWidthMatchesPath`);
    }
  }

  const sequence = Array.isArray(artifact.sequence) ? artifact.sequence : undefined;
  if (!sequence) {
    missing.push("sequence");
  } else {
    const sequenceOrder = sequence.map((step) => step?.id);
    if (
      sequenceOrder.length !== REQUIRED_NO_SCREEN_SEQUENCE.length ||
      sequenceOrder.some((stepId, index) => stepId !== REQUIRED_NO_SCREEN_SEQUENCE[index])
    ) {
      invalid.push("sequence.order");
    }

    const stepsById = new Map(sequence.map((step) => [step?.id, step]));
    for (const stepId of REQUIRED_NO_SCREEN_SEQUENCE) {
      const step = stepsById.get(stepId);
      if (!step) {
        missing.push(`sequence.${stepId}`);
        continue;
      }
      if (step.pass !== true) {
        invalid.push(`sequence.${stepId}.pass`);
      }
      if (step.noScreenRequired !== true) {
        invalid.push(`sequence.${stepId}.noScreenRequired`);
      }
      if (step.spokenFeedbackConfirmed !== true) {
        invalid.push(`sequence.${stepId}.spokenFeedbackConfirmed`);
      }
      if (stepId !== "cold-prompt" && step.voiceRecognized !== true) {
        invalid.push(`sequence.${stepId}.voiceRecognized`);
      }
    }

    const expectedStepFlags = {
      "start-guidance": ["cameraSessionActive"],
      status: ["statusIncludesSettings"],
      help: ["helpIncludesBoundedCommandList"],
      "slower-speech": ["settingPersisted"],
      "faster-speech": ["settingPersisted"],
      "more-detail": ["settingPersisted"],
      "less-detail": ["settingPersisted"],
      "haptics-off": ["hapticBehaviorConfirmed"],
      "haptics-on": ["hapticBehaviorConfirmed"],
      repeat: ["repeatedLastUtterance"],
      "what-do-you-see": ["conversationLane", "sampledFrameUsed"],
      "stop-guidance": ["stopCutThrough"],
    };

    for (const [stepId, flags] of Object.entries(expectedStepFlags)) {
      const step = stepsById.get(stepId);
      if (!step) {
        continue;
      }
      for (const flag of flags) {
        if (step[flag] !== true) {
          invalid.push(`sequence.${stepId}.${flag}`);
        }
      }
    }

    const sceneStep = stepsById.get("what-do-you-see");
    if (sceneStep && sceneStep.settingsChanged !== false) {
      invalid.push("sequence.what-do-you-see.settingsChanged");
    }
    const helpStep = stepsById.get("help");
    if (helpStep && helpStep.settingsChanged !== false) {
      invalid.push("sequence.help.settingsChanged");
    }
  }

  const disallowedKeys = findDisallowedKeys(artifact);
  const sensitivePatterns = findSensitivePatterns(artifact);
  for (const fieldPath of disallowedKeys) {
    invalid.push(`disallowedKey:${fieldPath}`);
  }
  for (const pattern of sensitivePatterns) {
    invalid.push(`sensitivePattern:${pattern}`);
  }

  return {
    invalid,
    missing,
    valid: missing.length === 0 && invalid.length === 0,
  };
}

export function formatNoScreenSmokeEvidenceIssues(result) {
  return `Missing: ${result.missing.join(", ") || "none"}. Invalid: ${result.invalid.join(", ") || "none"}.`;
}
