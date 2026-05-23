import fs from "node:fs";
import path from "node:path";

export const NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH = "release/no-screen-smoke.latest.json";

export const REQUIRED_NO_SCREEN_SEQUENCE = [
  "cold-prompt",
  "start-guidance",
  "status",
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

const DISALLOWED_KEYS = new Set([
  "apiKey",
  "authorization",
  "audioBase64",
  "credential",
  "credentials",
  "deviceId",
  "fullDeviceIdentifier",
  "base64",
  "imageBase64",
  "password",
  "providerKey",
  "rawAudio",
  "rawImage",
  "sessionToken",
  "signedUrl",
  "token",
  "udid",
  "uri",
]);

const SENSITIVE_PATTERNS = [
  /data:(?:image|audio)\/[a-z0-9.+-]+;base64,/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /OPENAI_API_KEY\s*[:=]\s*[^,"\s]+/i,
  /(?:X-Amz-Signature|X-Goog-Signature|Signature=|sig=)/i,
  /[A-Za-z0-9+/]{200,}={0,2}/,
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

function findDisallowedKeys(value, prefix = "") {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDisallowedKeys(item, `${prefix}[${index}]`));
  }

  const matches = [];
  for (const [key, child] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (DISALLOWED_KEYS.has(key)) {
      matches.push(fieldPath);
    }
    matches.push(...findDisallowedKeys(child, fieldPath));
  }
  return matches;
}

function findSensitivePatterns(value) {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    return [];
  }

  return SENSITIVE_PATTERNS
    .filter((pattern) => pattern.test(serialized))
    .map((pattern) => pattern.toString());
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
  requireField("stopBargeIn.cutThrough", isBooleanTrue);
  requireField("stopBargeIn.lastSpeechListeningOverlapReason", (value) => value === "stop-barge-in");
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
