import assert from "node:assert/strict";
import test from "node:test";
import { validateEvidencePrivacy } from "./evidence-privacy.mjs";

function buildValidSmokeArtifact(overrides = {}) {
  return {
    analyze: {
      confidence: 0.82,
      direction: "stop",
      executionPath: "provider-backed",
      fallbackReason: null,
      hazardLevel: "medium",
      latencyMs: 900,
      lighting: "normal",
      message: "Stop. Chair ahead.",
      model: "gpt-5.5-2026-05-22",
      obstacle: true,
      promptVersion: "2026-05-22.v1",
      provider: "openai-compatible",
      requestId: "33333333-3333-4333-8333-333333333333",
      roundTripLatencyMs: 1200,
      sceneDescription: "A chair is in the center of the walking path.",
      statusCode: 200,
      structuredOutputInvalidFields: [],
      structuredOutputMissingFields: [],
      structuredOutputValid: true,
      surfaceType: "indoor floor",
      walkability: "caution",
    },
    apiUrl: "https://guidepup-api-production.example.test",
    bootstrap: {
      deviceIdSuffix: "abcdef12",
      expiresAt: "2026-05-24T17:39:06.000Z",
      promptVersion: "2026-05-22.v1",
      rateLimitPerMinute: 20,
      requestId: "22222222-2222-4222-8222-222222222222",
      roundTripLatencyMs: 50,
      statusCode: 200,
      statusText: "OK",
    },
    environment: "production",
    generatedAt: "2026-05-23T17:39:07.965Z",
    health: {
      defaultMaxCompletionTokens: 700,
      defaultModel: "gpt-5.5",
      defaultProvider: "openai-compatible",
      defaultRequestTimeoutMs: 12000,
      defaultRetryCount: 1,
      defaultRetryDelayMs: 250,
      environment: "production",
      promptVersion: "2026-05-22.v1",
      requestId: "11111111-1111-4111-8111-111111111111",
      roundTripLatencyMs: 100,
      statusCode: 200,
      statusText: "OK",
    },
    operator: "Codex",
    providerBacked: true,
    requestEnvelope: {
      appVersion: "1.0.0",
      captureHeuristics: {
        frameAgeMs: 0,
        imageSource: "base64",
        resizedForUpload: false,
        uploadedHeight: 40,
        uploadedWidth: 40,
      },
      detail: "low",
      frameId: "smoke-frame-1",
      frameSummary: "Synthetic sampled js-fallback smoke frame, source 40x40, upload 40x40.",
      hasImage: true,
      mimeType: "image/png",
      nativePath: "js-fallback",
      platform: "ios",
      priorGuidance: "Synthetic smoke sample; no previous spoken guidance.",
      sampledFrame: true,
      sessionId: "smoke-session-1",
      sourceHeight: 40,
      sourceWidth: 40,
      timestampMs: 1779557946041,
    },
    ...overrides,
  };
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

test("valid provider-backed smoke artifact has no privacy findings", () => {
  assertPrivacyValid(buildValidSmokeArtifact());
});

test("smoke artifact rejects raw image payload fields", () => {
  assertPrivacyInvalid(
    buildValidSmokeArtifact({
      requestEnvelope: {
        ...buildValidSmokeArtifact().requestEnvelope,
        imageBase64: "a".repeat(240),
      },
    }),
    "requestEnvelope.imageBase64",
  );
});

test("smoke artifact rejects bootstrap session tokens", () => {
  assertPrivacyInvalid(
    buildValidSmokeArtifact({
      bootstrap: {
        ...buildValidSmokeArtifact().bootstrap,
        sessionToken: "session-secret-token",
      },
    }),
    "bootstrap.sessionToken",
  );
});

test("smoke artifact rejects raw media snippets", () => {
  assertPrivacyInvalid(
    buildValidSmokeArtifact({
      rawText: `data:image/png;base64,${"a".repeat(240)}`,
    }),
    "data:(?:image|audio)",
  );
});

test("smoke artifact rejects bearer tokens and signed URLs", () => {
  assertPrivacyInvalid(
    buildValidSmokeArtifact({
      authorization: `Bearer ${"t".repeat(64)}`,
      signedUrl: "https://example.test/image.png?X-Amz-Signature=abc123",
    }),
    "authorization",
  );
});
