import fs from "node:fs";
import path from "node:path";
import {
  findDisallowedKeys,
  findSensitivePatterns,
} from "./evidence-privacy.mjs";

export const NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH = "release/no-screen-smoke.latest.json";

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
  requireField("provenance.releaseTrack", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.buildProfile", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.appVersion", isNonEmptyString);
  requireField("provenance.buildNumber", isNonEmptyString);
  requireField("provenance.bundleIdentifier", isNonEmptyString);
  requireField("provenance.apiEnvironment", (value) => ["staging", "production"].includes(value));
  requireField("provenance.apiBaseUrlLabel", (value) => ["staging", "production"].includes(value));

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

  requireField("deviceReadiness.result", (value) => value === "ready");
  requireField("deviceReadiness.paired", isBooleanTrue);
  requireField("deviceReadiness.trusted", isBooleanTrue);
  requireField("deviceReadiness.developerModeEnabled", isBooleanTrue);
  requireField("deviceReadiness.usbOrSameLan", isBooleanTrue);
  requireField("deviceReadiness.xcodeDestinationAvailable", isBooleanTrue);

  requireField("assistiveTech.voiceOverRunning", isBooleanTrue);
  requireField("assistiveTech.speechInputConfirmed", isBooleanTrue);
  requireField("assistiveTech.spokenOutputConfirmed", isBooleanTrue);
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
  requireField("backendSmoke.requestIds.health", isUuidLike);
  requireField("backendSmoke.requestIds.bootstrap", isUuidLike);
  requireField("backendSmoke.requestIds.analyze", isUuidLike);

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
  requireField("stopBargeIn.armedDuringSpeech", isBooleanTrue);
  requireField("stopBargeIn.audioCueAttempted", isBooleanTrue);
  requireField("stopBargeIn.cutThrough", isBooleanTrue);
  requireField("stopBargeIn.hapticAttempted", isBooleanTrue);
  requireField("stopBargeIn.lastSpeechListeningOverlapReason", (value) => value === "stop-barge-in");
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
