import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  SMOKE_ARTIFACT_VERSION,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
  SMOKE_INTERACTION_MODES,
  buildLaunchContract,
  isGitRevision,
  isNonEmptyString,
  isSanitizedRequestId,
  isWorkerIdentifier,
  validateSmokeArtifactContract,
  validateStructuredAnalyzeOutput,
  validateRuntimeDeploymentIdentity,
} from "./smoke-contract.mjs";
import { validateEvidencePrivacy } from "../../../expo/scripts/evidence-privacy.mjs";

const require = createRequire(import.meta.url);
const { launchInputs } = require("../../../expo/release/launch-inputs.js");
const evalDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(evalDir, "..");
const repoDir = path.resolve(backendDir, "../..");

const VALID_TRACKS = new Set(["staging", "production"]);
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAK0lEQVR4nO3NMQ0AAAwDoPo33ZpYsgcMkD6JWCwWi8VisVgsFovFYrFYfGcs0K5PemaPnAAAAABJRU5ErkJggg==";
const SOURCE_REVISION_PREFIX = "source-revision:";

export function parseArgs(argv) {
  const args = {
    env: undefined,
    expectedModel: launchInputs.productionVisionModel,
    expectedPromptVersion: launchInputs.productionPromptVersion,
    outputJson: undefined,
    outputMd: undefined,
    operator: "Codex",
    requireLaunchContract: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env") {
      args.env = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output-json") {
      args.outputJson = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--output-md") {
      args.outputMd = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--operator") {
      args.operator = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--expected-model") {
      args.expectedModel = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--expected-prompt-version") {
      args.expectedPromptVersion = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--require-launch-contract") {
      args.requireLaunchContract = true;
    }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getApiUrl(env) {
  if (env === "staging") {
    return launchInputs.stagingApiBaseUrl;
  }
  if (env === "production") {
    return launchInputs.productionApiBaseUrl;
  }
  return undefined;
}

export function getExpectedWorkerIdentity(env) {
  if (env === "staging") {
    return launchInputs.stagingWorkerName;
  }
  if (env === "production") {
    return launchInputs.productionWorkerName;
  }
  return undefined;
}

function getOutputPath(value) {
  return value ? path.resolve(process.cwd(), value) : undefined;
}

function runCommand(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
    },
    maxBuffer: 10 * 1024 * 1024,
  });
}

function parseJsonCommandResult(result, description) {
  assert(result.status === 0, `${description} could not be resolved. Authenticate Wrangler and retry.`);
  try {
    return JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`${description} returned an unreadable response.`);
  }
}

export function resolveGitRevision(commandRunner = runCommand) {
  const result = commandRunner("git", ["rev-parse", "--verify", "HEAD"], repoDir);
  const revision = result.status === 0 ? result.stdout.trim().toLowerCase() : undefined;
  assert(isGitRevision(revision), "The current Git source revision could not be resolved.");
  return revision;
}

export function parseWorkerDeploymentStatus(deployment, env) {
  assert(deployment && typeof deployment === "object" && !Array.isArray(deployment), `${env} Worker deployment status is missing.`);
  assert(isWorkerIdentifier(deployment.id), `${env} Worker deployment ID is missing or malformed.`);
  assert(Array.isArray(deployment.versions), `${env} Worker deployment versions are missing.`);
  assert(deployment.versions.length === 1, `${env} Worker must have exactly one active version for launch smoke evidence.`);

  const activeVersion = deployment.versions[0];
  const percentage = Number(activeVersion?.percentage);
  assert(percentage === 100, `${env} Worker launch smoke requires one version serving 100 percent of traffic.`);
  assert(isWorkerIdentifier(activeVersion?.version_id), `${env} Worker version ID is missing or malformed.`);

  return {
    workerDeploymentId: deployment.id,
    workerVersionId: activeVersion.version_id,
  };
}

export function parseWorkerVersionProvenance(version, expectedVersionId, sourceRevision, env) {
  assert(version && typeof version === "object" && !Array.isArray(version), `${env} Worker version metadata is missing.`);
  assert(version.id === expectedVersionId, `${env} Worker version metadata does not match the active deployment.`);
  assert(isWorkerIdentifier(version.id), `${env} Worker version ID is missing or malformed.`);
  const workerVersionCreatedAt = version.metadata?.created_on;
  assert(Number.isFinite(Date.parse(workerVersionCreatedAt)), `${env} Worker version creation timestamp is missing.`);
  assert(
    version.annotations?.["workers/message"] === `${SOURCE_REVISION_PREFIX}${sourceRevision}`,
    `${env} Worker version is not bound to the current Git source revision. Deploy through the provenanced package script first.`,
  );

  return {
    workerVersionCreatedAt,
  };
}

export function readWorkerDeploymentStatus(env, commandRunner = runCommand) {
  const result = commandRunner(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "deployments", "status", "--env", env, "--json"],
    backendDir,
  );
  return parseWorkerDeploymentStatus(
    parseJsonCommandResult(result, `${env} Worker deployment status`),
    env,
  );
}

export function resolveWorkerProvenance(env, sourceRevision, commandRunner = runCommand) {
  const deployment = readWorkerDeploymentStatus(env, commandRunner);
  const result = commandRunner(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["wrangler", "versions", "view", deployment.workerVersionId, "--env", env, "--json"],
    backendDir,
  );
  const version = parseJsonCommandResult(result, `${env} Worker version metadata`);
  return {
    ...deployment,
    ...parseWorkerVersionProvenance(version, deployment.workerVersionId, sourceRevision, env),
    sourceRevision,
    workerIdentity: getExpectedWorkerIdentity(env),
  };
}

async function fetchJson(url, init) {
  const startedAt = performance.now();
  const response = await fetch(url, init);
  const roundTripLatencyMs = Math.round(performance.now() - startedAt);
  const responseRequestId = response.headers.get("x-request-id")?.trim();
  const requestId = isSanitizedRequestId(responseRequestId) ? responseRequestId : undefined;
  const rawText = await response.text();
  let json;

  try {
    json = rawText ? JSON.parse(rawText) : undefined;
  } catch {
    json = undefined;
  }

  return { json, requestId, response, roundTripLatencyMs };
}

function getDeviceIdSuffix(deviceId) {
  if (!isNonEmptyString(deviceId) || deviceId.length < 8) {
    return undefined;
  }
  const suffix = deviceId.slice(-8);
  return /^[A-Za-z0-9]{8}$/.test(suffix) ? suffix : undefined;
}

export function buildAnalyzeRequestPayload(env, interactionMode, runTimestampMs = Date.now()) {
  assert(SMOKE_INTERACTION_MODES.includes(interactionMode), `Unsupported smoke interaction mode: ${interactionMode}.`);
  const modeLabel = interactionMode === "scene-query" ? "scene-query" : "guidance";
  const sessionId = `smoke-${env}-${runTimestampMs}`;

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
    frameId: `${sessionId}-${modeLabel}-frame`,
    frameSummary: `Synthetic sampled js-fallback ${modeLabel} smoke frame, source 40x40, upload 40x40.`,
    hasImage: true,
    imageBase64: TEST_IMAGE_BASE64,
    interactionMode,
    mimeType: "image/png",
    nativePath: "js-fallback",
    platform: "ios",
    priorGuidance:
      interactionMode === "scene-query"
        ? "Synthetic guidance lane completed; describe the current scene without changing settings."
        : "Synthetic smoke sample; no previous spoken guidance.",
    sampledFrame: true,
    sessionId,
    sourceHeight: 40,
    sourceWidth: 40,
    timestampMs: runTimestampMs,
  };
}

export function sanitizeAnalyzeRequestEnvelope(payload) {
  return {
    appVersion: payload.appVersion,
    captureHeuristics: payload.captureHeuristics,
    detail: payload.detail,
    frameId: payload.frameId,
    frameSummary: payload.frameSummary,
    hasImage: payload.hasImage,
    interactionMode: payload.interactionMode,
    mimeType: payload.mimeType,
    nativePath: payload.nativePath,
    platform: payload.platform,
    priorGuidance: payload.priorGuidance,
    sampledFrame: payload.sampledFrame,
    sessionId: payload.sessionId,
    sourceHeight: payload.sourceHeight,
    sourceWidth: payload.sourceWidth,
    timestampMs: payload.timestampMs,
  };
}

export function deriveAnalyzeSummary(result, interactionMode) {
  if (result.response.ok && result.json) {
    const structuredOutput = validateStructuredAnalyzeOutput(result.json);
    return {
      confidence: result.json.confidence,
      direction: result.json.direction,
      errorCode: undefined,
      executionPath: "provider-backed",
      fallbackReason: result.json.fallbackReason ?? null,
      hazardLevel: result.json.hazardLevel,
      interactionMode,
      latencyMs: result.json.latencyMs,
      lighting: result.json.lighting,
      message: result.json.message,
      model: result.json.model,
      obstacle: result.json.obstacle,
      promptVersion: result.json.promptVersion,
      provider: result.json.provider,
      requestId: result.requestId,
      roundTripLatencyMs: result.roundTripLatencyMs,
      sceneDescription: result.json.sceneDescription,
      statusCode: result.response.status,
      statusText: result.response.statusText || "",
      structuredOutputInvalidFields: structuredOutput.invalid,
      structuredOutputMissingFields: structuredOutput.missing,
      structuredOutputValid: structuredOutput.valid,
      surfaceType: result.json.surfaceType,
      walkability: result.json.walkability,
    };
  }

  const safeResponse = result.json?.safeResponse;
  const errorCode = result.json?.error?.code;
  const structuredOutput = safeResponse
    ? validateStructuredAnalyzeOutput(safeResponse)
    : { invalid: [], missing: ["safeResponse"], valid: false };

  return {
    confidence: safeResponse?.confidence,
    direction: safeResponse?.direction,
    errorCode,
    executionPath: safeResponse ? "safe-fallback" : "failed",
    fallbackReason: errorCode,
    hazardLevel: safeResponse?.hazardLevel,
    interactionMode,
    latencyMs: safeResponse?.latencyMs,
    lighting: safeResponse?.lighting,
    message: safeResponse?.message,
    model: safeResponse?.model,
    obstacle: safeResponse?.obstacle,
    promptVersion: safeResponse?.promptVersion,
    provider: safeResponse?.provider,
    requestId: result.requestId,
    roundTripLatencyMs: result.roundTripLatencyMs,
    sceneDescription: safeResponse?.sceneDescription,
    statusCode: result.response.status,
    statusText: result.response.statusText || "",
    structuredOutputInvalidFields: structuredOutput.invalid,
    structuredOutputMissingFields: structuredOutput.missing,
    structuredOutputValid: structuredOutput.valid,
    surfaceType: safeResponse?.surfaceType,
    walkability: safeResponse?.walkability,
  };
}

export async function runAnalyzeLanes({
  apiUrl,
  deviceId,
  env,
  fetcher = fetchJson,
  runTimestampMs,
  sessionToken,
}) {
  const lanes = {};
  for (const interactionMode of SMOKE_INTERACTION_MODES) {
    const payload = buildAnalyzeRequestPayload(env, interactionMode, runTimestampMs);
    const result = await fetcher(`${apiUrl}/v1/vision/analyze`, {
      body: JSON.stringify(payload),
      headers: {
        authorization: `Bearer ${sessionToken}`,
        "content-type": "application/json",
        "x-guidepup-device-id": deviceId,
      },
      method: "POST",
    });
    lanes[interactionMode] = {
      analyze: deriveAnalyzeSummary(result, interactionMode),
      interactionMode,
      requestEnvelope: sanitizeAnalyzeRequestEnvelope(payload),
    };
  }
  return lanes;
}

export function buildSmokeArtifact({
  apiUrl,
  bootstrap,
  deviceId,
  environment,
  generatedAt = new Date().toISOString(),
  health,
  lanes,
  operator,
  provenance,
}) {
  const healthSnapshot = {
    analyzeDeviceRateLimitPerMinute: health.json?.analyzeDeviceRateLimitPerMinute,
    analyzeIpRateLimitPerMinute: health.json?.analyzeIpRateLimitPerMinute,
    apiUrl: health.json?.apiUrl,
    bootstrapIpRateLimitPerMinute: health.json?.bootstrapIpRateLimitPerMinute,
    defaultMaxCompletionTokens: health.json?.defaultMaxCompletionTokens,
    defaultModel: health.json?.defaultModel,
    defaultProvider: health.json?.defaultProvider,
    defaultReasoningEffort: health.json?.defaultReasoningEffort,
    defaultRequestTimeoutMs: health.json?.defaultRequestTimeoutMs,
    defaultRetryCount: health.json?.defaultRetryCount,
    defaultRetryDelayMs: health.json?.defaultRetryDelayMs,
    deploymentIdentityValid: health.json?.deploymentIdentityValid,
    environment: health.json?.environment,
    expectedApiUrl: health.json?.expectedApiUrl,
    promptVersion: health.json?.promptVersion,
    providerGlobalCallLimitPerMinute: health.json?.providerGlobalCallLimitPerMinute,
    requestId: health.requestId,
    roundTripLatencyMs: health.roundTripLatencyMs,
    sessionTtlSeconds: health.json?.sessionTtlSeconds,
    sourceRevision: health.json?.sourceRevision,
    statusCode: health.response.status,
    statusText: health.response.statusText || "",
    structuredOutputMode: health.json?.structuredOutputMode,
    workerIdentity: health.json?.workerIdentity,
    workerVersionId: health.json?.workerVersionId,
  };
  if (health.json?.benchmarkProviders !== undefined) {
    healthSnapshot.benchmarkProviders = health.json.benchmarkProviders;
  }

  const artifact = {
    apiUrl,
    artifactVersion: SMOKE_ARTIFACT_VERSION,
    bootstrap: {
      deviceIdSuffix: getDeviceIdSuffix(deviceId),
      expiresAt: bootstrap.json?.expiresAt,
      promptVersion: bootstrap.json?.promptVersion,
      rateLimitPerMinute: bootstrap.json?.rateLimitPerMinute,
      requestId: bootstrap.requestId,
      roundTripLatencyMs: bootstrap.roundTripLatencyMs,
      statusCode: bootstrap.response.status,
      statusText: bootstrap.response.statusText || "",
    },
    environment,
    freshness: {
      expiresAt: new Date(Date.parse(generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString(),
      maxAgeSeconds: SMOKE_EVIDENCE_MAX_AGE_SECONDS,
    },
    generatedAt,
    health: healthSnapshot,
    lanes,
    operator,
    provenance,
    providerBacked: SMOKE_INTERACTION_MODES.every(
      (mode) => lanes[mode].analyze.executionPath === "provider-backed",
    ),
  };
  artifact.launchContract = buildLaunchContract({ artifact });
  return artifact;
}

export function validateLaunchReadinessArtifact(artifact, options) {
  const result = validateSmokeArtifactContract(artifact, options);
  const privacy = validateEvidencePrivacy(artifact);
  return [
    ...result.missing.map((field) => `missing ${field}`),
    ...result.invalid.map((field) => `invalid ${field}`),
    ...privacy.disallowedKeys.map((field) => `privacy disallowed field ${field}`),
    ...privacy.sensitivePatterns.map((pattern) => `privacy sensitive pattern ${pattern}`),
  ];
}

export function formatSmokeArtifactStdout(artifact) {
  const privacy = validateEvidencePrivacy(artifact);
  if (privacy.disallowedKeys.length > 0 || privacy.sensitivePatterns.length > 0) {
    return `${JSON.stringify({ privacySafe: false, suppressed: true }, null, 2)}\n`;
  }
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function formatLaneMarkdown(mode, lane) {
  const analyze = lane.analyze;
  const envelope = lane.requestEnvelope;
  return [
    `### ${mode}`,
    "",
    `- request id: \`${analyze.requestId || "not-found"}\``,
    `- status: \`${analyze.statusCode} ${analyze.statusText}\``,
    `- execution path: \`${analyze.executionPath}\``,
    `- provider/model: \`${analyze.provider || "not-found"} / ${analyze.model || "not-found"}\``,
    `- prompt version: \`${analyze.promptVersion || "not-found"}\``,
    `- structured output valid: \`${analyze.structuredOutputValid ? "yes" : "no"}\``,
    `- direction/hazard/walkability: \`${analyze.direction || "not-found"} / ${analyze.hazardLevel || "not-found"} / ${analyze.walkability || "not-found"}\``,
    `- obstacle/confidence: \`${String(analyze.obstacle)} / ${analyze.confidence ?? "not-found"}\``,
    `- lighting/surface: \`${analyze.lighting || "not-found"} / ${analyze.surfaceType || "not-found"}\``,
    `- fallback reason: \`${analyze.fallbackReason || "none"}\``,
    `- message: \`${analyze.message || "not-found"}\``,
    `- scene description: \`${analyze.sceneDescription || "not-found"}\``,
    `- sampled frame: \`${envelope.sampledFrame ? "yes" : "no"}\``,
    `- native path: \`${envelope.nativePath}\``,
    `- dimensions: \`${envelope.sourceWidth}x${envelope.sourceHeight}\``,
    `- frame summary: \`${envelope.frameSummary}\``,
    "",
  ];
}

export function toMarkdown(artifact) {
  const lines = [
    "# Guide Pup Smoke Results",
    "",
    `Date: ${artifact.generatedAt.slice(0, 10)}`,
    `Environment: ${artifact.environment}`,
    `Operator: ${artifact.operator}`,
    `Artifact version: ${artifact.artifactVersion}`,
    "",
    "## Provenance and freshness",
    "",
    `- Worker deployment: \`${artifact.provenance.workerDeploymentId}\``,
    `- Worker version: \`${artifact.provenance.workerVersionId}\``,
    `- Worker identity: \`${artifact.provenance.workerIdentity}\``,
    `- Worker version created: \`${artifact.provenance.workerVersionCreatedAt}\``,
    `- source revision: \`${artifact.provenance.sourceRevision}\``,
    `- evidence expires: \`${artifact.freshness.expiresAt}\``,
    `- maximum age: \`${artifact.freshness.maxAgeSeconds}s\``,
    "",
    "## Worker smoke",
    "",
    `- API: \`${artifact.apiUrl}\``,
    `- health: \`${artifact.health.statusCode} ${artifact.health.statusText}\`, request \`${artifact.health.requestId || "not-found"}\``,
    `- bootstrap: \`${artifact.bootstrap.statusCode} ${artifact.bootstrap.statusText}\`, request \`${artifact.bootstrap.requestId || "not-found"}\``,
    `- provider/model: \`${artifact.health.defaultProvider || "not-found"} / ${artifact.health.defaultModel || "not-found"}\``,
    `- prompt version: \`${artifact.health.promptVersion || "not-found"}\``,
    `- structured output mode: \`${artifact.health.structuredOutputMode || "not-found"}\``,
    `- runtime Worker version: \`${artifact.health.workerVersionId || "not-found"}\``,
    `- runtime source revision: \`${artifact.health.sourceRevision || "not-found"}\``,
    "",
    "## Analyze lanes",
    "",
  ];

  for (const mode of SMOKE_INTERACTION_MODES) {
    lines.push(...formatLaneMarkdown(mode, artifact.lanes[mode]));
  }

  lines.push(
    "## Launch contract",
    "",
    ...Object.entries(artifact.launchContract).map(([key, value]) => `- ${key}: \`${value ? "yes" : "no"}\``),
  );
  return `${lines.join("\n")}\n`;
}

function writeOutputsAtomically(outputs, fileSystem = fs) {
  const transactionId = `${process.pid}-${Date.now()}`;
  let committed = false;
  const states = outputs.map(({ content, filePath }, index) => ({
    backupPath: `${filePath}.backup-${transactionId}-${index}`,
    backedUp: false,
    content,
    filePath,
    hadOriginal: false,
    promoted: false,
    temporaryPath: `${filePath}.tmp-${transactionId}-${index}`,
  }));

  try {
    for (const state of states) {
      fileSystem.mkdirSync(path.dirname(state.filePath), { recursive: true });
      fileSystem.writeFileSync(state.temporaryPath, state.content);
    }

    for (const state of states) {
      state.hadOriginal = fileSystem.existsSync(state.filePath);
      if (state.hadOriginal) {
        fileSystem.renameSync(state.filePath, state.backupPath);
        state.backedUp = true;
      }
      fileSystem.renameSync(state.temporaryPath, state.filePath);
      state.promoted = true;
    }
    committed = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const state of [...states].reverse()) {
      try {
        if (state.promoted) {
          fileSystem.rmSync(state.filePath, { force: true });
        }
        if (state.backedUp) {
          fileSystem.renameSync(state.backupPath, state.filePath);
          state.backedUp = false;
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "Smoke output publication and rollback failed");
    }
    throw error;
  } finally {
    for (const state of states) {
      fileSystem.rmSync(state.temporaryPath, { force: true });
      if (committed || !state.backedUp) {
        fileSystem.rmSync(state.backupPath, { force: true });
      }
    }
  }
}

export function writeSmokeOutputsIfValid(
  artifact,
  { fileSystem = fs, outputJsonPath, outputMdPath, validationOptions },
) {
  const privacy = validateEvidencePrivacy(artifact);
  const privacySafe = privacy.disallowedKeys.length === 0 && privacy.sensitivePatterns.length === 0;
  const issues = validateLaunchReadinessArtifact(artifact, validationOptions);
  if (issues.length > 0) {
    return { issues, privacySafe, written: false };
  }

  const outputs = [];
  if (outputJsonPath) {
    outputs.push({
      content: `${JSON.stringify(artifact, null, 2)}\n`,
      filePath: outputJsonPath,
    });
  }
  if (outputMdPath) {
    outputs.push({ content: toMarkdown(artifact), filePath: outputMdPath });
  }
  writeOutputsAtomically(outputs, fileSystem);
  return { issues, privacySafe, written: true };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(args.env && VALID_TRACKS.has(args.env), "Use --env staging or --env production.");
  assert(isNonEmptyString(args.operator) && args.operator.length <= 80, "Operator must be a short nonempty label.");

  const apiUrl = getApiUrl(args.env);
  assert(apiUrl && !apiUrl.startsWith("TODO_"), `No API URL configured for ${args.env}.`);

  const sourceRevision = resolveGitRevision();
  const initialProvenance = resolveWorkerProvenance(args.env, sourceRevision);
  const expectedWorkerIdentity = getExpectedWorkerIdentity(args.env);
  const health = await fetchJson(`${apiUrl}/health`, {
    headers: { "content-type": "application/json" },
    method: "GET",
  });
  const runtimeIdentity = validateRuntimeDeploymentIdentity(health.json, {
    expectedApiUrl: apiUrl,
    expectedEnvironment: args.env,
    expectedSourceRevision: sourceRevision,
    expectedWorkerIdentity,
    expectedWorkerVersionId: initialProvenance.workerVersionId,
  });
  assert(
    runtimeIdentity.valid,
    `${args.env} /health is not bound to the authenticated active Worker: ${runtimeIdentity.invalid.join(", ")}.`,
  );
  assert(health.response.ok, `${args.env} /health failed with ${health.response.status}.`);

  const bootstrap = await fetchJson(`${apiUrl}/v1/device/bootstrap`, {
    body: JSON.stringify({ appVersion: "1.0.0", platform: "ios" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  assert(bootstrap.response.ok, `${args.env} /v1/device/bootstrap failed with ${bootstrap.response.status}.`);

  const sessionToken = bootstrap.json?.sessionToken;
  const deviceId = bootstrap.json?.deviceId;
  assert(isNonEmptyString(sessionToken), `${args.env} bootstrap did not return a session token.`);
  assert(isNonEmptyString(deviceId), `${args.env} bootstrap did not return a device identifier.`);

  const runTimestampMs = Date.now();
  const lanes = await runAnalyzeLanes({
    apiUrl,
    deviceId,
    env: args.env,
    runTimestampMs,
    sessionToken,
  });

  const finalDeployment = readWorkerDeploymentStatus(args.env);
  assert(
    finalDeployment.workerDeploymentId === initialProvenance.workerDeploymentId &&
      finalDeployment.workerVersionId === initialProvenance.workerVersionId,
    `${args.env} Worker deployment changed during the smoke run; discard this evidence and retry.`,
  );

  const artifact = buildSmokeArtifact({
    apiUrl,
    bootstrap,
    deviceId,
    environment: args.env,
    health,
    lanes,
    operator: args.operator,
    provenance: initialProvenance,
  });

  const outputJsonPath = getOutputPath(args.outputJson);
  const outputMdPath = getOutputPath(args.outputMd);
  const outputResult = writeSmokeOutputsIfValid(artifact, {
    outputJsonPath,
    outputMdPath,
    validationOptions: {
      expectedApiUrl: apiUrl,
      expectedEnvironment: args.env,
      expectedModel: args.expectedModel,
      expectedPromptVersion: args.expectedPromptVersion,
      expectedSourceRevision: sourceRevision,
      expectedWorkerIdentity,
      expectedWorkerVersionId: initialProvenance.workerVersionId,
      requireAggregateControls: true,
      requireRuntimeIdentity: true,
      nowMs: Date.now(),
    },
  });
  process.stdout.write(formatSmokeArtifactStdout(artifact));
  if (outputResult.issues.length > 0) {
    console.error(`${args.env} smoke evidence is not launch-valid; latest outputs were left unchanged:`);
    for (const issue of outputResult.issues) {
      console.error(`- ${issue}`);
    }
    if (args.requireLaunchContract || outputJsonPath || outputMdPath) {
      process.exitCode = 1;
    }
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
