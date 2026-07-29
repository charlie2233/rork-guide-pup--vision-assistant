import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { validateEvidencePrivacy } from "./evidence-privacy.mjs";
import { validateNoScreenSmokeEvidenceArtifact } from "./no-screen-smoke-evidence.mjs";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const diagnosticsPath = fileURLToPath(
  new URL("../src/lib/diagnostics.ts", import.meta.url),
);

function loadDiagnosticsModule() {
  const compiled = ts.transpileModule(readFileSync(diagnosticsPath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: diagnosticsPath,
  }).outputText;
  const module = { exports: {} };

  const localRequire = (specifier) => {
    if (specifier === "react") {
      return { useSyncExternalStore: () => undefined };
    }
    if (specifier === "./config") {
      return {
        appConfig: {
          apiBaseUrl: "https://guidepup-api-staging.example.test",
          appEnv: "preview",
          emergencyDisclaimer: "Assistive guidance only.",
          enableExperimentalTabs: false,
          privacyPolicyUrl: "https://guidepup.example/privacy",
          releaseTrack: "internal-preview",
          supportEmail: "support@example.test",
          supportUrl: "https://guidepup.example/support",
          websiteUrl: "https://guidepup.example",
        },
        isConfiguredUrl: () => true,
      };
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled, {
    Date,
    JSON,
    Math,
    Number,
    Object,
    Set,
    String,
    URL,
    exports: module.exports,
    module,
    require: localRequire,
  }, { filename: diagnosticsPath });

  return module.exports;
}

test("diagnostics no-screen draft is privacy-safe and cannot pass launch validation", () => {
  const diagnostics = loadDiagnosticsModule();
  const draft = diagnostics.buildNoScreenSmokeEvidenceDraft(
    diagnostics.getDiagnosticsSnapshot(),
  );
  const privacy = validateEvidencePrivacy(draft);
  const exportedDraft = JSON.parse(JSON.stringify(draft));
  const validation = validateNoScreenSmokeEvidenceArtifact(exportedDraft, {
    expectedAppVersion: "1.0.0",
    expectedBuildNumber: "4",
    expectedBundleIdentifier: "app.rork.guide-pup-vision-assist",
    expectedCandidateBinarySha256: "c".repeat(64),
    expectedSourceRevision: "a".repeat(40),
    requireCandidateBinding: true,
  });

  assert.deepEqual(privacy, {
    disallowedKeys: [],
    sensitivePatterns: [],
  });
  assert.equal(validation.valid, false);
  assert.match(validation.invalid.join(","), /participantRole/);
  assert.match(validation.invalid.join(","), /installationSource/);
  assert.match(validation.missing.join(","), /provenance\.candidateBinarySha256/);
  assert.match(validation.missing.join(","), /commandSequences\.nativeCore\.executionId/);
});

test("populated diagnostics omit scene prose and flag unsafe export content", () => {
  const diagnostics = loadDiagnosticsModule();
  const maliciousScene =
    "Call +1 415-555-0100 or person@example.test; token=super-secret-value "
    + "sk-proj-abcdefghijklmnopqrstuv";
  const maliciousDiagnostic =
    `${maliciousScene} https://example.test/frame?token=abcdefghijklmnopqrstuvwxyz `
    + "/Users/private-user/GuidePup/frame.jpg";

  diagnostics.recordAnalyzeEvent({
    confidence: 0.91,
    direction: "forward",
    error: maliciousDiagnostic,
    fallbackReason: maliciousDiagnostic,
    frameId: maliciousDiagnostic,
    frameSummary: maliciousDiagnostic,
    hazardLevel: "low",
    hasImage: true,
    lighting: "normal",
    message: maliciousDiagnostic,
    model: maliciousDiagnostic,
    nativePath: "native-core",
    obstacle: false,
    outcome: "success",
    priorGuidanceSummary: maliciousDiagnostic,
    promptVersion: "guidepup-vision-v1",
    provider: maliciousDiagnostic,
    requestId: maliciousDiagnostic,
    safeReason: maliciousDiagnostic,
    sampledFrame: true,
    sceneDescription: maliciousDiagnostic,
    sessionId: maliciousDiagnostic,
    surfaceType: maliciousDiagnostic,
    walkability: "clear",
  });
  diagnostics.recordSessionBootstrapState({
    error: maliciousDiagnostic,
    requestId: maliciousDiagnostic,
    status: "failed",
  });
  diagnostics.recordHealthCheckSnapshot({
    benchmarkProviders: [maliciousDiagnostic],
    defaultModel: maliciousDiagnostic,
    defaultProvider: maliciousDiagnostic,
    environment: maliciousDiagnostic,
    error: maliciousDiagnostic,
    ok: false,
    promptVersion: maliciousDiagnostic,
    requestId: maliciousDiagnostic,
  });
  diagnostics.recordNavigationLoopSnapshot({ lastError: maliciousDiagnostic });
  diagnostics.recordVoiceSnapshot({
    lastError: maliciousDiagnostic,
    lastRecognizedCommand: maliciousDiagnostic,
    microphonePermission: maliciousDiagnostic,
    speechPermission: maliciousDiagnostic,
  });
  diagnostics.recordAudioCueSnapshot({
    error: maliciousDiagnostic,
    outcome: "failure",
    type: maliciousDiagnostic,
  });
  diagnostics.recordHapticSnapshot({
    error: maliciousDiagnostic,
    outcome: "failure",
    type: maliciousDiagnostic,
  });

  const snapshot = diagnostics.getDiagnosticsSnapshot();
  const snapshotJson = JSON.stringify(snapshot);
  const draft = diagnostics.buildNoScreenSmokeEvidenceDraft(snapshot);
  const draftJson = JSON.stringify(draft);
  const report = diagnostics.buildDiagnosticsReport(snapshot);

  assert.equal(draft.cameraPaths.nativeCore.frameSummary, "");
  assert.doesNotMatch(
    snapshotJson,
    /person@example\.test|415-555-0100|super-secret-value|sk-proj-|example\.test\/frame|private-user/,
  );
  for (const field of [
    snapshot.session.error,
    snapshot.voice.lastError,
    snapshot.navigationLoop.lastError,
    snapshot.audioCue.lastError,
    snapshot.haptics.lastError,
    snapshot.lastHealthCheck.error,
    snapshot.lastAnalyze.error,
    snapshot.lastAnalyze.fallbackReason,
    snapshot.lastAnalyze.frameSummary,
    snapshot.lastAnalyze.message,
    snapshot.lastAnalyze.priorGuidanceSummary,
    snapshot.lastAnalyze.safeReason,
    snapshot.lastAnalyze.sceneDescription,
    snapshot.lastAnalyze.surfaceType,
  ]) {
    assert.equal(field, "Content omitted");
  }
  assert.doesNotMatch(draftJson, /person@example\.test|415-555-0100|super-secret-value|sk-proj-/);
  assert.doesNotMatch(report, /person@example\.test|415-555-0100|super-secret-value|sk-proj-/);
  assert.deepEqual(
    Array.from(diagnostics.findDiagnosticsExportPrivacyIssues(draftJson)),
    [],
  );
  assert.deepEqual(
    Array.from(diagnostics.findDiagnosticsExportPrivacyIssues(maliciousScene)).sort(),
    ["email address", "keyed secret", "phone number", "provider key"].sort(),
  );
  assert.deepEqual(
    Array.from(
      diagnostics.findDiagnosticsExportPrivacyIssues(
        '"refresh_token":"abcdefghijklmnopqrstuvwxyz123456" '
        + '"clientSecret":"abcdefghijklmnopqrstuvwxyz123456" 4155550100',
      ),
    ).sort(),
    ["keyed secret", "phone number"].sort(),
  );
});

test("diagnostics bind bounded Worker health provenance and per-lane request IDs", () => {
  const diagnostics = loadDiagnosticsModule();
  const sourceRevision = "a".repeat(40);
  const workerVersionId = "2f426d7b-44de-4bb7-8c5f-8d381eabc234";
  const guidanceRequestId = "3f426d7b-44de-4bb7-8c5f-8d381eabc235";
  const sceneQueryRequestId = "4f426d7b-44de-4bb7-8c5f-8d381eabc236";

  diagnostics.recordHealthCheckSnapshot({
    analyzeDeviceRateLimitPerMinute: 20,
    analyzeIpRateLimitPerMinute: 60,
    benchmarkProviders: ["openai-compatible"],
    bootstrapIpRateLimitPerMinute: 10,
    defaultMaxCompletionTokens: 700,
    defaultModel: "gpt-5.6-sol",
    defaultProvider: "openai-compatible",
    defaultReasoningEffort: "low",
    defaultRequestTimeoutMs: 8500,
    defaultRetryCount: 1,
    defaultRetryDelayMs: 250,
    deploymentIdentityValid: true,
    environment: "staging",
    ok: true,
    promptVersion: "guidepup-vision-v1",
    providerGlobalCallLimitPerMinute: 120,
    requestId: "1f426d7b-44de-4bb7-8c5f-8d381eabc233",
    sessionTtlSeconds: 3600,
    sourceRevision,
    structuredOutputMode: "json_schema_strict",
    workerIdentity: "guidepup-api-staging",
    workerVersionId,
  });
  diagnostics.recordAnalyzeEvent({
    interactionMode: "guidance",
    outcome: "success",
    requestId: guidanceRequestId,
  });
  diagnostics.recordAnalyzeEvent({
    interactionMode: "scene-query",
    outcome: "success",
    requestId: sceneQueryRequestId,
  });

  const snapshot = diagnostics.getDiagnosticsSnapshot();
  const draft = diagnostics.buildNoScreenSmokeEvidenceDraft(snapshot);

  assert.equal(snapshot.lastHealthCheck.sourceRevision, sourceRevision);
  assert.equal(snapshot.lastHealthCheck.workerIdentity, "guidepup-api-staging");
  assert.equal(snapshot.lastHealthCheck.workerVersionId, workerVersionId);
  assert.equal(snapshot.lastHealthCheck.deploymentIdentityValid, true);
  assert.equal(snapshot.lastHealthCheck.defaultMaxCompletionTokens, 700);
  assert.equal(snapshot.lastHealthCheck.defaultRequestTimeoutMs, 8500);
  assert.equal(snapshot.lastHealthCheck.defaultRetryCount, 1);
  assert.equal(snapshot.lastHealthCheck.defaultRetryDelayMs, 250);
  assert.equal(snapshot.lastHealthCheck.structuredOutputMode, "json_schema_strict");
  assert.equal("apiUrl" in snapshot.lastHealthCheck, false);
  assert.equal(draft.backendSmoke.provenance.sourceRevision, sourceRevision);
  assert.equal(draft.backendSmoke.provenance.workerVersionId, workerVersionId);
  assert.equal(draft.backendSmoke.requestIds.guidanceAnalyze, guidanceRequestId);
  assert.equal(draft.backendSmoke.requestIds.sceneQueryAnalyze, sceneQueryRequestId);
  assert.deepEqual(validateEvidencePrivacy(draft), {
    disallowedKeys: [],
    sensitivePatterns: [],
  });
});
