import assert from "node:assert/strict";
import test from "node:test";
import {
  SMOKE_ARTIFACT_VERSION,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
  buildLaunchContract,
  validateSmokeArtifactContract,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";
import { validateEvidencePrivacy } from "./evidence-privacy.mjs";

const NOW_MS = Date.parse("2026-07-18T20:00:00.000Z");
const SOURCE_REVISION = "a".repeat(40);

function buildEnvelope(interactionMode) {
  return {
    appVersion: "1.0.0",
    captureHeuristics: {
      frameAgeMs: 0,
      imageSource: "base64",
      resizedForUpload: false,
      uploadedHeight: 40,
      uploadedWidth: 40,
    },
    detail: "low",
    frameId: `smoke-${interactionMode}-frame`,
    frameSummary:
      `Synthetic sampled js-fallback ${interactionMode} smoke frame, source 40x40, upload 40x40.`,
    hasImage: true,
    interactionMode,
    mimeType: "image/png",
    nativePath: "js-fallback",
    platform: "ios",
    priorGuidance: "Synthetic smoke context.",
    sampledFrame: true,
    sessionId: "smoke-session-1",
    sourceHeight: 40,
    sourceWidth: 40,
    timestampMs: NOW_MS - 1000,
  };
}

function buildAnalyze(interactionMode, requestId) {
  return {
    confidence: 0.82,
    direction: "stop",
    executionPath: "provider-backed",
    fallbackReason: null,
    hazardLevel: "medium",
    interactionMode,
    latencyMs: 900,
    lighting: "normal",
    message: "Stop. Chair ahead.",
    model: "gpt-5.5-2026-05-22",
    obstacle: true,
    promptVersion: "2026-05-22.v1",
    provider: "openai-compatible",
    requestId,
    roundTripLatencyMs: 1200,
    sceneDescription: "A chair is in the center of the walking path.",
    statusCode: 200,
    statusText: "OK",
    structuredOutputInvalidFields: [],
    structuredOutputMissingFields: [],
    structuredOutputValid: true,
    surfaceType: "indoor floor",
    walkability: "caution",
  };
}

function buildValidSmokeArtifact(overrides = {}) {
  const generatedAt = new Date(NOW_MS - 1000).toISOString();
  const artifact = {
    apiUrl: "https://guidepup-api-production.example.test",
    artifactVersion: SMOKE_ARTIFACT_VERSION,
    bootstrap: {
      deviceIdSuffix: "abcdef12",
      requestId: "22222222-2222-4222-8222-222222222222",
      statusCode: 200,
      statusText: "OK",
    },
    environment: "production",
    freshness: {
      expiresAt: new Date(Date.parse(generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString(),
      maxAgeSeconds: SMOKE_EVIDENCE_MAX_AGE_SECONDS,
    },
    generatedAt,
    health: {
      defaultMaxCompletionTokens: 700,
      defaultModel: "gpt-5.5",
      defaultProvider: "openai-compatible",
      defaultRequestTimeoutMs: 12000,
      defaultRetryCount: 1,
      defaultRetryDelayMs: 250,
      promptVersion: "2026-05-22.v1",
      requestId: "11111111-1111-4111-8111-111111111111",
      statusCode: 200,
      statusText: "OK",
      structuredOutputMode: "json_schema_strict",
    },
    lanes: {
      guidance: {
        analyze: buildAnalyze("guidance", "33333333-3333-4333-8333-333333333333"),
        interactionMode: "guidance",
        requestEnvelope: buildEnvelope("guidance"),
      },
      "scene-query": {
        analyze: buildAnalyze("scene-query", "44444444-4444-4444-8444-444444444444"),
        interactionMode: "scene-query",
        requestEnvelope: buildEnvelope("scene-query"),
      },
    },
    operator: "Codex",
    provenance: {
      sourceRevision: SOURCE_REVISION,
      workerDeploymentId: "55555555-5555-4555-8555-555555555555",
      workerVersionCreatedAt: "2026-07-18T19:55:00.000Z",
      workerVersionId: "66666666-6666-4666-8666-666666666666",
    },
    providerBacked: true,
    ...overrides,
  };
  artifact.launchContract = buildLaunchContract({ artifact });
  return artifact;
}

function assertPrivacyValid(artifact) {
  const result = validateEvidencePrivacy(artifact);
  assert.deepEqual(result.disallowedKeys, []);
  assert.deepEqual(result.sensitivePatterns, []);
}

function assertPrivacyInvalid(artifact, expectedInvalidFragment) {
  const result = validateEvidencePrivacy(artifact);
  const findings = [...result.disallowedKeys, ...result.sensitivePatterns];
  assert.ok(
    findings.some((finding) => finding.includes(expectedInvalidFragment)),
    `Expected privacy finding containing "${expectedInvalidFragment}", got ${JSON.stringify(findings)}`,
  );
}

test("valid dual-lane smoke artifact has no privacy findings and passes its contract", () => {
  const artifact = buildValidSmokeArtifact();
  assertPrivacyValid(artifact);
  assert.deepEqual(
    validateSmokeArtifactContract(artifact, {
      expectedApiUrl: artifact.apiUrl,
      expectedEnvironment: "production",
      expectedModel: "gpt-5.5",
      expectedPromptVersion: "2026-05-22.v1",
      expectedSourceRevision: SOURCE_REVISION,
      nowMs: NOW_MS,
    }),
    { invalid: [], missing: [], valid: true },
  );
});

test("smoke artifact rejects raw image payload fields", () => {
  const artifact = buildValidSmokeArtifact();
  artifact.lanes.guidance.requestEnvelope.imageBase64 = "a".repeat(240);
  assertPrivacyInvalid(artifact, "lanes.guidance.requestEnvelope.imageBase64");
});

test("smoke artifact rejects bootstrap session tokens", () => {
  const artifact = buildValidSmokeArtifact();
  artifact.bootstrap.sessionToken = "session-secret-token";
  assertPrivacyInvalid(artifact, "bootstrap.sessionToken");
});

test("smoke artifact rejects raw media snippets", () => {
  assertPrivacyInvalid(
    buildValidSmokeArtifact({ rawText: `data:image/png;base64,${"a".repeat(240)}` }),
    "data media base64 payload",
  );
});

test("smoke artifact rejects bearer tokens and signed URLs", () => {
  const artifact = buildValidSmokeArtifact();
  artifact.authorization = `Bearer ${"t".repeat(64)}`;
  artifact.signedUrl = "https://example.test/image.png?X-Amz-Signature=abc123";
  assertPrivacyInvalid(artifact, "authorization");
});
