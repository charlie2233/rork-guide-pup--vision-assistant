import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_NO_SCREEN_SEQUENCE,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";

function buildValidArtifact(overrides = {}) {
  const sequence = REQUIRED_NO_SCREEN_SEQUENCE.map((id) => ({
    id,
    noScreenRequired: true,
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

  return {
    artifactVersion: 1,
    assistiveTech: {
      audioCuesAudible: true,
      hapticsFelt: true,
      speechInputConfirmed: true,
      spokenOutputConfirmed: true,
      voiceOverRunning: true,
    },
    backendSmoke: {
      apiBaseUrl: "https://guidepup-api-production.example.test",
      analyzeStatusCode: 200,
      bootstrapStatusCode: 200,
      environment: "production",
      executionPath: "provider-backed",
      healthStatusCode: 200,
      model: "gpt-5.5-2026-05-22",
      promptVersion: "2026-05-22.v1",
      providerBacked: true,
      walkability: "clear",
      requestIds: {
        analyze: "33333333-3333-4333-8333-333333333333",
        bootstrap: "22222222-2222-4222-8222-222222222222",
        health: "11111111-1111-4111-8111-111111111111",
      },
      structuredOutputValid: true,
    },
    cameraPaths: {
      jsFallback: {
        captureHeuristics: {
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
    device: {
      appVersion: "1.0.0",
      buildNumber: "42",
      buildProfile: "testflight",
      bundleIdentifier: "com.example.guidepup",
      identifierSuffix: "0B5CE6D3",
      model: "iPhone 15 Pro",
      osVersion: "26.4.2",
    },
    deviceReadiness: {
      developerModeEnabled: true,
      paired: true,
      result: "ready",
      trusted: true,
      usbOrSameLan: true,
      xcodeDestinationAvailable: true,
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
    noScreen: {
      cleanInstallOrReset: true,
      noScreenUsed: true,
      screenReadingUsed: false,
      visualAssistanceUsed: false,
      voiceOnlyNavigation: true,
    },
    operator: "Internal tester",
    privacy: {
      containsFullDeviceIds: false,
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
      buildNumber: "42",
      buildProfile: "testflight",
      bundleIdentifier: "com.example.guidepup",
      generatedAt: "2026-05-23T17:00:00.000Z",
      releaseTrack: "testflight",
      runId: "no-screen-smoke-2026-05-23T17-00-00Z",
      schemaVersion: 1,
    },
    screenUse: "none",
    sequence,
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
    stopBargeIn: {
      armedDuringSpeech: true,
      attemptedDuringSpeech: true,
      audioCueAttempted: true,
      cutThrough: true,
      guidancePaused: true,
      hapticAttempted: true,
      lastSpeechListeningOverlapReason: "stop-barge-in",
      recognizedCommand: "stop-guidance-partial",
      recognizedDuringSpeech: true,
      recognizedPhase: "partial",
      speechListeningInvariant: "PASS",
      staleSpeechAfterStop: false,
      unexpectedSpeechListeningOverlapCount: 0,
    },
    validationMode: "real-iphone-no-screen",
    voiceOver: {
      runningAtExport: true,
      runningAtStart: true,
      runningAtStop: true,
      runningDuringGuidance: true,
    },
    ...overrides,
  };
}

test("valid no-screen smoke evidence passes the launch schema", () => {
  const result = validateNoScreenSmokeEvidenceArtifact(buildValidArtifact(), {
    expectedApiBaseUrl: "https://guidepup-api-production.example.test",
    expectedBundleIdentifier: "com.example.guidepup",
    expectedPromptVersion: "2026-05-22.v1",
    expectedVisionModel: "gpt-5.5",
  });

  assert.deepEqual(result, { invalid: [], missing: [], valid: true });
});

test("no-screen smoke evidence rejects missing STOP barge-in proof", () => {
  const artifact = buildValidArtifact();
  artifact.sequence.find((step) => step.id === "stop-guidance").stopCutThrough = false;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /sequence\.stop-guidance\.stopCutThrough/);
});

test("no-screen smoke evidence rejects missing voice help recovery proof", () => {
  const artifact = buildValidArtifact();
  const helpStep = artifact.sequence.find((step) => step.id === "help");
  helpStep.helpIncludesBoundedCommandList = false;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /sequence\.help\.helpIncludesBoundedCommandList/);
});

test("no-screen smoke evidence rejects help changing settings", () => {
  const artifact = buildValidArtifact();
  const helpStep = artifact.sequence.find((step) => step.id === "help");
  helpStep.settingsChanged = true;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /sequence\.help\.settingsChanged/);
});

test("no-screen smoke evidence rejects voice sequence in the wrong order", () => {
  const artifact = buildValidArtifact();
  const whatDoYouSeeIndex = artifact.sequence.findIndex((step) => step.id === "what-do-you-see");
  const stopGuidanceIndex = artifact.sequence.findIndex((step) => step.id === "stop-guidance");
  [artifact.sequence[whatDoYouSeeIndex], artifact.sequence[stopGuidanceIndex]] = [
    artifact.sequence[stopGuidanceIndex],
    artifact.sequence[whatDoYouSeeIndex],
  ];

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /sequence\.order/);
});

test("no-screen smoke evidence rejects cut-through without recognized partial STOP proof", () => {
  const artifact = buildValidArtifact();
  delete artifact.stopBargeIn.recognizedCommand;
  delete artifact.stopBargeIn.recognizedPhase;
  artifact.stopBargeIn.recognizedDuringSpeech = false;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.missing.join(","), /stopBargeIn\.recognizedCommand/);
  assert.match(result.missing.join(","), /stopBargeIn\.recognizedPhase/);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedDuringSpeech/);
});

test("no-screen smoke evidence rejects final-only STOP as barge-in proof", () => {
  const artifact = buildValidArtifact();
  artifact.stopBargeIn.recognizedCommand = "stop-guidance";
  artifact.stopBargeIn.recognizedPhase = "final";

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedCommand/);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedPhase/);
});

test("no-screen smoke evidence rejects STOP recognized after speech ended", () => {
  const artifact = buildValidArtifact();
  artifact.stopBargeIn.recognizedDuringSpeech = false;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /stopBargeIn\.recognizedDuringSpeech/);
});

test("no-screen smoke evidence rejects settings persistence without real state changes", () => {
  const artifact = buildValidArtifact();
  artifact.settingsPersistence.afterVoiceChange = { ...artifact.settingsPersistence.before };
  artifact.settingsPersistence.afterRelaunch = { ...artifact.settingsPersistence.before };

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

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

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /settingsPersistence\.afterRelaunch\.matchesAfterVoiceChange/);
});

test("no-screen smoke evidence rejects settings that are not restored after validation", () => {
  const artifact = buildValidArtifact();
  artifact.settingsPersistence.afterRestore = { ...artifact.settingsPersistence.afterVoiceChange };

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /settingsPersistence\.afterRestore\.matchesBefore/);
});

test("no-screen smoke evidence rejects mismatched provenance and device identity", () => {
  const artifact = buildValidArtifact();
  artifact.provenance.bundleIdentifier = "com.example.other";
  artifact.provenance.buildProfile = "store";
  artifact.provenance.apiEnvironment = "staging";

  const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
    expectedBundleIdentifier: "com.example.guidepup",
  });

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /provenance\.bundleIdentifier:com\.example\.other/);
  assert.match(result.invalid.join(","), /provenance\.buildProfile\.matches\.device\.buildProfile/);
  assert.match(result.invalid.join(","), /provenance\.apiEnvironment\.matches\.backendSmoke\.environment/);
});

test("no-screen smoke evidence rejects incomplete camera capture heuristics", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.captureHeuristics = {};
  artifact.cameraPaths.jsFallback.captureHeuristics = {};

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.missing.join(","), /cameraPaths\.nativeCore\.captureHeuristics\.imageSource/);
  assert.match(result.missing.join(","), /cameraPaths\.jsFallback\.captureHeuristics\.uploadedWidth/);
});

test("no-screen smoke evidence rejects camera heuristic upload dimensions that do not match the path", () => {
  const artifact = buildValidArtifact();
  artifact.cameraPaths.nativeCore.captureHeuristics.uploadedHeight = 1;
  artifact.cameraPaths.jsFallback.captureHeuristics.uploadedWidth = 1;

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /cameraPaths\.nativeCore\.captureHeuristics\.uploadedHeightMatchesPath/);
  assert.match(result.invalid.join(","), /cameraPaths\.jsFallback\.captureHeuristics\.uploadedWidthMatchesPath/);
});

test("no-screen smoke evidence rejects raw media and full identifiers", () => {
  const artifact = buildValidArtifact({
    rawImage: "data:image/png;base64,AAAA",
    udid: "00008130-000A001A1178001C",
  });

  const result = validateNoScreenSmokeEvidenceArtifact(artifact);

  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /disallowedKey:rawImage/);
  assert.match(result.invalid.join(","), /disallowedKey:udid/);
  assert.match(result.invalid.join(","), /sensitivePattern/);
});
