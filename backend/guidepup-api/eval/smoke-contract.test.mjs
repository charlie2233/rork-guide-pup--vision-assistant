import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assertBackendSourceIsClean, buildWranglerDeployArgs } from "./deploy-with-provenance.mjs";
import {
  buildAnalyzeRequestPayload,
  buildSmokeArtifact,
  formatSmokeArtifactStdout,
  parseWorkerDeploymentStatus,
  parseWorkerVersionProvenance,
  runAnalyzeLanes,
  sanitizeAnalyzeRequestEnvelope,
  writeSmokeOutputsIfValid,
} from "./run-live-smoke.mjs";
import {
  SMOKE_ARTIFACT_VERSION,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
  buildLaunchContract,
  validateAnalyzeSafetyContract,
  validateSmokeArtifactContract,
} from "./smoke-contract.mjs";

const NOW_MS = Date.parse("2026-07-18T20:00:00.000Z");
const SOURCE_REVISION = "a".repeat(40);
const WORKER_IDENTITY = "guidepup-api-production";
const WORKER_VERSION_ID = "66666666-6666-4666-8666-666666666666";

function buildLane(interactionMode, requestId) {
  const payload = buildAnalyzeRequestPayload("production", interactionMode, NOW_MS - 1000);
  return {
    analyze: {
      confidence: 0.82,
      direction: "stop",
      executionPath: "provider-backed",
      fallbackReason: null,
      hazardLevel: "medium",
      interactionMode,
      latencyMs: 900,
      lighting: "normal",
      message: "Stop. Chair ahead.",
      model: "gpt-5.6-sol",
      obstacle: true,
      promptVersion: "2026-07-18.v1",
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
    },
    interactionMode,
    requestEnvelope: sanitizeAnalyzeRequestEnvelope(payload),
  };
}

export function buildValidSmokeArtifact(overrides = {}) {
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
      analyzeDeviceRateLimitPerMinute: 20,
      analyzeIpRateLimitPerMinute: 60,
      apiUrl: "https://guidepup-api-production.example.test",
      bootstrapIpRateLimitPerMinute: 10,
      defaultMaxCompletionTokens: 700,
      defaultModel: "gpt-5.6-sol",
      defaultProvider: "openai-compatible",
      defaultRequestTimeoutMs: 8500,
      defaultRetryCount: 1,
      defaultRetryDelayMs: 250,
      deploymentIdentityValid: true,
      environment: "production",
      expectedApiUrl: "https://guidepup-api-production.example.test",
      promptVersion: "2026-07-18.v1",
      providerGlobalCallLimitPerMinute: 120,
      requestId: "11111111-1111-4111-8111-111111111111",
      statusCode: 200,
      statusText: "OK",
      sessionTtlSeconds: 3600,
      sourceRevision: SOURCE_REVISION,
      structuredOutputMode: "json_schema_strict",
      workerIdentity: WORKER_IDENTITY,
      workerVersionId: WORKER_VERSION_ID,
    },
    lanes: {
      guidance: buildLane("guidance", "33333333-3333-4333-8333-333333333333"),
      "scene-query": buildLane("scene-query", "44444444-4444-4444-8444-444444444444"),
    },
    operator: "Contract test",
    provenance: {
      sourceRevision: SOURCE_REVISION,
      workerDeploymentId: "55555555-5555-4555-8555-555555555555",
      workerIdentity: WORKER_IDENTITY,
      workerVersionCreatedAt: "2026-07-18T19:55:00.000Z",
      workerVersionId: WORKER_VERSION_ID,
    },
    providerBacked: true,
  };
  Object.assign(artifact, overrides);
  artifact.launchContract = buildLaunchContract({ artifact });
  return artifact;
}

function validate(artifact, overrides = {}) {
  return validateSmokeArtifactContract(artifact, {
    expectedApiUrl: "https://guidepup-api-production.example.test",
    expectedEnvironment: "production",
    expectedModel: "gpt-5.6-sol",
    expectedPromptVersion: "2026-07-18.v1",
    expectedSourceRevision: SOURCE_REVISION,
    expectedWorkerIdentity: WORKER_IDENTITY,
    expectedWorkerVersionId: WORKER_VERSION_ID,
    requireAggregateControls: true,
    requireRuntimeIdentity: true,
    nowMs: NOW_MS,
    ...overrides,
  });
}

test("dual-lane provider-backed artifact satisfies the release contract", () => {
  assert.deepEqual(validate(buildValidSmokeArtifact()), { invalid: [], missing: [], valid: true });
});

test("actual runner artifact construction accepts bounded benchmark providers", () => {
  const artifact = buildSmokeArtifact({
    apiUrl: "https://guidepup-api-production.example.test",
    bootstrap: {
      json: {
        expiresAt: "2026-07-18T21:00:00.000Z",
        promptVersion: "2026-07-18.v1",
        rateLimitPerMinute: 20,
      },
      requestId: "22222222-2222-4222-8222-222222222222",
      response: { status: 200, statusText: "OK" },
      roundTripLatencyMs: 100,
    },
    deviceId: "smoke-device-abcdef12",
    environment: "production",
    generatedAt: new Date(NOW_MS - 1000).toISOString(),
    health: {
      json: {
        analyzeDeviceRateLimitPerMinute: 20,
        analyzeIpRateLimitPerMinute: 60,
        apiUrl: "https://guidepup-api-production.example.test",
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
        environment: "production",
        expectedApiUrl: "https://guidepup-api-production.example.test",
        promptVersion: "2026-07-18.v1",
        providerGlobalCallLimitPerMinute: 120,
        sessionTtlSeconds: 3600,
        sourceRevision: SOURCE_REVISION,
        structuredOutputMode: "json_schema_strict",
        workerIdentity: WORKER_IDENTITY,
        workerVersionId: WORKER_VERSION_ID,
      },
      requestId: "11111111-1111-4111-8111-111111111111",
      response: { status: 200, statusText: "OK" },
      roundTripLatencyMs: 80,
    },
    lanes: {
      guidance: buildLane("guidance", "33333333-3333-4333-8333-333333333333"),
      "scene-query": buildLane("scene-query", "44444444-4444-4444-8444-444444444444"),
    },
    operator: "Runner contract test",
    provenance: {
      sourceRevision: SOURCE_REVISION,
      workerDeploymentId: "55555555-5555-4555-8555-555555555555",
      workerIdentity: WORKER_IDENTITY,
      workerVersionCreatedAt: "2026-07-18T19:55:00.000Z",
      workerVersionId: WORKER_VERSION_ID,
    },
  });

  assert.deepEqual(artifact.health.benchmarkProviders, ["openai-compatible"]);
  assert.deepEqual(validate(artifact), { invalid: [], missing: [], valid: true });
});

test("smoke contract rejects unbounded or duplicate benchmark provider metadata", () => {
  for (const benchmarkProviders of [
    ["openai-compatible", "openai-compatible"],
    ["a", "b", "c", "d", "e"],
    ["provider with spaces"],
  ]) {
    const artifact = buildValidSmokeArtifact();
    artifact.health.benchmarkProviders = benchmarkProviders;
    artifact.launchContract = buildLaunchContract({ artifact });
    const result = validate(artifact);

    assert.equal(result.valid, false);
    assert.ok(result.invalid.includes("health.benchmarkProviders"));
  }
});

test("smoke contract rejects unexpected fields recursively", () => {
  const artifact = buildValidSmokeArtifact();
  artifact.lanes.guidance.analyze.opaqueEvidence = "synthetic";
  artifact.launchContract = buildLaunchContract({ artifact });

  const result = validate(artifact);

  assert.equal(result.valid, false);
  assert.match(
    result.invalid.join(","),
    /unexpectedField:lanes\.guidance\.analyze\.opaqueEvidence/,
  );
});

test("runner sends explicit interaction modes and strips image bytes from evidence", () => {
  for (const interactionMode of ["guidance", "scene-query"]) {
    const payload = buildAnalyzeRequestPayload("production", interactionMode, NOW_MS);
    const envelope = sanitizeAnalyzeRequestEnvelope(payload);
    assert.equal(payload.interactionMode, interactionMode);
    assert.equal(envelope.interactionMode, interactionMode);
    assert.equal("imageBase64" in envelope, false);
    assert.equal("authorization" in envelope, false);
  }
});

test("live analyze orchestration executes both explicit lanes with distinct request IDs", async () => {
  const calls = [];
  const requestIds = [
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
  ];
  const lanes = await runAnalyzeLanes({
    apiUrl: "https://guidepup-api-production.example.test",
    deviceId: "test-device-id",
    env: "production",
    async fetcher(url, init) {
      const payload = JSON.parse(init.body);
      calls.push({ payload, url });
      return {
        json: {
          confidence: 0.9,
          direction: "forward",
          fallbackReason: null,
          hazardLevel: "none",
          latencyMs: 500,
          lighting: "normal",
          message: "Continue forward.",
          model: "gpt-5.6-sol",
          obstacle: false,
          promptVersion: "2026-07-18.v1",
          provider: "openai-compatible",
          sceneDescription: "A clear indoor path.",
          surfaceType: "indoor floor",
          walkability: "clear",
        },
        requestId: requestIds[calls.length - 1],
        response: { ok: true, status: 200, statusText: "OK" },
        roundTripLatencyMs: 600,
      };
    },
    runTimestampMs: NOW_MS,
    sessionToken: "test-session-token",
  });

  assert.deepEqual(calls.map((call) => call.payload.interactionMode), ["guidance", "scene-query"]);
  assert.ok(calls.every((call) => call.url.endsWith("/v1/vision/analyze")));
  assert.ok(calls.every((call) => typeof call.payload.imageBase64 === "string"));
  assert.deepEqual(
    [lanes.guidance.analyze.requestId, lanes["scene-query"].analyze.requestId],
    requestIds,
  );
  assert.equal("imageBase64" in lanes.guidance.requestEnvelope, false);
  assert.equal("imageBase64" in lanes["scene-query"].requestEnvelope, false);
});

test("single-lane and duplicate-request evidence are launch-invalid", () => {
  const singleLane = buildValidSmokeArtifact();
  delete singleLane.lanes["scene-query"];
  singleLane.launchContract = buildLaunchContract({ artifact: singleLane });
  const singleLaneResult = validate(singleLane);
  assert.equal(singleLaneResult.valid, false);
  assert.match(singleLaneResult.missing.join(","), /lanes\.scene-query/);

  const duplicateRequest = buildValidSmokeArtifact();
  duplicateRequest.lanes["scene-query"].analyze.requestId = duplicateRequest.lanes.guidance.analyze.requestId;
  duplicateRequest.launchContract = buildLaunchContract({ artifact: duplicateRequest });
  const duplicateResult = validate(duplicateRequest);
  assert.equal(duplicateResult.valid, false);
  assert.match(duplicateResult.invalid.join(","), /requestIds\.distinct/);
});

test("each lane rejects contradictory forward safety fields", () => {
  for (const mode of ["guidance", "scene-query"]) {
    const artifact = buildValidSmokeArtifact();
    Object.assign(artifact.lanes[mode].analyze, {
      direction: "forward",
      message: "Continue forward.",
    });
    artifact.launchContract = buildLaunchContract({ artifact });
    const result = validate(artifact);
    assert.equal(result.valid, false);
    assert.match(result.invalid.join(","), new RegExp(`lanes\\.${mode}\\.analyze\\.safety\\.unsafe-forward`));
  }
});

test("smoke STOP validation exactly covers every normalized runtime cause", () => {
  const clear = {
    confidence: 0.9,
    direction: "turn-left",
    fallbackReason: null,
    hazardLevel: "none",
    lighting: "normal",
    message: "Turn left carefully.",
    obstacle: false,
    walkability: "clear",
  };
  const cases = [
    ["confidence below 0.65", { confidence: 0.649 }],
    ["obstacle", { obstacle: true }],
    ["medium hazard", { hazardLevel: "medium" }],
    ["high hazard", { hazardLevel: "high" }],
    ["caution walkability", { walkability: "caution" }],
    ["uncertain walkability", { walkability: "uncertain" }],
    ["dim lighting", { lighting: "dim" }],
    ["dark lighting", { lighting: "dark" }],
    ["unknown lighting", { lighting: "unknown" }],
    ["fallback reason", { fallbackReason: "provider-error" }],
  ];

  assert.deepEqual(validateAnalyzeSafetyContract(clear), { invalid: [], valid: true });
  assert.deepEqual(
    validateAnalyzeSafetyContract({ ...clear, confidence: 0.65 }),
    { invalid: [], valid: true },
  );
  for (const [name, override] of cases) {
    const result = validateAnalyzeSafetyContract({ ...clear, ...override });
    assert.equal(result.valid, false, name);
    assert.ok(result.invalid.includes("stop-required"), name);
  }

  assert.deepEqual(validateAnalyzeSafetyContract({
    ...clear,
    direction: "stop",
    message: "Stop. Provider requested a stop.",
  }), { invalid: [], valid: true });
  assert.deepEqual(validateAnalyzeSafetyContract({
    ...clear,
    direction: "stop",
    message: "Continue forward.",
  }), { invalid: ["stop-message"], valid: false });
});

test("runtime health identity must match the endpoint and authenticated active version", () => {
  const mutations = [
    ["apiUrl", "https://wrong-account.example.test"],
    ["expectedApiUrl", "https://wrong-account.example.test"],
    ["environment", "staging"],
    ["sourceRevision", "b".repeat(40)],
    ["workerIdentity", "guidepup-api-wrong-account"],
    ["workerVersionId", "99999999-9999-4999-8999-999999999999"],
    ["deploymentIdentityValid", false],
  ];

  for (const [field, value] of mutations) {
    const artifact = buildValidSmokeArtifact();
    artifact.health[field] = value;
    artifact.launchContract = buildLaunchContract({ artifact });
    const result = validate(artifact);
    assert.equal(result.valid, false, field);
    assert.match(result.invalid.join(","), /health\.runtime-identity|launchContract\.runtimeIdentityBound/, field);
  }
});

test("stale, mismatched-revision, and missing-deployment evidence are launch-invalid", () => {
  const stale = buildValidSmokeArtifact();
  stale.generatedAt = "2026-07-16T20:00:00.000Z";
  stale.freshness.expiresAt = "2026-07-17T20:00:00.000Z";
  stale.launchContract = buildLaunchContract({ artifact: stale });
  assert.match(validate(stale).invalid.join(","), /freshness\.expired/);

  const mismatched = buildValidSmokeArtifact();
  mismatched.provenance.sourceRevision = "b".repeat(40);
  mismatched.launchContract = buildLaunchContract({ artifact: mismatched });
  assert.match(validate(mismatched).invalid.join(","), /provenance\.sourceRevision-mismatch/);

  const missingDeployment = buildValidSmokeArtifact();
  delete missingDeployment.provenance.workerDeploymentId;
  missingDeployment.launchContract = buildLaunchContract({ artifact: missingDeployment });
  const missingResult = validate(missingDeployment);
  assert.match(missingResult.missing.join(","), /provenance\.workerDeploymentId/);
});

test("historical v1 evidence remains readable but is launch-invalid", () => {
  const current = buildValidSmokeArtifact();
  const historical = {
    ...current,
    analyze: current.lanes.guidance.analyze,
    artifactVersion: 1,
    requestEnvelope: current.lanes.guidance.requestEnvelope,
  };
  delete historical.lanes;
  historical.launchContract = { valid: true };

  const result = validate(historical);
  assert.equal(result.valid, false);
  assert.match(result.invalid.join(","), /artifactVersion/);
  assert.match(result.missing.join(","), /lanes\.guidance/);
});

test("launch-invalid smoke never overwrites latest outputs", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "guidepup-smoke-output-"));
  const outputJsonPath = path.join(outputDir, "smoke-results-production.latest.json");
  const outputMdPath = path.join(outputDir, "smoke-results-production.latest.md");
  const validationOptions = {
    expectedApiUrl: "https://guidepup-api-production.example.test",
    expectedEnvironment: "production",
    expectedModel: "gpt-5.6-sol",
    expectedPromptVersion: "2026-07-18.v1",
    expectedSourceRevision: SOURCE_REVISION,
    expectedWorkerIdentity: WORKER_IDENTITY,
    expectedWorkerVersionId: WORKER_VERSION_ID,
    requireAggregateControls: true,
    requireRuntimeIdentity: true,
    nowMs: NOW_MS,
  };

  try {
    writeFileSync(outputJsonPath, "existing-json\n");
    writeFileSync(outputMdPath, "existing-markdown\n");
    const invalid = buildValidSmokeArtifact();
    invalid.lanes.guidance.analyze.model = "wrong-model";
    invalid.launchContract = buildLaunchContract({ artifact: invalid });
    const rejected = writeSmokeOutputsIfValid(invalid, {
      outputJsonPath,
      outputMdPath,
      validationOptions,
    });
    assert.equal(rejected.written, false);
    assert.match(rejected.issues.join(","), /lanes\.guidance\.analyze\.model/);
    assert.equal(readFileSync(outputJsonPath, "utf8"), "existing-json\n");
    assert.equal(readFileSync(outputMdPath, "utf8"), "existing-markdown\n");

    const valid = buildValidSmokeArtifact();
    const accepted = writeSmokeOutputsIfValid(valid, {
      outputJsonPath,
      outputMdPath,
      validationOptions,
    });
    assert.deepEqual(accepted, { issues: [], privacySafe: true, written: true });
    assert.equal(JSON.parse(readFileSync(outputJsonPath, "utf8")).artifactVersion, SMOKE_ARTIFACT_VERSION);
    assert.match(readFileSync(outputMdPath, "utf8"), /## Analyze lanes/);
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
});

test("privacy-invalid smoke is suppressed and never overwrites latest outputs", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "guidepup-smoke-privacy-"));
  const outputJsonPath = path.join(outputDir, "smoke-results-production.latest.json");
  const outputMdPath = path.join(outputDir, "smoke-results-production.latest.md");
  const artifact = buildValidSmokeArtifact();
  artifact.lanes.guidance.requestEnvelope.imageBase64 = "raw-image-material";
  artifact.sessionToken = "secret-session-token";

  try {
    writeFileSync(outputJsonPath, "existing-json\n");
    writeFileSync(outputMdPath, "existing-markdown\n");
    const result = writeSmokeOutputsIfValid(artifact, {
      outputJsonPath,
      outputMdPath,
      validationOptions: {
        expectedApiUrl: "https://guidepup-api-production.example.test",
        expectedEnvironment: "production",
        expectedModel: "gpt-5.6-sol",
        expectedPromptVersion: "2026-07-18.v1",
        expectedSourceRevision: SOURCE_REVISION,
        expectedWorkerIdentity: WORKER_IDENTITY,
        expectedWorkerVersionId: WORKER_VERSION_ID,
        requireAggregateControls: true,
        requireRuntimeIdentity: true,
        nowMs: NOW_MS,
      },
    });
    assert.equal(result.written, false);
    assert.equal(result.privacySafe, false);
    assert.match(result.issues.join(","), /privacy disallowed field lanes\.guidance\.requestEnvelope\.imageBase64/);
    assert.equal(readFileSync(outputJsonPath, "utf8"), "existing-json\n");
    assert.equal(readFileSync(outputMdPath, "utf8"), "existing-markdown\n");
    const stdout = formatSmokeArtifactStdout(artifact);
    assert.equal(stdout, '{\n  "privacySafe": false,\n  "suppressed": true\n}\n');
    assert.doesNotMatch(stdout, /raw-image-material|secret-session-token/);
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
});

test("latest JSON and Markdown roll back together when promotion fails", () => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "guidepup-smoke-rollback-"));
  const outputJsonPath = path.join(outputDir, "smoke-results-production.latest.json");
  const outputMdPath = path.join(outputDir, "smoke-results-production.latest.md");
  const validationOptions = {
    expectedApiUrl: "https://guidepup-api-production.example.test",
    expectedEnvironment: "production",
    expectedModel: "gpt-5.6-sol",
    expectedPromptVersion: "2026-07-18.v1",
    expectedSourceRevision: SOURCE_REVISION,
    expectedWorkerIdentity: WORKER_IDENTITY,
    expectedWorkerVersionId: WORKER_VERSION_ID,
    requireAggregateControls: true,
    requireRuntimeIdentity: true,
    nowMs: NOW_MS,
  };
  let renameCount = 0;
  const failingFileSystem = {
    ...fs,
    renameSync(...args) {
      renameCount += 1;
      if (renameCount === 4) {
        throw new Error("synthetic second-output promotion failure");
      }
      return fs.renameSync(...args);
    },
  };

  try {
    writeFileSync(outputJsonPath, "existing-json\n");
    writeFileSync(outputMdPath, "existing-markdown\n");
    assert.throws(
      () =>
        writeSmokeOutputsIfValid(buildValidSmokeArtifact(), {
          fileSystem: failingFileSystem,
          outputJsonPath,
          outputMdPath,
          validationOptions,
        }),
      /synthetic second-output promotion failure/,
    );
    assert.equal(readFileSync(outputJsonPath, "utf8"), "existing-json\n");
    assert.equal(readFileSync(outputMdPath, "utf8"), "existing-markdown\n");
  } finally {
    rmSync(outputDir, { force: true, recursive: true });
  }
});

test("Worker provenance requires one 100 percent version stamped with the Git revision", () => {
  const deployment = parseWorkerDeploymentStatus(
    {
      id: "77777777-7777-4777-8777-777777777777",
      versions: [{ percentage: 100, version_id: "88888888-8888-4888-8888-888888888888" }],
    },
    "production",
  );
  assert.deepEqual(deployment, {
    workerDeploymentId: "77777777-7777-4777-8777-777777777777",
    workerVersionId: "88888888-8888-4888-8888-888888888888",
  });
  assert.deepEqual(
    parseWorkerVersionProvenance(
      {
        annotations: { "workers/message": `source-revision:${SOURCE_REVISION}` },
        id: deployment.workerVersionId,
        metadata: { created_on: "2026-07-18T19:55:00.000Z" },
      },
      deployment.workerVersionId,
      SOURCE_REVISION,
      "production",
    ),
    { workerVersionCreatedAt: "2026-07-18T19:55:00.000Z" },
  );
  assert.throws(
    () =>
      parseWorkerVersionProvenance(
        {
          annotations: { "workers/message": `source-revision:${"b".repeat(40)}` },
          id: deployment.workerVersionId,
          metadata: { created_on: "2026-07-18T19:55:00.000Z" },
        },
        deployment.workerVersionId,
        SOURCE_REVISION,
        "production",
      ),
    /not bound to the current Git source revision/,
  );
  assert.deepEqual(buildWranglerDeployArgs("production", SOURCE_REVISION), [
    "wrangler",
    "deploy",
    "--env",
    "production",
    "--strict",
    "--message",
    `source-revision:${SOURCE_REVISION}`,
    "--var",
    `SOURCE_REVISION:${SOURCE_REVISION}`,
  ]);
});

test("provenanced deploy refuses any tracked or untracked backend change", () => {
  assert.doesNotThrow(() => assertBackendSourceIsClean(() => ({ status: 0, stdout: "" })));
  for (const dirtyStatus of [
    " M backend/guidepup-api/src/index.ts\n",
    "?? backend/guidepup-api/local-secret.txt\n",
  ]) {
    assert.throws(
      () => assertBackendSourceIsClean(() => ({ status: 0, stdout: dirtyStatus })),
      /Backend source has uncommitted changes/,
    );
  }
  assert.throws(
    () => assertBackendSourceIsClean(() => ({ status: 1, stdout: "" })),
    /Could not verify the backend Git working tree/,
  );
});
