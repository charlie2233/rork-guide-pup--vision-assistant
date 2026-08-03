import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS,
  REQUIRED_NO_SCREEN_SEQUENCE,
  validateNoScreenEvidenceProgression,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const TEST_NOW_MS = Date.parse("2026-05-23T18:00:00.000Z");
const SOURCE_REVISION = "a".repeat(40);
const CANDIDATE_BINARY_SHA256 = "c".repeat(64);
const CANDIDATE_IPA_SHA256 = "d".repeat(64);
const VALIDATION_IPA_SHA256 = "f".repeat(64);
const CANDIDATE_IDENTIFIER = "e".repeat(64);
const COMMON_STEP_BOOLEAN_FIELDS = [
  "noScreenRequired",
  "pass",
  "spokenFeedbackConfirmed",
  "voiceRecognized",
];
const OUTCOME_BOOLEAN_FIELDS_BY_COMMAND = {
  "cold-prompt": [],
  "start-guidance": ["cameraSessionActive"],
  status: ["statusIncludesSettings"],
  help: ["helpIncludesBoundedCommandList", "settingsChanged"],
  "slower-speech": ["settingPersisted"],
  "faster-speech": ["settingPersisted"],
  "more-detail": ["settingPersisted"],
  "less-detail": ["settingPersisted"],
  "haptics-off": ["hapticBehaviorConfirmed"],
  "haptics-on": ["hapticBehaviorConfirmed"],
  repeat: ["repeatedLastUtterance"],
  "what-do-you-see": ["conversationLane", "sampledFrameUsed", "settingsChanged"],
  "stop-guidance": ["stopCutThrough"],
};
const ALL_OUTCOME_BOOLEAN_FIELDS = [
  ...new Set(Object.values(OUTCOME_BOOLEAN_FIELDS_BY_COMMAND).flat()),
];
const EXPECTED_BACKEND_SMOKE_ARTIFACT = {
  artifactVersion: 2,
  bootstrap: {
    requestId: "22222222-2222-4222-8222-222222222222",
  },
  generatedAt: "2026-05-23T16:55:00.000Z",
  health: {
    requestId: "11111111-1111-4111-8111-111111111111",
  },
  lanes: {
    guidance: {
      analyze: {
        requestId: "33333333-3333-4333-8333-333333333333",
      },
    },
    "scene-query": {
      analyze: {
        requestId: "66666666-6666-4666-8666-666666666666",
      },
    },
  },
  provenance: {
    sourceRevision: SOURCE_REVISION,
    workerDeploymentId: "77777777-7777-4777-8777-777777777777",
    workerVersionCreatedAt: "2026-05-23T16:50:00.000Z",
    workerVersionId: "88888888-8888-4888-8888-888888888888",
  },
};

function candidateOptions(overrides = {}) {
  return {
    expectedApiBaseUrl: "https://guidepup-api-production.example.test",
    expectedApiEnvironment: "production",
    expectedAppVersion: "1.0.0",
    expectedBackendSmokeArtifact: EXPECTED_BACKEND_SMOKE_ARTIFACT,
    expectedBuildNumber: "4",
    expectedBuildProfile: "testflight",
    expectedBundleIdentifier: "com.example.guidepup",
    expectedCandidateBinarySha256: CANDIDATE_BINARY_SHA256,
    expectedCandidateIdentifier: CANDIDATE_IDENTIFIER,
    expectedCandidateIpaSha256: CANDIDATE_IPA_SHA256,
    expectedPromptVersion: "2026-05-22.v1",
    expectedReleaseTrack: "testflight",
    expectedSourceRevision: SOURCE_REVISION,
    expectedVisionModel: "gpt-5.5",
    expectedValidationIpaSha256: VALIDATION_IPA_SHA256,
    nowMs: TEST_NOW_MS,
    requireCandidateBinding: true,
    ...overrides,
  };
}

function validateCandidate(artifact, overrides = {}) {
  return validateNoScreenSmokeEvidenceArtifact(artifact, candidateOptions(overrides));
}

function buildValidArtifact(overrides = {}) {
  const buildSequence = (sequenceSeed, startedAt) => {
    const startedAtMs = Date.parse(startedAt);
    const sequence = REQUIRED_NO_SCREEN_SEQUENCE.map((id, index) => ({
      eventId:
        `${sequenceSeed.repeat(8)}-${sequenceSeed.repeat(4)}-4${sequenceSeed.repeat(3)}-8${sequenceSeed.repeat(3)}-${(index + 1).toString(16).padStart(12, "0")}`,
      id,
      noScreenRequired: true,
      observedAt: new Date(startedAtMs + ((index + 1) * 4_000)).toISOString(),
      pass: true,
      spokenFeedbackConfirmed: true,
      voiceRecognized: id !== "cold-prompt",
    }));

    const byId = new Map(sequence.map((step) => [step.id, step]));
    Object.assign(byId.get("start-guidance"), { cameraSessionActive: true });
    Object.assign(byId.get("status"), { statusIncludesSettings: true });
    Object.assign(byId.get("help"), {
      helpIncludesBoundedCommandList: true,
      settingsChanged: false,
    });
    for (const id of ["slower-speech", "faster-speech", "more-detail", "less-detail"]) {
      Object.assign(byId.get(id), { settingPersisted: true });
    }
    Object.assign(byId.get("haptics-off"), { hapticBehaviorConfirmed: true });
    Object.assign(byId.get("haptics-on"), { hapticBehaviorConfirmed: true });
    Object.assign(byId.get("repeat"), { repeatedLastUtterance: true });
    Object.assign(byId.get("what-do-you-see"), {
      conversationLane: true,
      sampledFrameUsed: true,
      settingsChanged: false,
    });
    Object.assign(byId.get("stop-guidance"), { stopCutThrough: true });
    return sequence;
  };
  const buildStopBargeIn = (sequence) => {
    const stopStep = sequence.find((step) => step.id === "stop-guidance");
    const observedAtMs = Date.parse(stopStep.observedAt);
    return {
      analysisInactiveAfterStop: true,
      armedDuringSpeech: true,
      attemptedDuringSpeech: true,
      audioCueAttempted: true,
      audioCueOutcome: "success",
      cameraInactiveAfterStop: true,
      cutThrough: true,
      eventId: stopStep.eventId,
      feedbackObservedAt: new Date(observedAtMs + 500).toISOString(),
      guidancePaused: true,
      hapticAttempted: true,
      hapticOutcome: "success",
      lastSpeechListeningOverlapReason: "stop-barge-in",
      listeningStoppedAfterStop: true,
      observedAt: stopStep.observedAt,
      postStopObservedAt: new Date(observedAtMs + 1_000).toISOString(),
      recognizedCommand: "stop-guidance-partial",
      recognizedDuringSpeech: true,
      recognizedPhase: "partial",
      speechListeningInvariant: "PASS",
      staleSpeechAfterStop: false,
      unexpectedSpeechListeningOverlapCount: 0,
    };
  };
  const nativeSequence = buildSequence("1", "2026-05-23T16:57:00.000Z");
  const fallbackSequence = buildSequence("2", "2026-05-23T16:58:30.000Z");

  return {
    appStoreConnectBuildRecordIdentifier: "",
    artifactVersion: 3,
    assistiveTech: {
      audioCuesAudible: true,
      hapticsFelt: true,
      speechInputConfirmed: true,
      spokenOutputConfirmed: true,
      voiceProcessingEnabled: true,
      voiceOverRunning: true,
    },
    backendSmoke: {
      apiBaseUrl: "https://guidepup-api-production.example.test",
      analyzeStatusCode: 200,
      artifactVersion: EXPECTED_BACKEND_SMOKE_ARTIFACT.artifactVersion,
      bootstrapStatusCode: 200,
      environment: "production",
      executionPath: "provider-backed",
      generatedAt: EXPECTED_BACKEND_SMOKE_ARTIFACT.generatedAt,
      healthStatusCode: 200,
      model: "gpt-5.5-2026-05-22",
      promptVersion: "2026-05-22.v1",
      provenance: { ...EXPECTED_BACKEND_SMOKE_ARTIFACT.provenance },
      providerBacked: true,
      walkability: "clear",
      requestIds: {
        analyze: "33333333-3333-4333-8333-333333333333",
        bootstrap: "22222222-2222-4222-8222-222222222222",
        guidanceAnalyze: "33333333-3333-4333-8333-333333333333",
        health: "11111111-1111-4111-8111-111111111111",
        sceneQueryAnalyze: "66666666-6666-4666-8666-666666666666",
      },
      structuredOutputValid: true,
    },
    cameraPaths: {
      jsFallback: {
        captureHeuristics: {
          captureLatencyMs: 600,
          frameAgeMs: 0,
          imageSource: "base64",
          resizedForUpload: false,
          uploadedHeight: 40,
          uploadedWidth: 40,
        },
        frameSummary: "Sanitized js fallback sampled frame summary.",
        hasImage: true,
        nativePath: "js-fallback",
        outcome: "success",
        requestId: "55555555-5555-4555-8555-555555555555",
        sampledFrame: true,
        sourceHeight: 40,
        sourceWidth: 40,
        uploadedHeight: 40,
        uploadedWidth: 40,
      },
      nativeCore: {
        captureHeuristics: {
          captureLatencyMs: 500,
          frameAgeMs: 0,
          imageSource: "base64",
          resizedForUpload: true,
          uploadedHeight: 480,
          uploadedWidth: 640,
        },
        frameSummary: "Sanitized native-core sampled frame summary.",
        hasImage: true,
        nativePath: "native-core",
        outcome: "success",
        requestId: "44444444-4444-4444-8444-444444444444",
        sampledFrame: true,
        sourceHeight: 1080,
        sourceWidth: 1920,
        uploadedHeight: 480,
        uploadedWidth: 640,
      },
    },
    commandSequences: {
      jsFallback: {
        analyzeRequestId: "55555555-5555-4555-8555-555555555555",
        completedAt: "2026-05-23T16:59:30.000Z",
        executionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        executionPath: "js-fallback",
        startedAt: "2026-05-23T16:58:30.000Z",
        steps: fallbackSequence,
        stopBargeIn: buildStopBargeIn(fallbackSequence),
      },
      nativeCore: {
        analyzeRequestId: "44444444-4444-4444-8444-444444444444",
        completedAt: "2026-05-23T16:58:00.000Z",
        executionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        executionPath: "native-core",
        startedAt: "2026-05-23T16:57:00.000Z",
        steps: nativeSequence,
        stopBargeIn: buildStopBargeIn(nativeSequence),
      },
    },
    device: {
      appVersion: "1.0.0",
      buildNumber: "4",
      buildProfile: "testflight",
      bundleIdentifier: "com.example.guidepup",
      identifierSuffix: "0B5CE6D3",
      model: "iPhone 15 Pro",
      osVersion: "26.4.2",
    },
    deviceReadiness: {
      coreDeviceExecutionReady: true,
      coreDeviceProbe: {
        checkedAt: "2026-05-23T16:56:30.000Z",
        exitStatus: 0,
        outcome: "success",
        type: "devicectl-process-info",
      },
      ddiServicesAvailable: false,
      developerModeEnabled: true,
      paired: true,
      result: "ready",
      trusted: true,
      tunnelConnected: false,
      usbOrSameLan: false,
      xcodeDestinationAvailable: true,
      xctraceVisible: true,
    },
    diagnostics: {
      audioCues: {
        successCount: 3,
      },
      haptics: {
        successCount: 3,
      },
      jsFallbackCaptureConfirmed: true,
      nativeCameraCaptureConfirmed: true,
      noRawMediaOrSecrets: true,
      settingsPersistedAfterRestart: true,
      speechListeningInvariant: "PASS",
      stopBargeInConfirmed: true,
      unexpectedSpeechListeningOverlapCount: 0,
      voiceOverRunning: true,
    },
    generatedAt: "2026-05-23T17:00:00.000Z",
    humanAttestation: {
      attestedAt: "2026-05-23T17:00:00.000Z",
      blindParticipantSelfAttested: false,
      installationSourceConfirmed: true,
      nonvisualOperationConfirmed: true,
      participantRoleConfirmed: true,
      sensoryObservationsConfirmed: true,
    },
    installationEvidence: {
      appStoreAppIdMatched: false,
      appTransactionVerified: false,
      appIdentityMatched: false,
      bundleVersionMatched: false,
      distributionEnvironment: "none",
      installedValidationIpaSha256: VALIDATION_IPA_SHA256,
    },
    installationSource: "ad-hoc",
    interactionAssistance: "none",
    interruptionRecovery: {
      audioRoute: {
        attempted: true,
        boundedRecoveryConfirmed: true,
        conservativeStopConfirmed: true,
        explicitRestartConfirmed: true,
        explicitRestartRequired: true,
        guidanceInactiveAfterInterruption: true,
        noContinuedGuidance: true,
        recoveryLatencyMs: 900,
      },
      backgroundForeground: {
        attempted: true,
        boundedRecoveryConfirmed: true,
        conservativeStopConfirmed: true,
        explicitRestartConfirmed: true,
        explicitRestartRequired: true,
        guidanceInactiveAfterInterruption: true,
        noContinuedGuidance: true,
        recoveryLatencyMs: 1200,
      },
    },
    noScreen: {
      cleanInstallOrReset: true,
      nonvisualOperation: true,
      noScreenUsed: true,
      visualScreenInspectionUsed: false,
      voiceAndVoiceOverOnly: true,
    },
    operator: "operator-alpha",
    participantLabel: "internal-alpha",
    participantRole: "internal-tester",
    privacy: {
      containsFullDeviceIds: false,
      containsIdentityContactData: false,
      containsRawAudio: false,
      containsRawMedia: false,
      containsSecrets: false,
      containsSignedUrls: false,
    },
    provenance: {
      apiBaseUrlLabel: "production",
      apiEnvironment: "production",
      appVersion: "1.0.0",
      artifactType: "real-iphone-no-screen-smoke",
      buildNumber: "4",
      buildProfile: "testflight",
      bundleIdentifier: "com.example.guidepup",
      candidateBinarySha256: CANDIDATE_BINARY_SHA256,
      candidateIdentifier: CANDIDATE_IDENTIFIER,
      generatedAt: "2026-05-23T17:00:00.000Z",
      releaseTrack: "testflight",
      runId: "no-screen-smoke-2026-05-23T17-00-00Z",
      schemaVersion: 3,
      sourceRevision: SOURCE_REVISION,
    },
    visualScreenUse: "none",
    settingsPersistence: {
      afterRelaunch: {
        descriptionMode: "detailed",
        hapticsEnabled: false,
        speechRate: "slow",
      },
      afterRestore: {
        descriptionMode: "short",
        hapticsEnabled: true,
        speechRate: "normal",
      },
      afterVoiceChange: {
        descriptionMode: "detailed",
        hapticsEnabled: false,
        speechRate: "slow",
      },
      before: {
        descriptionMode: "short",
        hapticsEnabled: true,
        speechRate: "normal",
      },
      nonDefaultSettingSurvivedRelaunch: true,
      restoredDefaultsAfterValidation: true,
    },
    validationMode: "real-iphone-no-screen",
    visualPromptingUsed: false,
    voiceOver: {
      runningAtExport: true,
      runningAtStart: true,
      runningAtStop: true,
      runningDuringGuidance: true,
    },
    ...overrides,
  };
}

function buildProgressionArtifacts() {
  const buildRun = ({
    appStoreConnectBuildRecordIdentifier = "",
    generatedAt,
    idSeeds,
    installationSource,
    operator,
    participantLabel,
    participantRole,
    runId,
  }) => {
    const artifact = buildValidArtifact({
      appStoreConnectBuildRecordIdentifier,
      generatedAt,
      installationSource,
      operator,
      participantLabel,
      participantRole,
    });
    const generatedAtMs = Date.parse(generatedAt);
    const uuidFor = (seed) =>
      `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
    const retimeSequence = (sequence, startedAt, seed) => {
      const startedAtMs = Date.parse(startedAt);
      const steps = sequence.steps.map((step, index) => ({
        ...step,
        eventId:
          `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${(index + 1).toString(16).padStart(12, "0")}`,
        observedAt: new Date(startedAtMs + ((index + 1) * 4_000)).toISOString(),
      }));
      const stopStep = steps.find((step) => step.id === "stop-guidance");
      const stopObservedAtMs = Date.parse(stopStep.observedAt);
      return {
        ...sequence,
        startedAt,
        steps,
        stopBargeIn: {
          ...sequence.stopBargeIn,
          eventId: stopStep.eventId,
          feedbackObservedAt: new Date(stopObservedAtMs + 500).toISOString(),
          observedAt: stopStep.observedAt,
          postStopObservedAt: new Date(stopObservedAtMs + 1_000).toISOString(),
        },
      };
    };
    artifact.provenance.generatedAt = generatedAt;
    artifact.provenance.runId = runId;
    artifact.humanAttestation.attestedAt = generatedAt;
    artifact.humanAttestation.blindParticipantSelfAttested =
      participantRole === "blind-participant";
    artifact.installationEvidence = installationSource === "testflight"
      ? {
          appStoreAppIdMatched: true,
          appTransactionVerified: true,
          appIdentityMatched: true,
          bundleVersionMatched: true,
          distributionEnvironment: "apple-sandbox",
          storeKitEvidencePurpose: "apple-signed-app-identity-only",
          uploadedAt: new Date(generatedAtMs - 300_000).toISOString(),
          uploadedIpaSha256: CANDIDATE_IPA_SHA256,
        }
      : {
          appStoreAppIdMatched: false,
          appTransactionVerified: false,
          appIdentityMatched: false,
          bundleVersionMatched: false,
          distributionEnvironment: "none",
          installedValidationIpaSha256: VALIDATION_IPA_SHA256,
        };
    artifact.cameraPaths.nativeCore.requestId = uuidFor(idSeeds[0]);
    artifact.cameraPaths.jsFallback.requestId = uuidFor(idSeeds[1]);
    artifact.commandSequences.nativeCore = retimeSequence({
      ...artifact.commandSequences.nativeCore,
      analyzeRequestId: artifact.cameraPaths.nativeCore.requestId,
      completedAt: new Date(generatedAtMs - 120_000).toISOString(),
      executionId: uuidFor(idSeeds[2]),
    }, new Date(generatedAtMs - 180_000).toISOString(), idSeeds[2]);
    artifact.commandSequences.jsFallback = retimeSequence({
      ...artifact.commandSequences.jsFallback,
      analyzeRequestId: artifact.cameraPaths.jsFallback.requestId,
      completedAt: new Date(generatedAtMs - 30_000).toISOString(),
      executionId: uuidFor(idSeeds[3]),
    }, new Date(generatedAtMs - 90_000).toISOString(), idSeeds[3]);
    artifact.deviceReadiness.coreDeviceProbe.checkedAt =
      new Date(generatedAtMs - 210_000).toISOString();
    return artifact;
  };

  return {
    blindParticipant: buildRun({
      generatedAt: "2026-05-23T17:10:00.000Z",
      idSeeds: ["1", "2", "3", "4"],
      installationSource: "ad-hoc",
      operator: "operator-bravo",
      participantLabel: "blind-beta",
      participantRole: "blind-participant",
      runId: "no-screen-blind-2026-05-23T17-10-00Z",
    }),
    internal: buildRun({
      generatedAt: "2026-05-23T17:00:00.000Z",
      idSeeds: ["5", "6", "7", "8"],
      installationSource: "ad-hoc",
      operator: "operator-alpha",
      participantLabel: "internal-alpha",
      participantRole: "internal-tester",
      runId: "no-screen-internal-2026-05-23T17-00-00Z",
    }),
    testflight: buildRun({
      appStoreConnectBuildRecordIdentifier: "asc-build-4",
      generatedAt: "2026-05-23T17:20:00.000Z",
      idSeeds: ["9", "a", "b", "c"],
      installationSource: "testflight",
      operator: "operator-charlie",
      participantLabel: "blind-gamma",
      participantRole: "blind-participant",
      runId: "no-screen-testflight-2026-05-23T17-20-00Z",
    }),
  };
}

test("valid no-screen smoke evidence without step notes passes the launch schema", () => {
  const result = validateCandidate(buildValidArtifact());

  assert.deepEqual(result, { invalid: [], missing: [], valid: true });
});

test("no-screen smoke evidence rejects free-form command-step notes as unexpected fields", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.steps[0].notes =
    "A quiet hallway with a chair beside the wall.";
  artifact.commandSequences.jsFallback.steps[1].notes =
    "The entrance is near Main Street and Pine Avenue.";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /unexpectedField:commandSequences\.nativeCore\.steps\[0\]\.notes/,
  );
  assert.match(
    result.invalid.join(","),
    /unexpectedField:commandSequences\.jsFallback\.steps\[1\]\.notes/,
  );
});

test("no-screen smoke evidence rejects the reviewer command-field PoCs verbatim", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.steps[0].cameraSessionActive =
    "A quiet hallway with a chair.";
  artifact.commandSequences.jsFallback.steps[2].settingPersisted =
    "Benign diagnostic prose.";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.ok(
    result.invalid.includes(
      "unexpectedField:commandSequences.nativeCore.steps[0].cameraSessionActive",
    ),
  );
  assert.ok(
    result.invalid.includes(
      "unexpectedField:commandSequences.jsFallback.steps[2].settingPersisted",
    ),
  );
});

test("every command rejects every globally known inapplicable outcome field on both camera paths", () => {
  for (const sequenceName of ["nativeCore", "jsFallback"]) {
    for (const [stepIndex, commandId] of REQUIRED_NO_SCREEN_SEQUENCE.entries()) {
      const allowedOutcomeFields = new Set(
        OUTCOME_BOOLEAN_FIELDS_BY_COMMAND[commandId],
      );
      for (const fieldName of ALL_OUTCOME_BOOLEAN_FIELDS) {
        if (allowedOutcomeFields.has(fieldName)) {
          continue;
        }

        const artifact = buildValidArtifact();
        artifact.commandSequences[sequenceName].steps[stepIndex][fieldName] = true;
        const result = validateCandidate(artifact);
        const expectedFinding =
          `unexpectedField:commandSequences.${sequenceName}.steps[${stepIndex}].${fieldName}`;

        assert.equal(
          result.valid,
          false,
          `${sequenceName} ${commandId} unexpectedly accepted ${fieldName}`,
        );
        assert.ok(
          result.invalid.includes(expectedFinding),
          `${sequenceName} ${commandId} did not report ${expectedFinding}`,
        );
      }
    }
  }
});

test("every allowed command-step field rejects representative wrong types on both camera paths", () => {
  const wrongValueFactories = [
    ["string", () => "Benign diagnostic prose."],
    ["number", () => 1],
    ["object", () => ({ benign: true })],
    ["array", () => [true]],
    ["null", () => null],
  ];

  for (const sequenceName of ["nativeCore", "jsFallback"]) {
    for (const [stepIndex, commandId] of REQUIRED_NO_SCREEN_SEQUENCE.entries()) {
      const booleanFields = [
        ...COMMON_STEP_BOOLEAN_FIELDS,
        ...OUTCOME_BOOLEAN_FIELDS_BY_COMMAND[commandId],
      ];
      const fieldCases = [
        ["id", (stepPath) => `${stepPath}.id`],
        ["eventId", (stepPath) => `${stepPath}.eventId`],
        ["observedAt", (stepPath) => `${stepPath}.observedAt`],
        ...booleanFields.map((fieldName) => [
          fieldName,
          (stepPath) => `${stepPath}.${fieldName}.type`,
        ]),
      ];

      for (const [fieldName, expectedReasonFor] of fieldCases) {
        for (const [typeName, makeWrongValue] of wrongValueFactories) {
          const artifact = buildValidArtifact();
          const step =
            artifact.commandSequences[sequenceName].steps[stepIndex];
          step[fieldName] = makeWrongValue();
          const result = validateCandidate(artifact);
          const stepPath =
            `commandSequences.${sequenceName}.steps[${stepIndex}]`;
          const expectedReason = expectedReasonFor(stepPath);

          assert.equal(
            result.valid,
            false,
            `${sequenceName} ${commandId} accepted ${typeName} ${fieldName}`,
          );
          assert.ok(
            result.invalid.includes(expectedReason),
            `${sequenceName} ${commandId} did not report ${expectedReason}`,
          );
        }
      }
    }
  }
});

test("command-step timestamps reject parseable non-ISO and oversized strings", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.steps[0].observedAt =
    "May 23 2026 16:57:04 GMT";
  artifact.commandSequences.jsFallback.steps[0].observedAt =
    `May 23 2026 16:58:34 GMT${" ".repeat(80)}`;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.ok(
    result.invalid.includes(
      "commandSequences.nativeCore.steps[0].observedAt",
    ),
  );
  assert.ok(
    result.invalid.includes(
      "commandSequences.jsFallback.steps[0].observedAt",
    ),
  );
});

test("all evidence timestamp families reject prose and impossible RFC 3339 dates", () => {
  const timestampCases = [
    [
      "generatedAt",
      (artifact, value) => {
        artifact.generatedAt = value;
      },
      "generatedAt",
    ],
    [
      "provenance.generatedAt",
      (artifact, value) => {
        artifact.provenance.generatedAt = value;
      },
      "provenance.generatedAt",
    ],
    [
      "humanAttestation.attestedAt",
      (artifact, value) => {
        artifact.humanAttestation.attestedAt = value;
      },
      "humanAttestation.attestedAt",
    ],
    [
      "backendSmoke.generatedAt",
      (artifact, value) => {
        artifact.backendSmoke.generatedAt = value;
      },
      "backendSmoke.generatedAt",
    ],
    [
      "backendSmoke.provenance.workerVersionCreatedAt",
      (artifact, value) => {
        artifact.backendSmoke.provenance.workerVersionCreatedAt = value;
      },
      "backendSmoke.provenance.workerVersionCreatedAt",
    ],
    [
      "deviceReadiness.coreDeviceProbe.checkedAt",
      (artifact, value) => {
        artifact.deviceReadiness.coreDeviceProbe.checkedAt = value;
      },
      "deviceReadiness.coreDeviceProbe.checkedAt",
    ],
    [
      "commandSequences.nativeCore.startedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.startedAt = value;
      },
      "commandSequences.nativeCore.startedAt",
    ],
    [
      "commandSequences.nativeCore.completedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.completedAt = value;
      },
      "commandSequences.nativeCore.completedAt",
    ],
    [
      "commandSequences.nativeCore.steps[0].observedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.steps[0].observedAt = value;
      },
      "commandSequences.nativeCore.steps[0].observedAt",
    ],
    [
      "commandSequences.nativeCore.stopBargeIn.observedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.stopBargeIn.observedAt = value;
      },
      "commandSequences.nativeCore.stopBargeIn.observedAt",
    ],
    [
      "commandSequences.nativeCore.stopBargeIn.feedbackObservedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.stopBargeIn.feedbackObservedAt =
          value;
      },
      "commandSequences.nativeCore.stopBargeIn.feedbackObservedAt",
    ],
    [
      "commandSequences.nativeCore.stopBargeIn.postStopObservedAt",
      (artifact, value) => {
        artifact.commandSequences.nativeCore.stopBargeIn.postStopObservedAt =
          value;
      },
      "commandSequences.nativeCore.stopBargeIn.postStopObservedAt",
    ],
  ];
  const invalidTimestamps = [
    ["prose", "May 23 2026 16:57:04 GMT"],
    ["impossible-date", "2026-02-30T16:57:04.000Z"],
  ];

  for (const [fieldName, mutate, expectedReason] of timestampCases) {
    for (const [caseName, value] of invalidTimestamps) {
      const artifact = buildValidArtifact();
      mutate(artifact, value);
      const result = validateCandidate(artifact);

      assert.equal(
        result.valid,
        false,
        `${fieldName} accepted ${caseName}`,
      );
      assert.ok(
        result.invalid.includes(expectedReason),
        `${fieldName} did not report ${expectedReason} for ${caseName}`,
      );
    }
  }
});

test("valid three-artifact progression passes with distinct pre-upload operators", () => {
  const result = validateNoScreenEvidenceProgression(buildProgressionArtifacts(), {
    ...candidateOptions(),
    expectedCandidateGeneratedAt: "2026-05-23T16:50:00.000Z",
    requireTestflightRepeat: true,
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test("Store progression requires the TestFlight repeat itself to use a blind participant", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.participantRole = "internal-tester";
  artifacts.testflight.participantLabel = "internal-charlie";
  artifacts.testflight.humanAttestation.blindParticipantSelfAttested = false;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /testflight\.invalid:participantRole:internal-tester/,
  );
});

test("progression rejects role, installation source, run reuse, and pre-upload operator reuse", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.blindParticipant.participantRole = "internal-tester";
  artifacts.blindParticipant.installationSource = "testflight";
  artifacts.blindParticipant.appStoreConnectBuildRecordIdentifier = "asc-build-4";
  artifacts.blindParticipant.provenance.runId = artifacts.internal.provenance.runId;
  artifacts.blindParticipant.operator = artifacts.internal.operator;
  artifacts.blindParticipant.participantLabel = artifacts.internal.participantLabel;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(","), /blindParticipant\.invalid:participantRole:internal-tester/);
  assert.match(result.errors.join(","), /blindParticipant\.invalid:installationSource:testflight/);
  assert.match(result.errors.join(","), /blindParticipant\.runId\.reused-from:internal/);
  assert.match(result.errors.join(","), /blindParticipant\.operator\.matches-internal/);
  assert.match(result.errors.join(","), /blindParticipant\.participantLabel\.matches-internal/);
});

test("progression rejects relabeled clones that reuse path execution or analyze IDs", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.blindParticipant.commandSequences =
    structuredClone(artifacts.internal.commandSequences);
  artifacts.blindParticipant.cameraPaths =
    structuredClone(artifacts.internal.cameraPaths);

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /blindParticipant\.nativeCore\.executionId\.reused-from:internal\.nativeCore/,
  );
  assert.match(
    result.errors.join(","),
    /blindParticipant\.jsFallback\.analyzeRequestId\.reused-from:internal\.jsFallback/,
  );
});

test("progression rejects reused per-step event IDs across nominally separate runs", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.blindParticipant.commandSequences.jsFallback.steps[5].eventId =
    artifacts.internal.commandSequences.nativeCore.steps[3].eventId;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(","), /eventId\.reused-from/);
});

test("progression rejects a TestFlight repeat that predates either pre-upload run", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.generatedAt = "2026-05-23T17:05:00.000Z";
  artifacts.testflight.provenance.generatedAt = artifacts.testflight.generatedAt;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(result.errors.join(","), /testflight\.generatedAt\.not-after-blindParticipant/);
});

test("TestFlight evidence requires a nonempty sanitized string build record identifier", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.appStoreConnectBuildRecordIdentifier = 1234567890;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /testflight\.invalid:appStoreConnectBuildRecordIdentifier/,
  );
});

test("TestFlight evidence requires verified matching Apple sandbox identity while ad hoc evidence requires none", () => {
  const testflightArtifacts = buildProgressionArtifacts();
  testflightArtifacts.testflight.installationEvidence = {
    appStoreAppIdMatched: false,
    appTransactionVerified: false,
    appIdentityMatched: false,
    bundleVersionMatched: false,
    distributionEnvironment: "none",
    storeKitEvidencePurpose: "apple-signed-app-identity-only",
    uploadedAt: "2026-05-23T17:15:00.000Z",
    uploadedIpaSha256: CANDIDATE_IPA_SHA256,
  };
  const testflightResult = validateNoScreenEvidenceProgression(testflightArtifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });
  assert.equal(testflightResult.valid, false);
  assert.match(
    testflightResult.errors.join(","),
    /testflight\.invalid:installationEvidence\.(?:appTransactionVerified|appIdentityMatched|distributionEnvironment)/,
  );

  const adHocArtifact = buildValidArtifact();
  adHocArtifact.installationEvidence = {
    appStoreAppIdMatched: true,
    appTransactionVerified: true,
    appIdentityMatched: true,
    bundleVersionMatched: true,
    distributionEnvironment: "apple-sandbox",
  };
  const adHocResult = validateCandidate(adHocArtifact);
  assert.equal(adHocResult.valid, false);
  assert.match(
    adHocResult.invalid.join(","),
    /installationEvidence\.(?:appTransactionVerified|appIdentityMatched|distributionEnvironment)/,
  );
});

test("TestFlight identity evidence requires iOS 16 or newer", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.device.osVersion = "15.7.9";

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /testflight\.invalid:device\.osVersion\.storekit-app-transaction-unavailable/,
  );
});

test("TestFlight processing and execution must follow both pre-upload runs", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.installationEvidence.uploadedAt =
    "2026-05-23T17:08:00.000Z";
  artifacts.testflight.commandSequences.nativeCore.startedAt =
    "2026-05-23T17:09:00.000Z";
  artifacts.testflight.commandSequences.nativeCore.completedAt =
    "2026-05-23T17:10:30.000Z";

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /testflight\.(?:execution|uploadedAt)\.not-after-blindParticipant/,
  );
});

test("TestFlight uploadedAt must be strictly before the earliest execution start", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.installationEvidence.uploadedAt =
    artifacts.testflight.commandSequences.nativeCore.startedAt;

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.includes(
      "testflight.invalid:installationEvidence.uploadedAt.not-before-execution-start",
    ),
  );
});

test("TestFlight uploadedAt rejects prose and impossible RFC 3339 dates", () => {
  for (const uploadedAt of [
    "May 23 2026 17:15:00 GMT",
    "2026-02-30T17:15:00.000Z",
  ]) {
    const artifacts = buildProgressionArtifacts();
    artifacts.testflight.installationEvidence.uploadedAt = uploadedAt;
    const result = validateNoScreenEvidenceProgression(artifacts, {
      ...candidateOptions(),
      requireTestflightRepeat: true,
    });

    assert.equal(result.valid, false, `${uploadedAt} should be rejected`);
    assert.ok(
      result.errors.includes(
        "testflight.invalid:installationEvidence.uploadedAt",
      ),
    );
  }
});

test("TestFlight evidence binds the exact uploaded candidate IPA SHA-256", () => {
  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.installationEvidence.uploadedIpaSha256 = "e".repeat(64);

  const result = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(","),
    /testflight\.invalid:installationEvidence\.uploadedIpaSha256-mismatch/,
  );

  const adHocArtifact = buildValidArtifact();
  adHocArtifact.installationEvidence.uploadedIpaSha256 = CANDIDATE_IPA_SHA256;
  const adHocResult = validateCandidate(adHocArtifact);
  assert.equal(adHocResult.valid, false);
  assert.match(
    adHocResult.invalid.join(","),
    /installationEvidence\.uploadedIpaSha256\.ad-hoc/,
  );
});

test("ad hoc installation evidence rejects every TestFlight-only field", () => {
  const testflightOnlyFields = [
    [
      "storeKitEvidencePurpose",
      "apple-signed-app-identity-only",
    ],
    ["uploadedAt", "2026-05-23T16:55:00.000Z"],
    ["uploadedIpaSha256", CANDIDATE_IPA_SHA256],
  ];

  for (const [fieldName, value] of testflightOnlyFields) {
    const artifact = buildValidArtifact();
    artifact.installationEvidence[fieldName] = value;
    const result = validateCandidate(artifact);
    const expectedReason = `unexpectedField:installationEvidence.${fieldName}`;

    assert.equal(result.valid, false, `ad hoc accepted ${fieldName}`);
    assert.ok(
      result.invalid.includes(expectedReason),
      `ad hoc did not report ${expectedReason}`,
    );
  }
});

test("ad hoc installation evidence rejects wrong field types in isolation", () => {
  const wrongTypeCases = [
    ["appStoreAppIdMatched", "false"],
    ["appIdentityMatched", 0],
    ["appTransactionVerified", { value: false }],
    ["bundleVersionMatched", [false]],
    ["distributionEnvironment", false],
    ["installedValidationIpaSha256", 4],
  ];

  for (const [fieldName, value] of wrongTypeCases) {
    const artifact = buildValidArtifact();
    artifact.installationEvidence[fieldName] = value;
    const result = validateCandidate(artifact);

    assert.equal(
      result.valid,
      false,
      `ad hoc accepted wrong type for ${fieldName}`,
    );
    assert.ok(
      result.invalid.includes(`installationEvidence.${fieldName}`),
      `ad hoc did not reject installationEvidence.${fieldName}`,
    );
  }
});

test("pre-upload evidence binds the installed validation IPA, not the Store IPA", () => {
  const adHocArtifact = buildValidArtifact();
  adHocArtifact.installationEvidence.installedValidationIpaSha256 =
    "9".repeat(64);

  const adHocResult = validateCandidate(adHocArtifact);
  assert.equal(adHocResult.valid, false);
  assert.match(
    adHocResult.invalid.join(","),
    /installationEvidence\.installedValidationIpaSha256-mismatch/,
  );

  const artifacts = buildProgressionArtifacts();
  artifacts.testflight.installationEvidence.installedValidationIpaSha256 =
    VALIDATION_IPA_SHA256;

  const testflightResult = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    requireTestflightRepeat: true,
  });
  assert.equal(testflightResult.valid, false);
  assert.match(
    testflightResult.errors.join(","),
    /testflight\.invalid:installationEvidence\.installedValidationIpaSha256\.testflight/,
  );
});

test("Store progression binds TestFlight evidence to live App Store Connect data", () => {
  const artifacts = buildProgressionArtifacts();
  const expectedAppStoreConnectBuildEvidence = {
    buildRecordIdentifier:
      artifacts.testflight.appStoreConnectBuildRecordIdentifier,
    uploadedAt:
      artifacts.testflight.installationEvidence.uploadedAt,
  };
  const valid = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    expectedAppStoreConnectBuildEvidence,
    requireTestflightRepeat: true,
  });
  assert.equal(valid.valid, true);

  artifacts.testflight.appStoreConnectBuildRecordIdentifier =
    "different-build-record";
  artifacts.testflight.installationEvidence.uploadedAt =
    "2026-05-23T17:16:00.000Z";
  const invalid = validateNoScreenEvidenceProgression(artifacts, {
    ...candidateOptions(),
    expectedAppStoreConnectBuildEvidence,
    requireTestflightRepeat: true,
  });
  assert.equal(invalid.valid, false);
  assert.match(
    invalid.errors.join(","),
    /appStoreConnectBuildRecordIdentifier-live-mismatch/,
  );
  assert.match(
    invalid.errors.join(","),
    /installationEvidence\.uploadedAt-live-mismatch/,
  );
});

test("legacy receipt fields cannot satisfy installation evidence", () => {
  const artifact = buildValidArtifact();
  artifact.installationEvidence.receiptPresent = false;
  artifact.installationEvidence.receiptEnvironment = "none";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /installationEvidence\.legacyReceiptFields/);
});

test("no-screen evidence requires role-prefixed pseudonyms and explicit human attestation", () => {
  const artifact = buildValidArtifact();
  artifact.operator = "alpha";
  artifact.participantLabel = "blind-alpha";
  artifact.humanAttestation.nonvisualOperationConfirmed = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /operator/);
  assert.match(result.invalid.join(","), /participantLabel/);
  assert.match(
    result.invalid.join(","),
    /humanAttestation\.nonvisualOperationConfirmed/,
  );
});

test("native and JS fallback sequences require distinct bound execution windows", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.jsFallback.executionId =
    artifact.commandSequences.nativeCore.executionId;
  artifact.commandSequences.jsFallback.analyzeRequestId =
    artifact.commandSequences.nativeCore.analyzeRequestId;
  artifact.cameraPaths.jsFallback.requestId =
    artifact.cameraPaths.nativeCore.requestId;
  artifact.commandSequences.jsFallback.startedAt =
    "2026-05-23T16:57:30.000Z";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /commandSequences\.executionId\.reused/);
  assert.match(result.invalid.join(","), /commandSequences\.analyzeRequestId\.reused/);
  assert.match(result.invalid.join(","), /cameraPaths\.requestId\.reused/);
  assert.match(result.invalid.join(","), /commandSequences\.execution-order/);
});

test("camera path evidence requires fresh usable frames and request correlation", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.captureHeuristics.captureLatencyMs = 5_001;
  artifact.cameraPaths.nativeCore.captureHeuristics.frameAgeMs = 2_001;
  artifact.cameraPaths.nativeCore.uploadedHeight = 31;
  artifact.cameraPaths.nativeCore.captureHeuristics.uploadedHeight = 31;
  artifact.cameraPaths.jsFallback.captureHeuristics.imageSource = "unknown";
  artifact.commandSequences.jsFallback.analyzeRequestId =
    "99999999-9999-4999-8999-999999999999";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /cameraPaths\.nativeCore\.captureHeuristics\.captureLatencyMs/,
  );
  assert.match(
    result.invalid.join(","),
    /cameraPaths\.nativeCore\.captureHeuristics\.frameAgeMs/,
  );
  assert.match(
    result.invalid.join(","),
    /cameraPaths\.nativeCore\.uploadedHeight/,
  );
  assert.match(
    result.invalid.join(","),
    /cameraPaths\.jsFallback\.captureHeuristics\.imageSource/,
  );
  assert.match(
    result.invalid.join(","),
    /cameraPaths\.jsFallback\.requestId\.command-sequence-mismatch/,
  );
});

test("native and JS fallback steps require unique event IDs and ordered observations", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.jsFallback.steps[2].eventId =
    artifact.commandSequences.nativeCore.steps[2].eventId;
  artifact.commandSequences.jsFallback.steps[6].observedAt =
    artifact.commandSequences.jsFallback.steps[5].observedAt;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /eventId\.reused-from/);
  assert.match(result.invalid.join(","), /observedAt\.order/);
});

test("command execution windows must follow candidate creation and remain bounded near export", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.startedAt = "2026-05-23T15:30:00.000Z";
  artifact.commandSequences.nativeCore.completedAt = "2026-05-23T16:40:00.000Z";

  const result = validateCandidate(artifact, {
    expectedCandidateGeneratedAt: "2026-05-23T16:50:00.000Z",
  });

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /commandSequences\.nativeCore\.time-window/,
  );
  assert.match(
    result.invalid.join(","),
    /commandSequences\.nativeCore\.completedAt\.export-window/,
  );
  assert.match(
    result.invalid.join(","),
    /commandSequences\.nativeCore\.startedAt\.before-candidate/,
  );
});

test("no-screen evidence requires an executable CoreDevice probe, not a transport snapshot", () => {
  const artifact = buildValidArtifact();
  artifact.deviceReadiness.coreDeviceExecutionReady = false;
  artifact.deviceReadiness.ddiServicesAvailable = true;
  artifact.deviceReadiness.tunnelConnected = true;
  artifact.deviceReadiness.usbOrSameLan = true;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /deviceReadiness\.coreDeviceExecutionReady/);
});

test("no-screen evidence requires a fresh successful structured CoreDevice probe", () => {
  for (const mutate of [
    (artifact) => {
      delete artifact.deviceReadiness.coreDeviceProbe;
    },
    (artifact) => {
      artifact.deviceReadiness.coreDeviceProbe.outcome = "command-failed";
    },
    (artifact) => {
      artifact.deviceReadiness.coreDeviceProbe.exitStatus = 1;
    },
    (artifact) => {
      artifact.deviceReadiness.coreDeviceProbe.type = "transport-snapshot";
    },
    (artifact) => {
      artifact.deviceReadiness.coreDeviceProbe.checkedAt =
        "2026-05-23T16:30:00.000Z";
    },
  ]) {
    const artifact = buildValidArtifact();
    mutate(artifact);
    const result = validateCandidate(artifact);
    assert.equal(result.valid, false);
    assert.match(
      [...result.missing, ...result.invalid].join(","),
      /deviceReadiness\.coreDeviceProbe/,
    );
  }
});

test("CoreDevice checkedAt obeys immediate-before ordering boundaries", () => {
  for (const checkedAt of [
    "2026-05-23T16:42:00.000Z",
    "2026-05-23T16:57:00.000Z",
  ]) {
    const artifact = buildValidArtifact();
    artifact.deviceReadiness.coreDeviceProbe.checkedAt = checkedAt;
    const result = validateCandidate(artifact);
    assert.equal(result.valid, true, `${checkedAt} should be in bounds`);
  }

  const afterExecutionStart = buildValidArtifact();
  afterExecutionStart.deviceReadiness.coreDeviceProbe.checkedAt =
    "2026-05-23T16:57:00.001Z";
  const afterExecutionStartResult = validateCandidate(afterExecutionStart);
  assert.equal(afterExecutionStartResult.valid, false);
  assert.ok(
    afterExecutionStartResult.invalid.includes(
      "deviceReadiness.coreDeviceProbe.checkedAt.execution-window",
    ),
  );

  const beforeLeadWindow = buildValidArtifact();
  beforeLeadWindow.deviceReadiness.coreDeviceProbe.checkedAt =
    "2026-05-23T16:41:59.999Z";
  const beforeLeadWindowResult = validateCandidate(beforeLeadWindow);
  assert.equal(beforeLeadWindowResult.valid, false);
  assert.ok(
    beforeLeadWindowResult.invalid.includes(
      "deviceReadiness.coreDeviceProbe.checkedAt.execution-window",
    ),
  );

  const afterEvidenceGeneratedAt = buildValidArtifact();
  afterEvidenceGeneratedAt.deviceReadiness.coreDeviceProbe.checkedAt =
    "2026-05-23T17:00:00.001Z";
  const afterEvidenceGeneratedAtResult = validateCandidate(
    afterEvidenceGeneratedAt,
  );
  assert.equal(afterEvidenceGeneratedAtResult.valid, false);
  assert.ok(
    afterEvidenceGeneratedAtResult.invalid.includes(
      "deviceReadiness.coreDeviceProbe.checkedAt.after-evidence-generatedAt",
    ),
  );
});

test("no-screen smoke evidence rejects missing STOP barge-in proof", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.steps
    .find((step) => step.id === "stop-guidance")
    .stopCutThrough = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /commandSequences\.nativeCore\.stop-guidance\.stopCutThrough/);
});

test("no-screen smoke evidence rejects missing voice help recovery proof", () => {
  const artifact = buildValidArtifact();
  const helpStep = artifact.commandSequences.nativeCore.steps.find((step) => step.id === "help");
  helpStep.helpIncludesBoundedCommandList = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /commandSequences\.nativeCore\.help\.helpIncludesBoundedCommandList/);
});

test("no-screen smoke evidence rejects help changing settings", () => {
  const artifact = buildValidArtifact();
  const helpStep = artifact.commandSequences.nativeCore.steps.find((step) => step.id === "help");
  helpStep.settingsChanged = true;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /commandSequences\.nativeCore\.help\.settingsChanged/);
});

test("no-screen smoke evidence rejects voice sequence in the wrong order", () => {
  const artifact = buildValidArtifact();
  const sequence = artifact.commandSequences.jsFallback.steps;
  const whatDoYouSeeIndex = sequence.findIndex((step) => step.id === "what-do-you-see");
  const stopGuidanceIndex = sequence.findIndex((step) => step.id === "stop-guidance");
  [sequence[whatDoYouSeeIndex], sequence[stopGuidanceIndex]] = [
    sequence[stopGuidanceIndex],
    sequence[whatDoYouSeeIndex],
  ];

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /commandSequences\.jsFallback\.order/);
});

test("no-screen smoke evidence requires a complete command sequence on both camera paths", () => {
  const missingPath = buildValidArtifact();
  delete missingPath.commandSequences.jsFallback;
  const missingPathResult = validateCandidate(missingPath);
  assert.equal(missingPathResult.valid, false);
  assert.match(missingPathResult.missing.join(","), /commandSequences\.jsFallback/);

  const incompletePath = buildValidArtifact();
  incompletePath.commandSequences.jsFallback.steps
    .find((step) => step.id === "what-do-you-see")
    .voiceRecognized = false;
  const incompletePathResult = validateCandidate(incompletePath);
  assert.equal(incompletePathResult.valid, false);
  assert.match(
    incompletePathResult.invalid.join(","),
    /commandSequences\.jsFallback\.what-do-you-see\.voiceRecognized/,
  );
});

test("no-screen smoke evidence requires conservative recovery for both interruption classes", () => {
  const artifact = buildValidArtifact();
  artifact.interruptionRecovery.backgroundForeground.noContinuedGuidance = false;
  artifact.interruptionRecovery.audioRoute.recoveryLatencyMs = 10_001;
  artifact.interruptionRecovery.audioRoute.explicitRestartConfirmed = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /interruptionRecovery\.backgroundForeground\.noContinuedGuidance/,
  );
  assert.match(result.invalid.join(","), /interruptionRecovery\.audioRoute\.recoveryLatencyMs/);
  assert.match(
    result.invalid.join(","),
    /interruptionRecovery\.audioRoute\.explicitRestartConfirmed/,
  );
});

test("no-screen smoke evidence rejects cut-through without recognized partial STOP proof", () => {
  const artifact = buildValidArtifact();
  const stopBargeIn = artifact.commandSequences.nativeCore.stopBargeIn;
  delete stopBargeIn.recognizedCommand;
  delete stopBargeIn.recognizedPhase;
  stopBargeIn.recognizedDuringSpeech = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.missing.join(","), /stopBargeIn\.recognizedCommand/);
  assert.match(result.missing.join(","), /stopBargeIn\.recognizedPhase/);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedDuringSpeech/);
});

test("no-screen smoke evidence rejects final-only STOP as barge-in proof", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.stopBargeIn.recognizedCommand = "stop-guidance";
  artifact.commandSequences.nativeCore.stopBargeIn.recognizedPhase = "final";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedCommand/);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedPhase/);
});

test("no-screen smoke evidence rejects STOP recognized after speech ended", () => {
  const artifact = buildValidArtifact();
  artifact.commandSequences.nativeCore.stopBargeIn.recognizedDuringSpeech = false;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedDuringSpeech/);
});

test("STOP sensory outcomes must succeed on the same bound STOP event", () => {
  const artifact = buildValidArtifact();
  const sequence = artifact.commandSequences.nativeCore;
  sequence.stopBargeIn.audioCueOutcome = "failure";
  sequence.stopBargeIn.hapticOutcome = "failure";
  sequence.stopBargeIn.eventId =
    artifact.commandSequences.jsFallback.stopBargeIn.eventId;
  sequence.stopBargeIn.observedAt =
    artifact.commandSequences.jsFallback.stopBargeIn.observedAt;
  artifact.diagnostics.audioCues.successCount = 99;
  artifact.diagnostics.haptics.successCount = 99;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /stopBargeIn\.audioCueOutcome/);
  assert.match(result.invalid.join(","), /stopBargeIn\.hapticOutcome/);
  assert.match(result.invalid.join(","), /stopBargeIn\.eventId\.matches-stop-step/);
  assert.match(result.invalid.join(","), /stopBargeIn\.observedAt\.matches-stop-step/);
});

test("STOP feedback and shutdown observations must follow recognition within the run", () => {
  const artifact = buildValidArtifact();
  const sequence = artifact.commandSequences.nativeCore;
  sequence.stopBargeIn.feedbackObservedAt =
    new Date(Date.parse(sequence.stopBargeIn.observedAt) - 1).toISOString();
  sequence.stopBargeIn.postStopObservedAt =
    new Date(Date.parse(sequence.completedAt) + 1).toISOString();

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /feedbackObservedAt\.stop-window/);
  assert.match(result.invalid.join(","), /postStopObservedAt\.stop-window/);
});

test("STOP cut-through feedback and runtime shutdown have strict latency ceilings", () => {
  const artifact = buildValidArtifact();
  const nativeStop = artifact.commandSequences.nativeCore.stopBargeIn;
  const fallbackStop = artifact.commandSequences.jsFallback.stopBargeIn;
  nativeStop.feedbackObservedAt =
    new Date(Date.parse(nativeStop.observedAt) + 1_001).toISOString();
  fallbackStop.postStopObservedAt =
    new Date(Date.parse(fallbackStop.observedAt) + 3_001).toISOString();

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /nativeCore\.stopBargeIn\.feedbackObservedAt\.max-latency/,
  );
  assert.match(
    result.invalid.join(","),
    /jsFallback\.stopBargeIn\.postStopObservedAt\.max-latency/,
  );
});

test("no-screen smoke evidence rejects settings persistence without real state changes", () => {
  const artifact = buildValidArtifact();
  artifact.settingsPersistence.afterVoiceChange = { ...artifact.settingsPersistence.before };
  artifact.settingsPersistence.afterRelaunch = { ...artifact.settingsPersistence.before };

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /settingsPersistence\.afterVoiceChange\.differsFromBefore/);
});

test("no-screen smoke evidence rejects settings that do not survive relaunch", () => {
  const artifact = buildValidArtifact();
  artifact.settingsPersistence.afterRelaunch = {
    descriptionMode: "short",
    hapticsEnabled: true,
    speechRate: "normal",
  };

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /settingsPersistence\.afterRelaunch\.matchesAfterVoiceChange/);
});

test("no-screen smoke evidence rejects settings that are not restored after validation", () => {
  const artifact = buildValidArtifact();
  artifact.settingsPersistence.afterRestore = { ...artifact.settingsPersistence.afterVoiceChange };

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /settingsPersistence\.afterRestore\.matchesBefore/);
});

test("no-screen smoke evidence rejects mismatched provenance and device identity", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.bundleIdentifier = "com.example.other";
  artifact.provenance.buildProfile = "store";
  artifact.provenance.apiEnvironment = "staging";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.bundleIdentifier:com\.example\.other/);
  assert.match(result.invalid.join(","), /provenance\.buildProfile\.matches\.device\.buildProfile/);
  assert.match(result.invalid.join(","), /provenance\.apiEnvironment\.matches\.backendSmoke\.environment/);
});

test("no-screen smoke evidence rejects incomplete camera capture heuristics", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.captureHeuristics = {};
  artifact.cameraPaths.jsFallback.captureHeuristics = {};

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.missing.join(","), /cameraPaths\.nativeCore\.captureHeuristics\.imageSource/);
  assert.match(result.missing.join(","), /cameraPaths\.jsFallback\.captureHeuristics\.uploadedWidth/);
});

test("no-screen smoke evidence rejects camera heuristic upload dimensions that do not match the path", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.captureHeuristics.uploadedHeight = 1;
  artifact.cameraPaths.jsFallback.captureHeuristics.uploadedWidth = 1;

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /cameraPaths\.nativeCore\.captureHeuristics\.uploadedHeightMatchesPath/);
  assert.match(result.invalid.join(","), /cameraPaths\.jsFallback\.captureHeuristics\.uploadedWidthMatchesPath/);
});

test("no-screen smoke evidence rejects free-form scene prose in frame summaries", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.frameSummary = "Front door at 123 Private Street.";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /cameraPaths\.nativeCore\.frameSummary/);
  assert.match(result.invalid.join(","), /free-form frame summary/);
});

test("no-screen smoke evidence rejects raw media and full identifiers", () => {
  const artifact = buildValidArtifact({
    rawImage: "data:image/png;base64,AAAA",
    udid: "00000000-0000000000000000",
  });

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /disallowedKey:rawImage/);
  assert.match(result.invalid.join(","), /disallowedKey:udid/);
  assert.match(result.invalid.join(","), /sensitivePattern/);
});

test("no-screen smoke evidence rejects unexpected fields recursively", () => {
  const artifact = buildValidArtifact();
  artifact.backendSmoke.provenance.opaqueEvidence = "synthetic";

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /unexpectedField:backendSmoke\.provenance\.opaqueEvidence/,
  );
});

test("no-screen evidence rejects inherited root and nested required fields", () => {
  const inheritedRoot = Object.create(buildValidArtifact());
  const inheritedRootResult = validateCandidate(inheritedRoot);
  assert.equal(inheritedRootResult.valid, false);
  assert.ok(inheritedRootResult.invalid.includes("artifact.plain-object"));

  const inheritedNestedArtifact = buildValidArtifact();
  inheritedNestedArtifact.provenance = Object.create(
    inheritedNestedArtifact.provenance,
  );
  const inheritedNestedResult = validateCandidate(inheritedNestedArtifact);
  assert.equal(inheritedNestedResult.valid, false);
  assert.ok(
    inheritedNestedResult.invalid.includes("nonPlainObject:provenance"),
  );
  assert.ok(
    inheritedNestedResult.missing.includes("provenance.schemaVersion"),
  );
});

test("no-screen evidence rejects nested non-plain objects with own fields", () => {
  const artifact = buildValidArtifact();
  artifact.installationEvidence = Object.assign(
    Object.create({ inheritedMarker: true }),
    artifact.installationEvidence,
  );

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.ok(
    result.invalid.includes("nonPlainObject:installationEvidence"),
  );
});

test("no-screen smoke evidence rejects identity and contact data", () => {
  const artifact = buildValidArtifact({
    email: "person@example.com",
    operator: "Charlie.H",
    participantLabel: "+1-949-555-0100",
  });

  const result = validateCandidate(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /operator/);
  assert.match(result.invalid.join(","), /participantLabel/);
  assert.match(result.invalid.join(","), /disallowedKey:email/);
  assert.match(result.invalid.join(","), /sensitivePattern/);
});

test("no-screen smoke evidence rejects stale and future candidate timestamps", () => {
  const stale = buildValidArtifact();
  stale.generatedAt = new Date(TEST_NOW_MS - (NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS + 1) * 1000).toISOString();
  stale.provenance.generatedAt = stale.generatedAt;
  const staleResult = validateCandidate(stale);
  assert.equal(staleResult.valid, false);
  assert.match(staleResult.invalid.join(","), /generatedAt\.stale/);

  const future = buildValidArtifact();
  future.generatedAt = new Date(TEST_NOW_MS + 6 * 60 * 1000).toISOString();
  future.provenance.generatedAt = future.generatedAt;
  const futureResult = validateCandidate(future);
  assert.equal(futureResult.valid, false);
  assert.match(futureResult.invalid.join(","), /generatedAt\.in-future/);
});

test("no-screen smoke evidence rejects a run timestamp before candidate generation", () => {
  const artifact = buildValidArtifact();
  const result = validateCandidate(artifact, {
    expectedCandidateGeneratedAt: "2026-05-23T17:30:00.000Z",
  });

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /generatedAt\.before-candidate/);
});

test("no-screen smoke evidence rejects the wrong app version and build", () => {
  const artifact = buildValidArtifact();
  artifact.device.appVersion = "1.0.1";
  artifact.provenance.appVersion = "1.0.1";
  artifact.device.buildNumber = "5";
  artifact.provenance.buildNumber = "5";

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /device\.appVersion:1\.0\.1/);
  assert.match(result.invalid.join(","), /provenance\.buildNumber:5/);
});

test("no-screen smoke evidence rejects the wrong release track and build profile", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.releaseTrack = "store";
  artifact.provenance.buildProfile = "store";
  artifact.device.buildProfile = "store";

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.releaseTrack:store/);
  assert.match(result.invalid.join(","), /device\.buildProfile:store/);
});

test("no-screen smoke evidence rejects a different Git source revision", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.sourceRevision = "b".repeat(40);
  artifact.backendSmoke.provenance.sourceRevision = "b".repeat(40);

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.sourceRevision-mismatch/);
  assert.match(result.invalid.join(","), /backendSmoke\.provenance\.sourceRevision\.candidate-mismatch/);
});

test("no-screen smoke evidence rejects a different candidate binary", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.candidateBinarySha256 = "d".repeat(64);

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.candidateBinarySha256-mismatch/);
});

test("no-screen smoke evidence rejects a different signed-config candidate identifier", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.candidateIdentifier = "f".repeat(64);

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.candidateIdentifier-mismatch/);
});

test("no-screen smoke evidence rejects mismatched candidate backend provenance and request IDs", () => {
  const artifact = buildValidArtifact();
  artifact.backendSmoke.provenance.workerVersionId = "99999999-9999-4999-8999-999999999999";
  artifact.backendSmoke.requestIds.sceneQueryAnalyze = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const result = validateCandidate(artifact);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /backendSmoke\.provenance\.workerVersionId\.candidate-mismatch/);
  assert.match(result.invalid.join(","), /backendSmoke\.requestIds\.sceneQueryAnalyze\.candidate-mismatch/);
});

test("the historical example remains readable but is launch-invalid", () => {
  const example = JSON.parse(
    readFileSync(path.resolve(scriptDir, "../docs/no-screen-smoke-evidence.example.json"), "utf8"),
  );
  const result = validateCandidate(example, {
    nowMs: TEST_NOW_MS + (NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS + 1) * 1000,
  });

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /artifactVersion/);
  assert.match(result.invalid.join(","), /provenance\.schemaVersion/);
  assert.match(result.invalid.join(","), /generatedAt\.stale/);
  assert.match(result.invalid.join(","), /device\.buildNumber:42/);
  assert.match(result.missing.join(","), /provenance\.sourceRevision/);
  assert.match(result.missing.join(","), /backendSmoke\.artifactVersion/);
});
