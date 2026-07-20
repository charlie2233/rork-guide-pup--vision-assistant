import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SMOKE_ARTIFACT_VERSION,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
  buildLaunchContract,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";
import { NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS } from "./no-screen-smoke-evidence.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(projectDir, "..");
const { launchInputs } = await import("../release/launch-inputs.js");
const CANDIDATE_BINARY_SHA256 = "c".repeat(64);

function buildCandidateEvidence(sourceRevision) {
  return {
    artifactType: "guidepup-ios-release-candidate",
    artifactVersion: 1,
    generatedAt: new Date(Date.now() - 500).toISOString(),
    sourceRevision,
    archive: {
      appName: "GuidePupVisionAssistant.app",
      applicationIdentifier: `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
      appVersion: launchInputs.iosMarketingVersion,
      binaryName: "GuidePupVisionAssistant",
      binarySha256: CANDIDATE_BINARY_SHA256,
      buildNumber: launchInputs.iosBuildNumber,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
      getTaskAllow: false,
      name: `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}.xcarchive`,
      sentry: {
        configuredDsnFound: false,
        runtimeModeDisabled: true,
      },
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        teamIdentifier: launchInputs.appleTeamId,
      },
      teamIdentifier: launchInputs.appleTeamId,
    },
    privacy: {
      containsAbsolutePaths: false,
      containsAppContent: false,
      containsCredentials: false,
      containsDeviceIdentifiers: false,
      containsProfiles: false,
      containsSignedUrls: false,
    },
  };
}

function buildPublicPageResponses() {
  const websiteUrl = launchInputs.websiteUrl;
  const privacyUrl = launchInputs.privacyPolicyUrl;
  const supportUrl = launchInputs.supportUrl;
  const safetyUrl = `${websiteUrl}/safety`;
  return {
    [websiteUrl]: {
      body: "Guide Pup helps blind and low-vision users. Optional hands-free voice commands use iOS speech recognition. Crash reporting is disabled.",
      finalUrl: websiteUrl,
      status: 200,
    },
    [privacyUrl]: {
      body: `Guide Pup Privacy Policy. Voice and Apple Speech. Cloudflare observability. OpenAI. Contact ${launchInputs.supportEmail}.`,
      finalUrl: privacyUrl,
      status: 200,
    },
    [supportUrl]: {
      body: `Support - Guide Pup. Check camera permission. Contact emergency services when needed. Email ${launchInputs.supportEmail}.`,
      finalUrl: supportUrl,
      status: 200,
    },
    [safetyUrl]: {
      body: "Guide Pup is not guaranteed hazard detection or emergency response. When STOP appears. Emergency guidance.",
      finalUrl: safetyUrl,
      status: 200,
    },
  };
}

function copyTreeWithoutBuildArtifacts(source, destination) {
  const excluded = new Set([".expo", "build", "dist", "node_modules", "Pods"]);
  cpSync(source, destination, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(source, sourcePath);
      return !relative.split(path.sep).some((part) => excluded.has(part));
    },
  });
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}

function createFixture() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "guidepup-release-smoke-"));
  const fixtureExpo = path.join(fixtureRoot, "expo");
  copyTreeWithoutBuildArtifacts(projectDir, fixtureExpo);
  symlinkSync(path.join(projectDir, "node_modules"), path.join(fixtureExpo, "node_modules"), "dir");
  const fixtureAppJsonPath = path.join(fixtureExpo, "app.json");
  const fixtureAppJson = JSON.parse(readFileSync(fixtureAppJsonPath, "utf8"));
  fixtureAppJson.expo.ios.buildNumber = launchInputs.iosBuildNumber;
  writeFileSync(fixtureAppJsonPath, `${JSON.stringify(fixtureAppJson, null, 2)}\n`);
  const fixtureProjectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
  writeFileSync(
    fixtureProjectPath,
    readFileSync(fixtureProjectPath, "utf8").replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${launchInputs.iosBuildNumber};`,
    ),
  );

  mkdirSync(path.join(fixtureRoot, "backend/guidepup-api"), { recursive: true });
  cpSync(path.join(repoDir, "backend/guidepup-api/eval"), path.join(fixtureRoot, "backend/guidepup-api/eval"), {
    recursive: true,
  });
  mkdirSync(path.join(fixtureRoot, "site"), { recursive: true });
  for (const page of ["privacy", "safety", "support"]) {
    cpSync(path.join(repoDir, "site", page), path.join(fixtureRoot, "site", page), { recursive: true });
  }

  runGit(fixtureRoot, ["init", "--quiet"]);
  runGit(fixtureRoot, ["config", "user.email", "smoke-test@example.invalid"]);
  runGit(fixtureRoot, ["config", "user.name", "GuidePup Smoke Test"]);
  runGit(fixtureRoot, ["add", "expo", "backend", "site"]);
  runGit(fixtureRoot, ["commit", "--quiet", "-m", "fixture"]);
  const sourceRevision = runGit(fixtureRoot, ["rev-parse", "HEAD"]);
  writeFileSync(
    path.join(fixtureExpo, "release/candidate-build.latest.json"),
    `${JSON.stringify(buildCandidateEvidence(sourceRevision), null, 2)}\n`,
  );
  const activeProvenance = {
    workerDeploymentId: "55555555-5555-4555-8555-555555555555",
    workerVersionCreatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    workerVersionId: "66666666-6666-4666-8666-666666666666",
  };
  const fakeBin = path.join(fixtureRoot, ".git/test-bin");
  mkdirSync(fakeBin);
  const fakeNpxPath = path.join(fakeBin, "npx");
  writeFileSync(
    fakeNpxPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (process.env.GUIDEPUP_TEST_WRANGLER_UNAVAILABLE === "1") {
  process.exitCode = 2;
} else if (args[0] === "wrangler" && args[1] === "deployments" && args[2] === "status") {
  console.log(JSON.stringify({
    id: ${JSON.stringify(activeProvenance.workerDeploymentId)},
    versions: [{ percentage: 100, version_id: ${JSON.stringify(activeProvenance.workerVersionId)} }],
  }));
} else if (args[0] === "wrangler" && args[1] === "versions" && args[2] === "view") {
  console.log(JSON.stringify({
    annotations: { "workers/message": ${JSON.stringify(`source-revision:${sourceRevision}`)} },
    id: ${JSON.stringify(activeProvenance.workerVersionId)},
    metadata: { created_on: ${JSON.stringify(activeProvenance.workerVersionCreatedAt)} },
  }));
} else {
  process.exitCode = 2;
}
`,
  );
  chmodSync(fakeNpxPath, 0o755);
  const publicFetchPreload = path.join(fixtureRoot, ".git/mock-public-fetch.mjs");
  writeFileSync(
    publicFetchPreload,
    `const responses = JSON.parse(process.env.GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES || "{}");
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input?.url;
  const fixture = responses[url];
  if (!fixture) {
    throw new Error("No deterministic public-page response configured");
  }
  return {
    ok: Number.isInteger(fixture.status) && fixture.status >= 200 && fixture.status < 300,
    status: fixture.status,
    text: async () => fixture.body,
    url: fixture.finalUrl || url,
  };
};
`,
  );

  return { activeProvenance, fakeBin, fixtureExpo, fixtureRoot, publicFetchPreload, sourceRevision };
}

function buildEnvelope(interactionMode, timestampMs) {
  return {
    appVersion: launchInputs.iosMarketingVersion,
    captureHeuristics: {
      frameAgeMs: 0,
      imageSource: "base64",
      resizedForUpload: false,
      uploadedHeight: 40,
      uploadedWidth: 40,
    },
    detail: "low",
    frameId: `fixture-${interactionMode}-frame`,
    frameSummary: `Synthetic ${interactionMode} preflight fixture frame.`,
    hasImage: true,
    interactionMode,
    mimeType: "image/png",
    nativePath: "js-fallback",
    platform: "ios",
    priorGuidance: "Synthetic preflight fixture context.",
    sampledFrame: true,
    sessionId: "fixture-smoke-session",
    sourceHeight: 40,
    sourceWidth: 40,
    timestampMs,
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
    message: "Stop. Synthetic obstacle ahead.",
    model: `${launchInputs.productionVisionModel}-fixture`,
    obstacle: true,
    promptVersion: launchInputs.productionPromptVersion,
    provider: "openai-compatible",
    requestId,
    roundTripLatencyMs: 1200,
    sceneDescription: "A synthetic obstacle occupies the center path.",
    statusCode: 200,
    statusText: "OK",
    structuredOutputInvalidFields: [],
    structuredOutputMissingFields: [],
    structuredOutputValid: true,
    surfaceType: "indoor floor",
    walkability: "caution",
  };
}

function buildSmokeArtifact(environment, apiUrl, sourceRevision, activeProvenance) {
  const nowMs = Date.now();
  const generatedAt = new Date(nowMs - 1000).toISOString();
  const artifact = {
    apiUrl,
    artifactVersion: SMOKE_ARTIFACT_VERSION,
    bootstrap: {
      deviceIdSuffix: "abcdef12",
      requestId: "22222222-2222-4222-8222-222222222222",
      statusCode: 200,
      statusText: "OK",
    },
    environment,
    freshness: {
      expiresAt: new Date(Date.parse(generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString(),
      maxAgeSeconds: SMOKE_EVIDENCE_MAX_AGE_SECONDS,
    },
    generatedAt,
    health: {
      defaultMaxCompletionTokens: 700,
      defaultModel: launchInputs.productionVisionModel,
      defaultProvider: "openai-compatible",
      defaultRequestTimeoutMs: 12000,
      defaultRetryCount: 1,
      defaultRetryDelayMs: 250,
      environment,
      promptVersion: launchInputs.productionPromptVersion,
      requestId: "11111111-1111-4111-8111-111111111111",
      statusCode: 200,
      statusText: "OK",
      structuredOutputMode: "json_schema_strict",
    },
    lanes: {
      guidance: {
        analyze: buildAnalyze("guidance", "33333333-3333-4333-8333-333333333333"),
        interactionMode: "guidance",
        requestEnvelope: buildEnvelope("guidance", nowMs - 1000),
      },
      "scene-query": {
        analyze: buildAnalyze("scene-query", "44444444-4444-4444-8444-444444444444"),
        interactionMode: "scene-query",
        requestEnvelope: buildEnvelope("scene-query", nowMs - 1000),
      },
    },
    operator: "Preflight fixture",
    provenance: {
      sourceRevision,
      ...activeProvenance,
    },
    providerBacked: true,
  };
  artifact.launchContract = buildLaunchContract({ artifact });
  return artifact;
}

function writeSmoke(fixtureRoot, environment, artifact) {
  const fileName = environment === "production"
    ? "smoke-results-production.latest.json"
    : "smoke-results-staging.latest.json";
  writeFileSync(
    path.join(fixtureRoot, "backend/guidepup-api/eval", fileName),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function buildNoScreenEvidence(smokeArtifact, track) {
  const noScreen = JSON.parse(
    readFileSync(path.join(projectDir, "docs/no-screen-smoke-evidence.example.json"), "utf8"),
  );
  const generatedAt = new Date(Date.now() - 100).toISOString();
  for (const target of [noScreen.device, noScreen.provenance]) {
    target.appVersion = launchInputs.iosMarketingVersion;
    target.buildNumber = launchInputs.iosBuildNumber;
    target.buildProfile = track;
    target.bundleIdentifier = launchInputs.iosBundleIdentifier;
  }
  noScreen.generatedAt = generatedAt;
  noScreen.provenance.generatedAt = generatedAt;
  noScreen.provenance.candidateBinarySha256 = CANDIDATE_BINARY_SHA256;
  noScreen.provenance.releaseTrack = track;
  noScreen.provenance.sourceRevision = smokeArtifact.provenance?.sourceRevision;
  noScreen.backendSmoke.apiBaseUrl = launchInputs.productionApiBaseUrl;
  noScreen.backendSmoke.artifactVersion = smokeArtifact.artifactVersion;
  noScreen.backendSmoke.environment = "production";
  noScreen.backendSmoke.generatedAt = smokeArtifact.generatedAt;
  noScreen.backendSmoke.model = smokeArtifact.lanes?.guidance?.analyze?.model || "";
  noScreen.backendSmoke.promptVersion = smokeArtifact.lanes?.guidance?.analyze?.promptVersion || "";
  noScreen.backendSmoke.provenance = { ...smokeArtifact.provenance };
  noScreen.backendSmoke.requestIds = {
    analyze: smokeArtifact.lanes?.guidance?.analyze?.requestId || "",
    bootstrap: smokeArtifact.bootstrap?.requestId || "",
    guidanceAnalyze: smokeArtifact.lanes?.guidance?.analyze?.requestId || "",
    health: smokeArtifact.health?.requestId || "",
    sceneQueryAnalyze: smokeArtifact.lanes?.["scene-query"]?.analyze?.requestId || "",
  };
  noScreen.backendSmoke.walkability = smokeArtifact.lanes?.guidance?.analyze?.walkability || "";
  noScreen.provenance.apiEnvironment = "production";
  noScreen.provenance.apiBaseUrlLabel = "production";
  noScreen.stopBargeIn.analysisInactiveAfterStop = true;
  noScreen.stopBargeIn.cameraInactiveAfterStop = true;
  noScreen.stopBargeIn.listeningStoppedAfterStop = true;
  noScreen.stopBargeIn.postStopObservedAt = Date.parse(generatedAt);
  return noScreen;
}

function writeNoScreenEvidence(fixtureExpo, artifact) {
  mkdirSync(path.join(fixtureExpo, "release"), { recursive: true });
  writeFileSync(
    path.join(fixtureExpo, "release/no-screen-smoke.latest.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload, extraEnv = {}) {
  const preloadOption = `--import=${pathToFileURL(publicFetchPreload).href}`;
  const nodeOptions = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(" ");
  return spawnSync(process.execPath, ["scripts/release-preflight.mjs", "--track", track], {
    cwd: fixtureExpo,
    encoding: "utf8",
    env: {
      ...process.env,
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(buildPublicPageResponses()),
      NODE_OPTIONS: nodeOptions,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      ...extraEnv,
    },
  });
}

test("TestFlight and Store preflight accept current dual-lane provenance and reject each launch-invalid mutation", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const valid = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    const cases = [
      {
        expected: /freshness\.expired/,
        mutate(artifact) {
          artifact.generatedAt = new Date(Date.now() - 2 * SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString();
          artifact.freshness.expiresAt = new Date(
            Date.parse(artifact.generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000,
          ).toISOString();
        },
      },
      {
        expected: /provenance\.sourceRevision-mismatch/,
        mutate(artifact) {
          artifact.provenance.sourceRevision = "f".repeat(40);
        },
      },
      {
        expected: /provenance\.workerDeploymentId/,
        mutate(artifact) {
          delete artifact.provenance.workerDeploymentId;
        },
      },
      {
        expected: /provenance\.workerVersionId-active-mismatch/,
        mutate(artifact) {
          artifact.provenance.workerVersionId = "99999999-9999-4999-8999-999999999999";
        },
      },
      {
        expected: /lanes\.scene-query/,
        mutate(artifact) {
          delete artifact.lanes["scene-query"];
        },
      },
      {
        env: { GUIDEPUP_TEST_WRANGLER_UNAVAILABLE: "1" },
        expected: /provenance\.active-worker-unavailable/,
      },
    ];

    for (const track of ["testflight", "store"]) {
      writeSmoke(fixtureRoot, "production", valid);
      writeNoScreenEvidence(fixtureExpo, buildNoScreenEvidence(valid, track));
      const baseline = runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload);
      assert.equal(baseline.status, 0, `${track}: ${baseline.stdout}${baseline.stderr}`);

      for (const testCase of cases) {
        const artifact = structuredClone(valid);
        testCase.mutate?.(artifact);
        artifact.launchContract = buildLaunchContract({ artifact });
        writeSmoke(fixtureRoot, "production", artifact);
        writeNoScreenEvidence(fixtureExpo, buildNoScreenEvidence(artifact, track));
        const result = runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload, testCase.env);
        const output = result.stdout + result.stderr;
        assert.equal(result.status, 1, `${track}: ${output}`);
        assert.match(output, testCase.expected);
      }
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("store-backed preflight rejects no-screen evidence from a different launch candidate", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);
    const cases = [
      {
        expected: /generatedAt\.stale/,
        mutate(artifact) {
          artifact.generatedAt = new Date(
            Date.now() - (NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS + 1) * 1000,
          ).toISOString();
          artifact.provenance.generatedAt = artifact.generatedAt;
        },
        track: "testflight",
      },
      {
        expected: /device\.appVersion:1\.0\.1/,
        mutate(artifact) {
          artifact.device.appVersion = "1.0.1";
          artifact.provenance.appVersion = "1.0.1";
        },
        track: "testflight",
      },
      {
        expected: /provenance\.buildNumber:5/,
        mutate(artifact) {
          artifact.device.buildNumber = "5";
          artifact.provenance.buildNumber = "5";
        },
        track: "testflight",
      },
      {
        expected: /provenance\.releaseTrack:testflight/,
        mutate(artifact) {
          artifact.device.buildProfile = "testflight";
          artifact.provenance.buildProfile = "testflight";
          artifact.provenance.releaseTrack = "testflight";
        },
        track: "store",
      },
      {
        expected: /provenance\.sourceRevision-mismatch/,
        mutate(artifact) {
          artifact.provenance.sourceRevision = "f".repeat(40);
        },
        track: "testflight",
      },
      {
        expected: /backendSmoke\.requestIds\.guidanceAnalyze\.candidate-mismatch/,
        mutate(artifact) {
          artifact.backendSmoke.requestIds.guidanceAnalyze = "99999999-9999-4999-8999-999999999999";
        },
        track: "store",
      },
    ];

    for (const testCase of cases) {
      const noScreen = buildNoScreenEvidence(smokeArtifact, testCase.track);
      testCase.mutate(noScreen);
      writeNoScreenEvidence(fixtureExpo, noScreen);
      const result = runPreflight(
        fixtureExpo,
        testCase.track,
        fakeBin,
        publicFetchPreload,
      );
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 1, `${testCase.track}: ${output}`);
      assert.match(output, testCase.expected);
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("store preflight rejects stale or unsuccessful live pages even when local pages are current", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);
    writeNoScreenEvidence(fixtureExpo, buildNoScreenEvidence(smokeArtifact, "store"));

    const stalePages = buildPublicPageResponses();
    stalePages[launchInputs.supportUrl].body =
      "Support - Guide Pup. Check camera permission. Contact emergency services. Launch rehearsal.";
    const staleResult = runPreflight(fixtureExpo, "store", fakeBin, publicFetchPreload, {
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(stalePages),
    });
    const staleOutput = staleResult.stdout + staleResult.stderr;
    assert.equal(staleResult.status, 1, staleOutput);
    assert.match(staleOutput, /Live support is missing required current marker "charliehan112@gmail\.com"/);
    assert.match(staleOutput, /Live support still contains stale or launch-internal marker "launch rehearsal"/);

    const unavailablePages = buildPublicPageResponses();
    unavailablePages[launchInputs.privacyPolicyUrl].status = 503;
    const unavailableResult = runPreflight(fixtureExpo, "store", fakeBin, publicFetchPreload, {
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(unavailablePages),
    });
    const unavailableOutput = unavailableResult.stdout + unavailableResult.stderr;
    assert.equal(unavailableResult.status, 1, unavailableOutput);
    assert.match(unavailableOutput, /Live privacy policy must return a successful HTTP response/);
    assert.match(unavailableOutput, /status 503/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight warns, but does not pass single-lane evidence as launch-valid", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const artifact = buildSmokeArtifact(
      "staging",
      launchInputs.stagingApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    delete artifact.lanes["scene-query"];
    artifact.launchContract = buildLaunchContract({ artifact });
    writeSmoke(fixtureRoot, "staging", artifact);

    const result = runPreflight(fixtureExpo, "preview", fakeBin, publicFetchPreload);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.match(output, /Warnings:/);
    assert.match(output, /lanes\.scene-query/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
