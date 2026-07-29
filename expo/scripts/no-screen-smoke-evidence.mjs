import fs from "node:fs";
import path from "node:path";
import {
  findDisallowedKeys,
  findSensitivePatterns,
  findUnexpectedFields,
} from "./evidence-privacy.mjs";
import {
  isGitRevision,
  isSanitizedRequestId,
  isWorkerIdentifier,
  SMOKE_ARTIFACT_VERSION,
  SMOKE_CLOCK_SKEW_MS,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";

export const NO_SCREEN_SMOKE_ARTIFACT_VERSION = 3;
export const NO_SCREEN_SMOKE_ARTIFACT_PATHS = Object.freeze({
  blindParticipant: "release/no-screen-smoke.blind-participant.latest.json",
  internal: "release/no-screen-smoke.internal.latest.json",
  testflight: "release/no-screen-smoke.testflight.latest.json",
});
export const NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH =
  NO_SCREEN_SMOKE_ARTIFACT_PATHS.internal;
export const NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS = SMOKE_EVIDENCE_MAX_AGE_SECONDS;
export const NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS = SMOKE_CLOCK_SKEW_MS;

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OPERATOR_LABEL_PATTERN = /^operator-[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
const INTERNAL_PARTICIPANT_LABEL_PATTERN = /^internal-[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
const BLIND_PARTICIPANT_LABEL_PATTERN = /^blind-[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/;
const APP_STORE_BUILD_RECORD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const PARTICIPANT_ROLES = new Set(["internal-tester", "blind-participant"]);
const INSTALLATION_SOURCES = new Set(["ad-hoc", "testflight"]);
const INTERACTION_ASSISTANCE = new Set(["none", "safety-spotter-only"]);
const MAX_INTERRUPTION_RECOVERY_MS = 10_000;
const MAX_COMMAND_EXECUTION_MS = 60 * 60 * 1000;
const MAX_EVIDENCE_EXPORT_DELAY_MS = 15 * 60 * 1000;
const MAX_CORE_DEVICE_PROBE_LEAD_MS = 15 * 60 * 1000;
const MAX_CAPTURE_LATENCY_MS = 5_000;
const MAX_FRAME_AGE_MS = 2_000;
const MAX_STOP_FEEDBACK_LATENCY_MS = 1_000;
const MAX_STOP_SHUTDOWN_LATENCY_MS = 3_000;
const MAX_UPLOADED_FRAME_LONG_EDGE = 768;
const MIN_UPLOADED_FRAME_DIMENSION = 32;
const CORE_DEVICE_PROBE_TYPE = "devicectl-process-info";

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

const COMMAND_STEP_COMMON_FIELD_TYPES = Object.freeze({
  eventId: "uuid",
  id: "command-id",
  noScreenRequired: "boolean",
  observedAt: "iso-timestamp",
  pass: "boolean",
  spokenFeedbackConfirmed: "boolean",
  voiceRecognized: "boolean",
});
const COMMAND_STEP_OUTCOME_FIELD_TYPES = Object.freeze({
  "cold-prompt": {},
  "start-guidance": {
    cameraSessionActive: "boolean",
  },
  status: {
    statusIncludesSettings: "boolean",
  },
  help: {
    helpIncludesBoundedCommandList: "boolean",
    settingsChanged: "boolean",
  },
  "slower-speech": {
    settingPersisted: "boolean",
  },
  "faster-speech": {
    settingPersisted: "boolean",
  },
  "more-detail": {
    settingPersisted: "boolean",
  },
  "less-detail": {
    settingPersisted: "boolean",
  },
  "haptics-off": {
    hapticBehaviorConfirmed: "boolean",
  },
  "haptics-on": {
    hapticBehaviorConfirmed: "boolean",
  },
  repeat: {
    repeatedLastUtterance: "boolean",
  },
  "what-do-you-see": {
    conversationLane: "boolean",
    sampledFrameUsed: "boolean",
    settingsChanged: "boolean",
  },
  "stop-guidance": {
    stopCutThrough: "boolean",
  },
});
const COMMAND_STEP_FIELD_TYPES = Object.freeze(
  Object.fromEntries(
    REQUIRED_NO_SCREEN_SEQUENCE.map((commandId) => [
      commandId,
      Object.freeze({
        ...COMMAND_STEP_COMMON_FIELD_TYPES,
        ...COMMAND_STEP_OUTCOME_FIELD_TYPES[commandId],
      }),
    ]),
  ),
);
const COMMAND_STEP_EVIDENCE_SHAPES = Object.freeze(
  Object.fromEntries(
    Object.entries(COMMAND_STEP_FIELD_TYPES).map(([commandId, fieldTypes]) => [
      commandId,
      Object.freeze(
        Object.fromEntries(Object.keys(fieldTypes).map((fieldName) => [fieldName, true])),
      ),
    ]),
  ),
);
const MAX_RFC3339_TIMESTAMP_LENGTH = 64;
const RFC3339_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?([Zz]|([+-])(\d{2}):(\d{2}))$/;

const SETTINGS_SNAPSHOT_SHAPE = {
  descriptionMode: true,
  hapticsEnabled: true,
  speechRate: true,
};
const INTERRUPTION_RECOVERY_SHAPE = {
  attempted: true,
  boundedRecoveryConfirmed: true,
  conservativeStopConfirmed: true,
  explicitRestartConfirmed: true,
  explicitRestartRequired: true,
  guidanceInactiveAfterInterruption: true,
  noContinuedGuidance: true,
  recoveryLatencyMs: true,
};
const CAMERA_CAPTURE_HEURISTICS_SHAPE = {
  captureLatencyMs: true,
  frameAgeMs: true,
  imageSource: true,
  resizedForUpload: true,
  uploadedHeight: true,
  uploadedWidth: true,
};
const CAMERA_PATH_EVIDENCE_SHAPE = {
  captureHeuristics: CAMERA_CAPTURE_HEURISTICS_SHAPE,
  frameSummary: true,
  hasImage: true,
  nativePath: true,
  outcome: true,
  requestId: true,
  sampledFrame: true,
  sourceHeight: true,
  sourceWidth: true,
  uploadedHeight: true,
  uploadedWidth: true,
};
const STOP_BARGE_IN_EVIDENCE_SHAPE = {
  analysisInactiveAfterStop: true,
  armedDuringSpeech: true,
  attemptedDuringSpeech: true,
  audioCueAttempted: true,
  audioCueOutcome: true,
  cameraInactiveAfterStop: true,
  cutThrough: true,
  eventId: true,
  feedbackObservedAt: true,
  guidancePaused: true,
  hapticAttempted: true,
  hapticOutcome: true,
  lastSpeechListeningOverlapReason: true,
  listeningStoppedAfterStop: true,
  observedAt: true,
  postStopObservedAt: true,
  recognizedCommand: true,
  recognizedDuringSpeech: true,
  recognizedPhase: true,
  speechListeningInvariant: true,
  staleSpeechAfterStop: true,
  unexpectedSpeechListeningOverlapCount: true,
};
const COMMAND_SEQUENCE_EVIDENCE_SHAPE = {
  analyzeRequestId: true,
  completedAt: true,
  executionId: true,
  executionPath: true,
  startedAt: true,
  // Command steps are validated against their exact command-indexed shapes below.
  steps: true,
  stopBargeIn: STOP_BARGE_IN_EVIDENCE_SHAPE,
};
const EXECUTION_COUNTER_SHAPE = {
  failureCount: true,
  lastExecutionPath: true,
  lastOutcome: true,
  lastType: true,
  successCount: true,
};
const AD_HOC_INSTALLATION_EVIDENCE_SHAPE = Object.freeze({
  appStoreAppIdMatched: true,
  appIdentityMatched: true,
  appTransactionVerified: true,
  bundleVersionMatched: true,
  distributionEnvironment: true,
  installedValidationIpaSha256: true,
});
const TESTFLIGHT_INSTALLATION_EVIDENCE_SHAPE = Object.freeze({
  appStoreAppIdMatched: true,
  appIdentityMatched: true,
  appTransactionVerified: true,
  bundleVersionMatched: true,
  distributionEnvironment: true,
  storeKitEvidencePurpose: true,
  uploadedAt: true,
  uploadedIpaSha256: true,
});
const NO_SCREEN_SMOKE_EVIDENCE_SHAPE = {
  appStoreConnectBuildRecordIdentifier: true,
  artifactVersion: true,
  assistiveTech: {
    audioCuesAudible: true,
    hapticsFelt: true,
    speechInputConfirmed: true,
    spokenOutputConfirmed: true,
    voiceProcessingEnabled: true,
    voiceOverRunning: true,
  },
  backendSmoke: {
    analyzeStatusCode: true,
    apiBaseUrl: true,
    artifactVersion: true,
    bootstrapStatusCode: true,
    environment: true,
    executionPath: true,
    generatedAt: true,
    healthStatusCode: true,
    model: true,
    promptVersion: true,
    provenance: {
      sourceRevision: true,
      workerDeploymentId: true,
      workerVersionCreatedAt: true,
      workerVersionId: true,
    },
    providerBacked: true,
    requestIds: {
      analyze: true,
      bootstrap: true,
      guidanceAnalyze: true,
      health: true,
      sceneQueryAnalyze: true,
    },
    structuredOutputValid: true,
    walkability: true,
  },
  cameraPaths: {
    jsFallback: CAMERA_PATH_EVIDENCE_SHAPE,
    nativeCore: CAMERA_PATH_EVIDENCE_SHAPE,
  },
  commandSequences: {
    jsFallback: COMMAND_SEQUENCE_EVIDENCE_SHAPE,
    nativeCore: COMMAND_SEQUENCE_EVIDENCE_SHAPE,
  },
  device: {
    appVersion: true,
    buildNumber: true,
    buildProfile: true,
    bundleIdentifier: true,
    identifierSuffix: true,
    model: true,
    osVersion: true,
  },
  deviceReadiness: {
    coreDeviceExecutionReady: true,
    coreDeviceProbe: {
      checkedAt: true,
      exitStatus: true,
      outcome: true,
      type: true,
    },
    ddiServicesAvailable: true,
    developerModeEnabled: true,
    lastConnectionDate: true,
    listedState: true,
    paired: true,
    result: true,
    trusted: true,
    tunnelConnected: true,
    usbOrSameLan: true,
    xcodeDestinationAvailable: true,
    xctraceVisible: true,
  },
  diagnostics: {
    audioCues: EXECUTION_COUNTER_SHAPE,
    haptics: EXECUTION_COUNTER_SHAPE,
    jsFallbackCaptureConfirmed: true,
    nativeCameraCaptureConfirmed: true,
    noRawMediaOrSecrets: true,
    settingsPersistedAfterRestart: true,
    speechListeningInvariant: true,
    stopBargeInConfirmed: true,
    unexpectedSpeechListeningOverlapCount: true,
    voiceOverRunning: true,
    voiceProcessingEnabled: true,
  },
  generatedAt: true,
  humanAttestation: {
    attestedAt: true,
    blindParticipantSelfAttested: true,
    installationSourceConfirmed: true,
    nonvisualOperationConfirmed: true,
    participantRoleConfirmed: true,
    sensoryObservationsConfirmed: true,
  },
  // The source-specific closed shape is applied after installationSource is read.
  installationEvidence: true,
  installationSource: true,
  interactionAssistance: true,
  interruptionRecovery: {
    audioRoute: INTERRUPTION_RECOVERY_SHAPE,
    backgroundForeground: INTERRUPTION_RECOVERY_SHAPE,
  },
  noScreen: {
    cleanInstallOrReset: true,
    nonvisualOperation: true,
    noScreenUsed: true,
    visualScreenInspectionUsed: true,
    voiceAndVoiceOverOnly: true,
  },
  operator: true,
  participantLabel: true,
  participantRole: true,
  privacy: {
    containsFullDeviceIds: true,
    containsIdentityContactData: true,
    containsRawAudio: true,
    containsRawMedia: true,
    containsSecrets: true,
    containsSignedUrls: true,
  },
  provenance: {
    apiBaseUrlLabel: true,
    apiEnvironment: true,
    appVersion: true,
    artifactType: true,
    buildNumber: true,
    buildProfile: true,
    bundleIdentifier: true,
    candidateBinarySha256: true,
    candidateIdentifier: true,
    generatedAt: true,
    releaseTrack: true,
    runId: true,
    schemaVersion: true,
    sourceRevision: true,
  },
  settingsPersistence: {
    afterRelaunch: SETTINGS_SNAPSHOT_SHAPE,
    afterRestore: SETTINGS_SNAPSHOT_SHAPE,
    afterVoiceChange: SETTINGS_SNAPSHOT_SHAPE,
    before: SETTINGS_SNAPSHOT_SHAPE,
    nonDefaultSettingSurvivedRelaunch: true,
    restoredDefaultsAfterValidation: true,
  },
  validationMode: true,
  visualPromptingUsed: true,
  visualScreenUse: true,
  voiceOver: {
    runningAtExport: true,
    runningAtStart: true,
    runningAtStop: true,
    runningDuringGuidance: true,
  },
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isBooleanTrue(value) {
  return value === true;
}

function isBooleanFalse(value) {
  return value === false;
}

function daysInMonth(year, month) {
  if (month === 2) {
    const isLeapYear =
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseRfc3339Timestamp(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_RFC3339_TIMESTAMP_LENGTH
  ) {
    return undefined;
  }

  const match = value.match(RFC3339_TIMESTAMP_PATTERN);
  if (!match) {
    return undefined;
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText = "",
    zoneText,
    offsetSign,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  const day = Number.parseInt(dayText, 10);
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const second = Number.parseInt(secondText, 10);
  const offsetHour = offsetHourText
    ? Number.parseInt(offsetHourText, 10)
    : 0;
  const offsetMinute = offsetMinuteText
    ? Number.parseInt(offsetMinuteText, 10)
    : 0;

  if (
    year < 1
    || month < 1
    || month > 12
    || day < 1
    || day > daysInMonth(year, month)
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    return undefined;
  }

  const millisecond = Number.parseInt(fractionText.padEnd(3, "0") || "0", 10);
  const utcDate = new Date(0);
  utcDate.setUTCFullYear(year, month - 1, day);
  utcDate.setUTCHours(hour, minute, second, millisecond);
  const offsetDirection = offsetSign === "-" ? -1 : 1;
  const offsetMs = /^[Zz]$/.test(zoneText)
    ? 0
    : offsetDirection * ((offsetHour * 60) + offsetMinute) * 60_000;
  const timestampMs = utcDate.getTime() - offsetMs;
  return Number.isFinite(timestampMs) ? timestampMs : undefined;
}

function isRfc3339Timestamp(value) {
  return parseRfc3339Timestamp(value) !== undefined;
}

function isPlainEvidenceObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function findNonPlainEvidenceObjects(value, prefix = "", seen = new WeakSet()) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const objectPath = prefix || "artifact";
  if (seen.has(value)) {
    return [`${objectPath}.cycle`];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findNonPlainEvidenceObjects(item, `${objectPath}[${index}]`, seen),
    );
  }

  const matches = isPlainEvidenceObject(value) ? [] : [objectPath];
  for (const [key, child] of Object.entries(value)) {
    matches.push(
      ...findNonPlainEvidenceObjects(
        child,
        prefix ? `${prefix}.${key}` : key,
        seen,
      ),
    );
  }
  return matches;
}

function validateCommandStepContract(step, expectedCommandId, fieldPath) {
  const invalid = [];
  const missing = [];
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    invalid.push(`${fieldPath}.object`);
    return { invalid, missing };
  }

  const fieldTypes = COMMAND_STEP_FIELD_TYPES[expectedCommandId];
  const expectedShape = COMMAND_STEP_EVIDENCE_SHAPES[expectedCommandId];
  for (const unexpectedField of findUnexpectedFields(step, expectedShape, fieldPath)) {
    invalid.push(`unexpectedField:${unexpectedField}`);
  }

  for (const [fieldName, fieldType] of Object.entries(fieldTypes)) {
    const stepFieldPath = `${fieldPath}.${fieldName}`;
    if (!Object.prototype.hasOwnProperty.call(step, fieldName)) {
      missing.push(stepFieldPath);
      continue;
    }

    const value = step[fieldName];
    if (fieldType === "boolean" && typeof value !== "boolean") {
      invalid.push(`${stepFieldPath}.type`);
    } else if (fieldType === "command-id" && value !== expectedCommandId) {
      invalid.push(stepFieldPath);
    } else if (fieldType === "uuid" && !isUuidLike(value)) {
      invalid.push(stepFieldPath);
    } else if (
      fieldType === "iso-timestamp"
      && !isRfc3339Timestamp(value)
    ) {
      invalid.push(stepFieldPath);
    }
  }

  return { invalid, missing };
}

function parseIosMajorVersion(value) {
  if (!isNonEmptyString(value)) {
    return undefined;
  }
  const match = value.trim().match(/^(?:iOS\s*)?(\d+)(?:\.|$)/i);
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function getExecutionWindow(artifact) {
  const starts = ["nativeCore", "jsFallback"]
    .map((sequenceName) =>
      parseRfc3339Timestamp(
        getPathValue(
          artifact,
          `commandSequences.${sequenceName}.startedAt`,
        ),
      ),
    )
    .filter(Number.isFinite);
  const completions = ["nativeCore", "jsFallback"]
    .map((sequenceName) =>
      parseRfc3339Timestamp(
        getPathValue(
          artifact,
          `commandSequences.${sequenceName}.completedAt`,
        ),
      ),
    )
    .filter(Number.isFinite);
  return {
    completedAtMs: completions.length === 2 ? Math.max(...completions) : undefined,
    startedAtMs: starts.length === 2 ? Math.min(...starts) : undefined,
  };
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
    if (
      !value
      || typeof value !== "object"
      || !Object.prototype.hasOwnProperty.call(value, segment)
    ) {
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

  if (!isPlainEvidenceObject(artifact)) {
    return {
      invalid: ["artifact.plain-object"],
      missing,
      valid: false,
    };
  }

  for (const fieldPath of findNonPlainEvidenceObjects(artifact)) {
    invalid.push(`nonPlainObject:${fieldPath}`);
  }

  requireField("artifactVersion", (value) => value === NO_SCREEN_SMOKE_ARTIFACT_VERSION);
  requireField("generatedAt", isRfc3339Timestamp);
  requireField("operator", (value) => isNonEmptyString(value) && OPERATOR_LABEL_PATTERN.test(value));
  requireField("participantRole", (value) => PARTICIPANT_ROLES.has(value));
  requireField("participantLabel", isNonEmptyString);
  requireField("visualPromptingUsed", isBooleanFalse);
  requireField("interactionAssistance", (value) => INTERACTION_ASSISTANCE.has(value));
  requireField("installationSource", (value) => INSTALLATION_SOURCES.has(value));
  requireField("validationMode", (value) => value === "real-iphone-no-screen");
  requireField("visualScreenUse", (value) => value === "none");

  const participantLabelPattern = artifact.participantRole === "blind-participant"
    ? BLIND_PARTICIPANT_LABEL_PATTERN
    : INTERNAL_PARTICIPANT_LABEL_PATTERN;
  if (
    isNonEmptyString(artifact.participantLabel)
    && !participantLabelPattern.test(artifact.participantLabel)
  ) {
    invalid.push("participantLabel");
  }

  requireField("provenance.schemaVersion", (value) => value === 3);
  requireField("provenance.artifactType", (value) => value === "real-iphone-no-screen-smoke");
  requireField("provenance.generatedAt", isRfc3339Timestamp);
  requireField("provenance.runId", isNonEmptyString);
  requireField("provenance.sourceRevision", isGitRevision);
  requireField("provenance.candidateBinarySha256", (value) => SHA256_PATTERN.test(value));
  requireField("provenance.candidateIdentifier", (value) => SHA256_PATTERN.test(value));
  requireField("provenance.releaseTrack", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.buildProfile", (value) => ["preview", "testflight", "store"].includes(value));
  requireField("provenance.appVersion", isNonEmptyString);
  requireField("provenance.buildNumber", isNonEmptyString);
  requireField("provenance.bundleIdentifier", isNonEmptyString);
  requireField("provenance.apiEnvironment", (value) => ["staging", "production"].includes(value));
  requireField("provenance.apiBaseUrlLabel", (value) => ["staging", "production"].includes(value));

  const generatedAtMs = parseRfc3339Timestamp(
    getPathValue(artifact, "generatedAt"),
  );
  if (Number.isFinite(generatedAtMs)) {
    if (generatedAtMs > nowMs + NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS) {
      invalid.push("generatedAt.in-future");
    }
    if (generatedAtMs < nowMs - NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS * 1000) {
      invalid.push("generatedAt.stale");
    }
    const candidateGeneratedAtMs = parseRfc3339Timestamp(
      options.expectedCandidateGeneratedAt,
    );
    if (
      Number.isFinite(candidateGeneratedAtMs)
      && generatedAtMs < candidateGeneratedAtMs - NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS
    ) {
      invalid.push("generatedAt.before-candidate");
    }
  }

  const participantRole = getPathValue(artifact, "participantRole");
  const installationSource = getPathValue(artifact, "installationSource");
  if (options.expectedParticipantRole && participantRole !== options.expectedParticipantRole) {
    invalid.push(`participantRole:${participantRole ?? "missing"}`);
  }
  if (options.expectedInstallationSource && installationSource !== options.expectedInstallationSource) {
    invalid.push(`installationSource:${installationSource ?? "missing"}`);
  }
  const installationEvidence = getPathValue(artifact, "installationEvidence");
  const installationEvidenceShape = installationSource === "testflight"
    ? TESTFLIGHT_INSTALLATION_EVIDENCE_SHAPE
    : installationSource === "ad-hoc"
      ? AD_HOC_INSTALLATION_EVIDENCE_SHAPE
      : undefined;
  if (installationEvidenceShape) {
    for (const fieldPath of findUnexpectedFields(
      installationEvidence,
      installationEvidenceShape,
      "installationEvidence",
    )) {
      invalid.push(`unexpectedField:${fieldPath}`);
    }
  }

  if (installationSource === "testflight") {
    requireField(
      "appStoreConnectBuildRecordIdentifier",
      (value) => isNonEmptyString(value) && APP_STORE_BUILD_RECORD_PATTERN.test(value),
    );
    requireField("installationEvidence.appStoreAppIdMatched", isBooleanTrue);
    requireField("installationEvidence.appTransactionVerified", isBooleanTrue);
    requireField("installationEvidence.appIdentityMatched", isBooleanTrue);
    requireField("installationEvidence.bundleVersionMatched", isBooleanTrue);
    requireField(
      "installationEvidence.distributionEnvironment",
      (value) => value === "apple-sandbox",
    );
    requireField(
      "installationEvidence.storeKitEvidencePurpose",
      (value) => value === "apple-signed-app-identity-only",
    );
    requireField(
      "installationEvidence.uploadedAt",
      isRfc3339Timestamp,
    );
    requireField(
      "installationEvidence.uploadedIpaSha256",
      (value) => SHA256_PATTERN.test(value),
    );
    if (
      options.expectedCandidateIpaSha256
      && artifact.installationEvidence?.uploadedIpaSha256 !== options.expectedCandidateIpaSha256
    ) {
      invalid.push("installationEvidence.uploadedIpaSha256-mismatch");
    }
    if (
      artifact.installationEvidence?.installedValidationIpaSha256 !== undefined
      && artifact.installationEvidence.installedValidationIpaSha256 !== ""
    ) {
      invalid.push("installationEvidence.installedValidationIpaSha256.testflight");
    }
    if (
      options.expectedAppStoreConnectBuildEvidence
      && artifact.appStoreConnectBuildRecordIdentifier
        !== options.expectedAppStoreConnectBuildEvidence.buildRecordIdentifier
    ) {
      invalid.push("appStoreConnectBuildRecordIdentifier-live-mismatch");
    }
    if (
      options.expectedAppStoreConnectBuildEvidence
      && artifact.installationEvidence?.uploadedAt
        !== options.expectedAppStoreConnectBuildEvidence.uploadedAt
    ) {
      invalid.push("installationEvidence.uploadedAt-live-mismatch");
    }
    const iosMajorVersion = parseIosMajorVersion(artifact.device?.osVersion);
    if (!Number.isInteger(iosMajorVersion) || iosMajorVersion < 16) {
      invalid.push("device.osVersion.storekit-app-transaction-unavailable");
    }
  } else if (installationSource === "ad-hoc") {
    const appStoreConnectBuildRecordIdentifier = getPathValue(
      artifact,
      "appStoreConnectBuildRecordIdentifier",
    );
    if (
      appStoreConnectBuildRecordIdentifier !== undefined
      && appStoreConnectBuildRecordIdentifier !== ""
    ) {
      invalid.push("appStoreConnectBuildRecordIdentifier.ad-hoc");
    }
    requireField("installationEvidence.appStoreAppIdMatched", isBooleanFalse);
    requireField("installationEvidence.appTransactionVerified", isBooleanFalse);
    requireField("installationEvidence.appIdentityMatched", isBooleanFalse);
    requireField("installationEvidence.bundleVersionMatched", isBooleanFalse);
    requireField(
      "installationEvidence.distributionEnvironment",
      (value) => value === "none",
    );
    requireField(
      "installationEvidence.installedValidationIpaSha256",
      (value) => SHA256_PATTERN.test(value),
    );
    if (
      options.expectedValidationIpaSha256
      && artifact.installationEvidence?.installedValidationIpaSha256
        !== options.expectedValidationIpaSha256
    ) {
      invalid.push(
        "installationEvidence.installedValidationIpaSha256-mismatch",
      );
    }
    if (
      artifact.installationEvidence?.uploadedIpaSha256 !== undefined
      && artifact.installationEvidence.uploadedIpaSha256 !== ""
    ) {
      invalid.push("installationEvidence.uploadedIpaSha256.ad-hoc");
    }
  }
  if (
    isPlainEvidenceObject(installationEvidence)
    && (
      Object.prototype.hasOwnProperty.call(installationEvidence, "receiptPresent")
      || Object.prototype.hasOwnProperty.call(
        installationEvidence,
        "receiptEnvironment",
      )
    )
  ) {
    invalid.push("installationEvidence.legacyReceiptFields");
  }

  requireField("noScreen.noScreenUsed", isBooleanTrue);
  requireField("noScreen.nonvisualOperation", isBooleanTrue);
  requireField("noScreen.visualScreenInspectionUsed", isBooleanFalse);
  requireField("noScreen.voiceAndVoiceOverOnly", isBooleanTrue);
  requireField("noScreen.cleanInstallOrReset", isBooleanTrue);

  requireField("humanAttestation.attestedAt", isRfc3339Timestamp);
  requireField("humanAttestation.installationSourceConfirmed", isBooleanTrue);
  requireField("humanAttestation.nonvisualOperationConfirmed", isBooleanTrue);
  requireField("humanAttestation.participantRoleConfirmed", isBooleanTrue);
  requireField("humanAttestation.sensoryObservationsConfirmed", isBooleanTrue);
  requireField(
    "humanAttestation.blindParticipantSelfAttested",
    participantRole === "blind-participant" ? isBooleanTrue : isBooleanFalse,
  );
  requireMatchingFields(
    artifact,
    ["generatedAt", "humanAttestation.attestedAt"],
    invalid,
  );

  requireField("privacy.containsRawMedia", isBooleanFalse);
  requireField("privacy.containsRawAudio", isBooleanFalse);
  requireField("privacy.containsSecrets", isBooleanFalse);
  requireField("privacy.containsSignedUrls", isBooleanFalse);
  requireField("privacy.containsFullDeviceIds", isBooleanFalse);
  requireField("privacy.containsIdentityContactData", isBooleanFalse);

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
  if (
    options.expectedCandidateIdentifier
    && artifact.provenance?.candidateIdentifier !== options.expectedCandidateIdentifier
  ) {
    invalid.push("provenance.candidateIdentifier-mismatch");
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
  if (
    options.requireCandidateBinding
    && !SHA256_PATTERN.test(options.expectedCandidateIdentifier ?? "")
  ) {
    invalid.push("provenance.expectedCandidateIdentifier-unavailable");
  }
  if (
    options.requireCandidateBinding
    && installationSource === "testflight"
    && !SHA256_PATTERN.test(options.expectedCandidateIpaSha256 ?? "")
  ) {
    invalid.push("installationEvidence.expectedCandidateIpaSha256-unavailable");
  }
  if (
    options.requireCandidateBinding
    && installationSource === "ad-hoc"
    && !SHA256_PATTERN.test(options.expectedValidationIpaSha256 ?? "")
  ) {
    invalid.push(
      "installationEvidence.expectedValidationIpaSha256-unavailable",
    );
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
  requireField("deviceReadiness.coreDeviceExecutionReady", isBooleanTrue);
  requireField(
    "deviceReadiness.coreDeviceProbe.type",
    (value) => value === CORE_DEVICE_PROBE_TYPE,
  );
  requireField(
    "deviceReadiness.coreDeviceProbe.outcome",
    (value) => value === "success",
  );
  requireField(
    "deviceReadiness.coreDeviceProbe.exitStatus",
    (value) => value === 0,
  );
  requireField(
    "deviceReadiness.coreDeviceProbe.checkedAt",
    isRfc3339Timestamp,
  );
  requireField("deviceReadiness.xcodeDestinationAvailable", isBooleanTrue);
  requireField("deviceReadiness.xctraceVisible", isBooleanTrue);
  const coreDeviceProbeCheckedAtMs = parseRfc3339Timestamp(
    getPathValue(artifact, "deviceReadiness.coreDeviceProbe.checkedAt"),
  );
  const executionWindow = getExecutionWindow(artifact);
  if (
    Number.isFinite(coreDeviceProbeCheckedAtMs)
    && Number.isFinite(executionWindow.startedAtMs)
    && (
      coreDeviceProbeCheckedAtMs
        < executionWindow.startedAtMs - MAX_CORE_DEVICE_PROBE_LEAD_MS
      || coreDeviceProbeCheckedAtMs
        > executionWindow.startedAtMs
    )
  ) {
    invalid.push("deviceReadiness.coreDeviceProbe.checkedAt.execution-window");
  }
  if (
    Number.isFinite(coreDeviceProbeCheckedAtMs)
    && Number.isFinite(generatedAtMs)
    && coreDeviceProbeCheckedAtMs > generatedAtMs
  ) {
    invalid.push(
      "deviceReadiness.coreDeviceProbe.checkedAt.after-evidence-generatedAt",
    );
  }
  const candidateGeneratedAtMs = parseRfc3339Timestamp(
    options.expectedCandidateGeneratedAt,
  );
  if (
    Number.isFinite(coreDeviceProbeCheckedAtMs)
    && Number.isFinite(candidateGeneratedAtMs)
    && coreDeviceProbeCheckedAtMs
      < candidateGeneratedAtMs - NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS
  ) {
    invalid.push("deviceReadiness.coreDeviceProbe.checkedAt.before-candidate");
  }

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
  requireField("backendSmoke.generatedAt", isRfc3339Timestamp);
  requireField("backendSmoke.provenance.sourceRevision", isGitRevision);
  requireField("backendSmoke.provenance.workerDeploymentId", isWorkerIdentifier);
  requireField("backendSmoke.provenance.workerVersionId", isWorkerIdentifier);
  requireField(
    "backendSmoke.provenance.workerVersionCreatedAt",
    isRfc3339Timestamp,
  );
  requireField("backendSmoke.requestIds.health", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.bootstrap", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.analyze", isUuidLike);
  requireField("backendSmoke.requestIds.guidanceAnalyze", isSanitizedRequestId);
  requireField("backendSmoke.requestIds.sceneQueryAnalyze", isSanitizedRequestId);

  const backendGeneratedAtMs = parseRfc3339Timestamp(
    getPathValue(artifact, "backendSmoke.generatedAt"),
  );
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

  for (const interruptionName of ["backgroundForeground", "audioRoute"]) {
    const prefix = `interruptionRecovery.${interruptionName}`;
    requireField(`${prefix}.attempted`, isBooleanTrue);
    requireField(`${prefix}.conservativeStopConfirmed`, isBooleanTrue);
    requireField(`${prefix}.guidanceInactiveAfterInterruption`, isBooleanTrue);
    requireField(`${prefix}.noContinuedGuidance`, isBooleanTrue);
    requireField(`${prefix}.boundedRecoveryConfirmed`, isBooleanTrue);
    requireField(
      `${prefix}.recoveryLatencyMs`,
      (value) =>
        Number.isFinite(value)
        && value >= 0
        && value <= MAX_INTERRUPTION_RECOVERY_MS,
    );
    requireField(`${prefix}.explicitRestartRequired`, isBooleanTrue);
    requireField(`${prefix}.explicitRestartConfirmed`, isBooleanTrue);
  }

  for (const [pathName, expectedNativePath] of [
    ["nativeCore", "native-core"],
    ["jsFallback", "js-fallback"],
  ]) {
    const prefix = `cameraPaths.${pathName}`;
    const expectedFrameSummary = expectedNativePath === "native-core"
      ? "Sanitized native-core sampled frame summary."
      : "Sanitized js fallback sampled frame summary.";
    requireField(`${prefix}.outcome`, (value) => value === "success");
    requireField(`${prefix}.nativePath`, (value) => value === expectedNativePath);
    requireField(`${prefix}.requestId`, isUuidLike);
    requireField(`${prefix}.sampledFrame`, isBooleanTrue);
    requireField(`${prefix}.hasImage`, isBooleanTrue);
    requireField(`${prefix}.frameSummary`, (value) => value === expectedFrameSummary);
    requireField(
      `${prefix}.sourceHeight`,
      (value) => Number.isInteger(value) && value >= MIN_UPLOADED_FRAME_DIMENSION,
    );
    requireField(
      `${prefix}.sourceWidth`,
      (value) => Number.isInteger(value) && value >= MIN_UPLOADED_FRAME_DIMENSION,
    );
    requireField(
      `${prefix}.uploadedHeight`,
      (value) =>
        Number.isInteger(value)
        && value >= MIN_UPLOADED_FRAME_DIMENSION
        && value <= MAX_UPLOADED_FRAME_LONG_EDGE,
    );
    requireField(
      `${prefix}.uploadedWidth`,
      (value) =>
        Number.isInteger(value)
        && value >= MIN_UPLOADED_FRAME_DIMENSION
        && value <= MAX_UPLOADED_FRAME_LONG_EDGE,
    );
    requireField(`${prefix}.captureHeuristics`, (value) => value && typeof value === "object" && !Array.isArray(value));
    requireField(
      `${prefix}.captureHeuristics.captureLatencyMs`,
      (value) =>
        typeof value === "number"
        && Number.isFinite(value)
        && value >= 0
        && value <= MAX_CAPTURE_LATENCY_MS,
    );
    requireField(
      `${prefix}.captureHeuristics.imageSource`,
      (value) => ["uri", "base64"].includes(value),
    );
    requireField(
      `${prefix}.captureHeuristics.frameAgeMs`,
      (value) =>
        typeof value === "number"
        && Number.isFinite(value)
        && value >= 0
        && value <= MAX_FRAME_AGE_MS,
    );
    requireField(`${prefix}.captureHeuristics.resizedForUpload`, (value) => typeof value === "boolean");
    requireField(
      `${prefix}.captureHeuristics.uploadedHeight`,
      (value) =>
        Number.isInteger(value)
        && value >= MIN_UPLOADED_FRAME_DIMENSION
        && value <= MAX_UPLOADED_FRAME_LONG_EDGE,
    );
    requireField(
      `${prefix}.captureHeuristics.uploadedWidth`,
      (value) =>
        Number.isInteger(value)
        && value >= MIN_UPLOADED_FRAME_DIMENSION
        && value <= MAX_UPLOADED_FRAME_LONG_EDGE,
    );

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
  const stepEventIds = new Map();

  for (const [sequenceName, expectedExecutionPath] of [
    ["nativeCore", "native-core"],
    ["jsFallback", "js-fallback"],
  ]) {
    const sequencePrefix = `commandSequences.${sequenceName}`;
    requireField(`${sequencePrefix}.executionId`, isUuidLike);
    requireField(`${sequencePrefix}.executionPath`, (value) => value === expectedExecutionPath);
    requireField(`${sequencePrefix}.startedAt`, isRfc3339Timestamp);
    requireField(`${sequencePrefix}.completedAt`, isRfc3339Timestamp);
    requireField(`${sequencePrefix}.analyzeRequestId`, isUuidLike);
    const expectedAnalyzeRequestId = getPathValue(artifact, `cameraPaths.${sequenceName}.requestId`);
    const actualAnalyzeRequestId = getPathValue(artifact, `${sequencePrefix}.analyzeRequestId`);
    if (
      isNonEmptyString(expectedAnalyzeRequestId)
      && isNonEmptyString(actualAnalyzeRequestId)
      && actualAnalyzeRequestId !== expectedAnalyzeRequestId
    ) {
      invalid.push(`${sequencePrefix}.analyzeRequestId.matches-camera-path`);
    }

    const startedAtMs = parseRfc3339Timestamp(
      getPathValue(artifact, `${sequencePrefix}.startedAt`),
    );
    const completedAtMs = parseRfc3339Timestamp(
      getPathValue(artifact, `${sequencePrefix}.completedAt`),
    );
    if (
      Number.isFinite(startedAtMs)
      && Number.isFinite(completedAtMs)
      && (
        completedAtMs <= startedAtMs
        || completedAtMs - startedAtMs > MAX_COMMAND_EXECUTION_MS
      )
    ) {
      invalid.push(`${sequencePrefix}.time-window`);
    }
    if (
      Number.isFinite(completedAtMs)
      && Number.isFinite(generatedAtMs)
      && (
        completedAtMs > generatedAtMs
        || generatedAtMs - completedAtMs > MAX_EVIDENCE_EXPORT_DELAY_MS
      )
    ) {
      invalid.push(`${sequencePrefix}.completedAt.export-window`);
    }
    const candidateGeneratedAtMs = parseRfc3339Timestamp(
      options.expectedCandidateGeneratedAt,
    );
    if (
      Number.isFinite(startedAtMs)
      && Number.isFinite(candidateGeneratedAtMs)
      && startedAtMs < candidateGeneratedAtMs - NO_SCREEN_EVIDENCE_CLOCK_SKEW_MS
    ) {
      invalid.push(`${sequencePrefix}.startedAt.before-candidate`);
    }

    const sequence = getPathValue(artifact, `${sequencePrefix}.steps`);
    if (!Array.isArray(sequence)) {
      missing.push(`${sequencePrefix}.steps`);
      continue;
    }

    for (const [stepIndex, expectedCommandId] of REQUIRED_NO_SCREEN_SEQUENCE.entries()) {
      const contractResult = validateCommandStepContract(
        sequence[stepIndex],
        expectedCommandId,
        `${sequencePrefix}.steps[${stepIndex}]`,
      );
      invalid.push(...contractResult.invalid);
      missing.push(...contractResult.missing);
    }

    const sequenceOrder = sequence.map((step) => step?.id);
    if (
      sequenceOrder.length !== REQUIRED_NO_SCREEN_SEQUENCE.length ||
      sequenceOrder.some((stepId, index) => stepId !== REQUIRED_NO_SCREEN_SEQUENCE[index])
    ) {
      invalid.push(`${sequencePrefix}.order`);
    }

    const stepsById = new Map(sequence.map((step) => [step?.id, step]));
    let previousStepObservedAtMs = Number.NEGATIVE_INFINITY;
    for (const stepId of REQUIRED_NO_SCREEN_SEQUENCE) {
      const step = stepsById.get(stepId);
      if (!step) {
        missing.push(`${sequencePrefix}.${stepId}`);
        continue;
      }
      if (step.pass !== true) {
        invalid.push(`${sequencePrefix}.${stepId}.pass`);
      }
      if (step.noScreenRequired !== true) {
        invalid.push(`${sequencePrefix}.${stepId}.noScreenRequired`);
      }
      if (step.spokenFeedbackConfirmed !== true) {
        invalid.push(`${sequencePrefix}.${stepId}.spokenFeedbackConfirmed`);
      }
      if (stepId !== "cold-prompt" && step.voiceRecognized !== true) {
        invalid.push(`${sequencePrefix}.${stepId}.voiceRecognized`);
      }
      if (!isUuidLike(step.eventId)) {
        invalid.push(`${sequencePrefix}.${stepId}.eventId`);
      } else {
        const previousEvent = stepEventIds.get(step.eventId);
        if (previousEvent) {
          invalid.push(
            `${sequencePrefix}.${stepId}.eventId.reused-from:${previousEvent}`,
          );
        } else {
          stepEventIds.set(step.eventId, `${sequenceName}.${stepId}`);
        }
      }
      const stepObservedAtMs = parseRfc3339Timestamp(step.observedAt);
      if (!Number.isFinite(stepObservedAtMs)) {
        invalid.push(`${sequencePrefix}.${stepId}.observedAt`);
      } else {
        if (
          stepObservedAtMs < startedAtMs
          || stepObservedAtMs > completedAtMs
        ) {
          invalid.push(`${sequencePrefix}.${stepId}.observedAt.execution-window`);
        }
        if (stepObservedAtMs <= previousStepObservedAtMs) {
          invalid.push(`${sequencePrefix}.${stepId}.observedAt.order`);
        }
        previousStepObservedAtMs = stepObservedAtMs;
      }
    }

    for (const [stepId, flags] of Object.entries(expectedStepFlags)) {
      const step = stepsById.get(stepId);
      if (!step) {
        continue;
      }
      for (const flag of flags) {
        if (step[flag] !== true) {
          invalid.push(`${sequencePrefix}.${stepId}.${flag}`);
        }
      }
    }

    const sceneStep = stepsById.get("what-do-you-see");
    if (sceneStep && sceneStep.settingsChanged !== false) {
      invalid.push(`${sequencePrefix}.what-do-you-see.settingsChanged`);
    }
    const helpStep = stepsById.get("help");
    if (helpStep && helpStep.settingsChanged !== false) {
      invalid.push(`${sequencePrefix}.help.settingsChanged`);
    }

    const stopPrefix = `${sequencePrefix}.stopBargeIn`;
    requireField(`${stopPrefix}.eventId`, isUuidLike);
    requireField(`${stopPrefix}.observedAt`, isRfc3339Timestamp);
    requireField(`${stopPrefix}.feedbackObservedAt`, isRfc3339Timestamp);
    requireField(`${stopPrefix}.postStopObservedAt`, isRfc3339Timestamp);
    requireField(`${stopPrefix}.attemptedDuringSpeech`, isBooleanTrue);
    requireField(`${stopPrefix}.analysisInactiveAfterStop`, isBooleanTrue);
    requireField(`${stopPrefix}.armedDuringSpeech`, isBooleanTrue);
    requireField(`${stopPrefix}.audioCueAttempted`, isBooleanTrue);
    requireField(`${stopPrefix}.audioCueOutcome`, (value) => value === "success");
    requireField(`${stopPrefix}.cameraInactiveAfterStop`, isBooleanTrue);
    requireField(`${stopPrefix}.cutThrough`, isBooleanTrue);
    requireField(`${stopPrefix}.hapticAttempted`, isBooleanTrue);
    requireField(`${stopPrefix}.hapticOutcome`, (value) => value === "success");
    requireField(
      `${stopPrefix}.lastSpeechListeningOverlapReason`,
      (value) => value === "stop-barge-in",
    );
    requireField(`${stopPrefix}.listeningStoppedAfterStop`, isBooleanTrue);
    requireField(
      `${stopPrefix}.recognizedCommand`,
      (value) => value === "stop-guidance-partial",
    );
    requireField(`${stopPrefix}.recognizedDuringSpeech`, isBooleanTrue);
    requireField(`${stopPrefix}.recognizedPhase`, (value) => value === "partial");
    requireField(
      `${stopPrefix}.unexpectedSpeechListeningOverlapCount`,
      (value) => value === 0,
    );
    requireField(
      `${stopPrefix}.speechListeningInvariant`,
      (value) => value === "PASS",
    );
    requireField(`${stopPrefix}.staleSpeechAfterStop`, isBooleanFalse);
    requireField(`${stopPrefix}.guidancePaused`, isBooleanTrue);

    const stopStep = stepsById.get("stop-guidance");
    const stopEvidence = getPathValue(artifact, stopPrefix);
    if (
      isNonEmptyString(stopStep?.eventId)
      && isNonEmptyString(stopEvidence?.eventId)
      && stopStep.eventId !== stopEvidence.eventId
    ) {
      invalid.push(`${stopPrefix}.eventId.matches-stop-step`);
    }
    if (
      isNonEmptyString(stopStep?.observedAt)
      && isNonEmptyString(stopEvidence?.observedAt)
      && stopStep.observedAt !== stopEvidence.observedAt
    ) {
      invalid.push(`${stopPrefix}.observedAt.matches-stop-step`);
    }
    const stopObservedAtMs = parseRfc3339Timestamp(stopEvidence?.observedAt);
    const feedbackObservedAtMs = parseRfc3339Timestamp(
      stopEvidence?.feedbackObservedAt,
    );
    const postStopObservedAtMs = parseRfc3339Timestamp(
      stopEvidence?.postStopObservedAt,
    );
    for (const [fieldName, observedAtMs] of [
      ["feedbackObservedAt", feedbackObservedAtMs],
      ["postStopObservedAt", postStopObservedAtMs],
    ]) {
      if (
        Number.isFinite(stopObservedAtMs)
        && Number.isFinite(observedAtMs)
        && (
          observedAtMs < stopObservedAtMs
          || observedAtMs > completedAtMs
        )
      ) {
        invalid.push(`${stopPrefix}.${fieldName}.stop-window`);
      }
    }
    if (
      Number.isFinite(stopObservedAtMs)
      && Number.isFinite(feedbackObservedAtMs)
      && feedbackObservedAtMs - stopObservedAtMs > MAX_STOP_FEEDBACK_LATENCY_MS
    ) {
      invalid.push(`${stopPrefix}.feedbackObservedAt.max-latency`);
    }
    if (
      Number.isFinite(stopObservedAtMs)
      && Number.isFinite(postStopObservedAtMs)
      && postStopObservedAtMs - stopObservedAtMs > MAX_STOP_SHUTDOWN_LATENCY_MS
    ) {
      invalid.push(`${stopPrefix}.postStopObservedAt.max-latency`);
    }
  }

  if (installationSource === "testflight") {
    const uploadedAtMs = parseRfc3339Timestamp(
      getPathValue(artifact, "installationEvidence.uploadedAt"),
    );
    const { startedAtMs } = getExecutionWindow(artifact);
    if (
      Number.isFinite(uploadedAtMs)
      && Number.isFinite(startedAtMs)
      && uploadedAtMs >= startedAtMs
    ) {
      invalid.push(
        "installationEvidence.uploadedAt.not-before-execution-start",
      );
    }
  }

  const nativeExecution = artifact.commandSequences?.nativeCore;
  const fallbackExecution = artifact.commandSequences?.jsFallback;
  if (
    isNonEmptyString(nativeExecution?.executionId)
    && nativeExecution.executionId === fallbackExecution?.executionId
  ) {
    invalid.push("commandSequences.executionId.reused");
  }
  if (
    isNonEmptyString(nativeExecution?.analyzeRequestId)
    && nativeExecution.analyzeRequestId === fallbackExecution?.analyzeRequestId
  ) {
    invalid.push("commandSequences.analyzeRequestId.reused");
  }
  if (
    isNonEmptyString(artifact.cameraPaths?.nativeCore?.requestId)
    && artifact.cameraPaths.nativeCore.requestId === artifact.cameraPaths?.jsFallback?.requestId
  ) {
    invalid.push("cameraPaths.requestId.reused");
  }
  if (
    isNonEmptyString(nativeExecution?.analyzeRequestId)
    && isNonEmptyString(artifact.cameraPaths?.nativeCore?.requestId)
    && nativeExecution.analyzeRequestId !== artifact.cameraPaths.nativeCore.requestId
  ) {
    invalid.push("cameraPaths.nativeCore.requestId.command-sequence-mismatch");
  }
  if (
    isNonEmptyString(fallbackExecution?.analyzeRequestId)
    && isNonEmptyString(artifact.cameraPaths?.jsFallback?.requestId)
    && fallbackExecution.analyzeRequestId !== artifact.cameraPaths.jsFallback.requestId
  ) {
    invalid.push("cameraPaths.jsFallback.requestId.command-sequence-mismatch");
  }
  const nativeCompletedAtMs = parseRfc3339Timestamp(
    nativeExecution?.completedAt,
  );
  const fallbackStartedAtMs = parseRfc3339Timestamp(
    fallbackExecution?.startedAt,
  );
  if (
    Number.isFinite(nativeCompletedAtMs)
    && Number.isFinite(fallbackStartedAtMs)
    && fallbackStartedAtMs < nativeCompletedAtMs
  ) {
    invalid.push("commandSequences.execution-order");
  }

  const disallowedKeys = findDisallowedKeys(artifact);
  const sensitivePatterns = findSensitivePatterns(artifact);
  const unexpectedFields = findUnexpectedFields(
    artifact,
    NO_SCREEN_SMOKE_EVIDENCE_SHAPE,
  );
  for (const fieldPath of unexpectedFields) {
    invalid.push(`unexpectedField:${fieldPath}`);
  }
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

export function validateNoScreenEvidenceProgression(artifacts, options = {}) {
  const errors = [];
  const results = {};
  const specs = [
    {
      expectedInstallationSource: "ad-hoc",
      expectedParticipantRole: "internal-tester",
      key: "internal",
    },
    {
      expectedInstallationSource: "ad-hoc",
      expectedParticipantRole: "blind-participant",
      key: "blindParticipant",
    },
    ...(options.requireTestflightRepeat
      ? [{
          expectedInstallationSource: "testflight",
          expectedParticipantRole: "blind-participant",
          key: "testflight",
        }]
      : []),
  ];

  for (const spec of specs) {
    const artifact = artifacts?.[spec.key];
    if (!artifact) {
      errors.push(`${spec.key}:missing`);
      continue;
    }
    const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
      ...options,
      expectedInstallationSource: spec.expectedInstallationSource,
      expectedParticipantRole: spec.expectedParticipantRole,
    });
    results[spec.key] = result;
    if (!result.valid) {
      for (const missing of result.missing) {
        errors.push(`${spec.key}.missing:${missing}`);
      }
      for (const invalid of result.invalid) {
        errors.push(`${spec.key}.invalid:${invalid}`);
      }
    }
  }

  const requiredArtifacts = specs
    .map((spec) => [spec.key, artifacts?.[spec.key]])
    .filter(([, artifact]) => artifact);
  const runIds = new Map();
  const executionIds = new Map();
  const analyzeRequestIds = new Map();
  const stepEventIds = new Map();
  for (const [key, artifact] of requiredArtifacts) {
    const runId = artifact.provenance?.runId;
    if (!isNonEmptyString(runId)) {
      continue;
    }
    const previousKey = runIds.get(runId);
    if (previousKey) {
      errors.push(`${key}.runId.reused-from:${previousKey}`);
    } else {
      runIds.set(runId, key);
    }
    for (const sequenceName of ["nativeCore", "jsFallback"]) {
      const executionId = artifact.commandSequences?.[sequenceName]?.executionId;
      if (isNonEmptyString(executionId)) {
        const previousKey = executionIds.get(executionId);
        if (previousKey) {
          errors.push(`${key}.${sequenceName}.executionId.reused-from:${previousKey}`);
        } else {
          executionIds.set(executionId, `${key}.${sequenceName}`);
        }
      }
      const analyzeRequestId = artifact.commandSequences?.[sequenceName]?.analyzeRequestId;
      if (isNonEmptyString(analyzeRequestId)) {
        const previousKey = analyzeRequestIds.get(analyzeRequestId);
        if (previousKey) {
          errors.push(`${key}.${sequenceName}.analyzeRequestId.reused-from:${previousKey}`);
        } else {
          analyzeRequestIds.set(analyzeRequestId, `${key}.${sequenceName}`);
        }
      }
      for (const step of artifact.commandSequences?.[sequenceName]?.steps || []) {
        if (!isNonEmptyString(step?.eventId)) {
          continue;
        }
        const previousKey = stepEventIds.get(step.eventId);
        if (previousKey) {
          errors.push(
            `${key}.${sequenceName}.${step.id || "unknown"}.eventId.reused-from:${previousKey}`,
          );
        } else {
          stepEventIds.set(
            step.eventId,
            `${key}.${sequenceName}.${step.id || "unknown"}`,
          );
        }
      }
    }
  }

  const internalArtifact = artifacts?.internal;
  const blindArtifact = artifacts?.blindParticipant;
  if (
    isNonEmptyString(internalArtifact?.operator)
    && internalArtifact.operator === blindArtifact?.operator
  ) {
    errors.push("blindParticipant.operator.matches-internal");
  }
  if (
    isNonEmptyString(internalArtifact?.participantLabel)
    && internalArtifact.participantLabel === blindArtifact?.participantLabel
  ) {
    errors.push("blindParticipant.participantLabel.matches-internal");
  }

  const testflightArtifact = artifacts?.testflight;
  if (options.requireTestflightRepeat && testflightArtifact) {
    const testflightGeneratedAtMs = parseRfc3339Timestamp(
      getPathValue(testflightArtifact, "generatedAt"),
    );
    const testflightWindow = getExecutionWindow(testflightArtifact);
    const uploadedAtMs = parseRfc3339Timestamp(
      getPathValue(testflightArtifact, "installationEvidence.uploadedAt"),
    );
    for (const [key, artifact] of [
      ["internal", internalArtifact],
      ["blindParticipant", blindArtifact],
    ]) {
      const preUploadGeneratedAtMs = parseRfc3339Timestamp(
        getPathValue(artifact, "generatedAt"),
      );
      const preUploadWindow = getExecutionWindow(artifact);
      if (
        Number.isFinite(testflightGeneratedAtMs)
        && Number.isFinite(preUploadGeneratedAtMs)
        && testflightGeneratedAtMs <= preUploadGeneratedAtMs
      ) {
        errors.push(`testflight.generatedAt.not-after-${key}`);
      }
      if (
        Number.isFinite(testflightWindow.startedAtMs)
        && Number.isFinite(preUploadWindow.completedAtMs)
        && testflightWindow.startedAtMs <= preUploadWindow.completedAtMs
      ) {
        errors.push(`testflight.execution.not-after-${key}`);
      }
      if (
        Number.isFinite(uploadedAtMs)
        && Number.isFinite(preUploadWindow.completedAtMs)
        && uploadedAtMs <= preUploadWindow.completedAtMs
      ) {
        errors.push(`testflight.uploadedAt.not-after-${key}`);
      }
    }
  }

  return {
    errors,
    results,
    valid: errors.length === 0,
  };
}

export function formatNoScreenSmokeEvidenceIssues(result) {
  return `Missing: ${result.missing.join(", ") || "none"}. Invalid: ${result.invalid.join(", ") || "none"}.`;
}
