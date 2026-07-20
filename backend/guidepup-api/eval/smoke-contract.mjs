import { requiresSafetyStop } from "./safety-policy.mjs";

export const SMOKE_ARTIFACT_VERSION = 2;
export const SMOKE_EVIDENCE_MAX_AGE_SECONDS = 24 * 60 * 60;
export const SMOKE_EVIDENCE_MIN_AGE_SECONDS = 5 * 60;
export const SMOKE_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const SMOKE_INTERACTION_MODES = ["guidance", "scene-query"];

const DIRECTION_VALUES = new Set(["turn-left", "turn-right", "forward", "stop"]);
const HAZARD_LEVEL_VALUES = new Set(["none", "low", "medium", "high"]);
const LIGHTING_VALUES = new Set(["dark", "dim", "normal", "bright", "unknown"]);
const WALKABILITY_VALUES = new Set(["clear", "caution", "uncertain"]);
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSanitizedRequestId(value) {
  return typeof value === "string" && REQUEST_ID_PATTERN.test(value);
}

export function isGitRevision(value) {
  return typeof value === "string" && GIT_REVISION_PATTERN.test(value);
}

export function isWorkerIdentifier(value) {
  return typeof value === "string" && WORKER_ID_PATTERN.test(value);
}

export function modelMatchesExpected(value, expected) {
  return typeof value === "string" && (value === expected || value.startsWith(`${expected}-`));
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateStructuredAnalyzeOutput(responseBody) {
  const missing = [];
  const invalid = [];

  if (!isObject(responseBody)) {
    return { invalid: ["response"], missing, valid: false };
  }

  const requireField = (fieldName, validator) => {
    if (!(fieldName in responseBody) || responseBody[fieldName] === undefined || responseBody[fieldName] === null) {
      missing.push(fieldName);
      return;
    }
    if (!validator(responseBody[fieldName])) {
      invalid.push(fieldName);
    }
  };

  requireField("confidence", (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
  requireField("direction", (value) => DIRECTION_VALUES.has(value));
  requireField("hazardLevel", (value) => HAZARD_LEVEL_VALUES.has(value));
  requireField("latencyMs", (value) => typeof value === "number" && Number.isFinite(value) && value >= 0);
  requireField("lighting", (value) => LIGHTING_VALUES.has(value));
  requireField("message", isNonEmptyString);
  requireField("model", isNonEmptyString);
  requireField("obstacle", (value) => typeof value === "boolean");
  requireField("promptVersion", isNonEmptyString);
  requireField("provider", isNonEmptyString);
  requireField("sceneDescription", isNonEmptyString);
  requireField("surfaceType", isNonEmptyString);
  requireField("walkability", (value) => WALKABILITY_VALUES.has(value));

  if (!("fallbackReason" in responseBody)) {
    missing.push("fallbackReason");
  } else if (
    responseBody.fallbackReason !== null &&
    responseBody.fallbackReason !== undefined &&
    !isNonEmptyString(responseBody.fallbackReason)
  ) {
    invalid.push("fallbackReason");
  }

  return { invalid, missing, valid: missing.length === 0 && invalid.length === 0 };
}

export function validateAnalyzeSafetyContract(analyze) {
  const invalid = [];
  if (!isObject(analyze)) {
    return { invalid: ["response"], valid: false };
  }

  const stopRequired = requiresSafetyStop({
    confidence: analyze.confidence,
    direction: analyze.direction,
    fallbackReason: analyze.fallbackReason,
    hazardLevel: analyze.hazardLevel,
    lighting: analyze.lighting,
    obstacle: analyze.obstacle,
    walkability: analyze.walkability,
  });

  if (stopRequired && analyze.direction !== "stop") {
    invalid.push("stop-required");
    if (analyze.direction === "forward") {
      invalid.push("unsafe-forward");
    }
  }
  if (analyze.direction === "stop" && !/^stop(?:[.!,:;\s]|$)/i.test(analyze.message?.trim() || "")) {
    invalid.push("stop-message");
  }

  return { invalid, valid: invalid.length === 0 };
}

export function hasBoundedRuntimeControls(health) {
  return (
    Number.isInteger(health?.defaultMaxCompletionTokens) &&
    health.defaultMaxCompletionTokens >= 128 &&
    health.defaultMaxCompletionTokens <= 1200 &&
    Number.isInteger(health?.defaultRequestTimeoutMs) &&
    health.defaultRequestTimeoutMs >= 3000 &&
    health.defaultRequestTimeoutMs <= 30000 &&
    Number.isInteger(health?.defaultRetryCount) &&
    health.defaultRetryCount >= 0 &&
    health.defaultRetryCount <= 2 &&
    Number.isInteger(health?.defaultRetryDelayMs) &&
    health.defaultRetryDelayMs >= 0 &&
    health.defaultRetryDelayMs <= 2000
  );
}

export function hasBoundedAggregateControls(health) {
  const betaEnvironment = health?.environment === "staging" || health?.environment === "production";
  return (
    Number.isInteger(health?.analyzeDeviceRateLimitPerMinute) &&
    health.analyzeDeviceRateLimitPerMinute >= 1 &&
    health.analyzeDeviceRateLimitPerMinute <= 60 &&
    Number.isInteger(health?.analyzeIpRateLimitPerMinute) &&
    health.analyzeIpRateLimitPerMinute >= 10 &&
    health.analyzeIpRateLimitPerMinute <= 300 &&
    Number.isInteger(health?.bootstrapIpRateLimitPerMinute) &&
    health.bootstrapIpRateLimitPerMinute >= 1 &&
    health.bootstrapIpRateLimitPerMinute <= 60 &&
    Number.isInteger(health?.providerGlobalCallLimitPerMinute) &&
    health.providerGlobalCallLimitPerMinute >= 20 &&
    health.providerGlobalCallLimitPerMinute <= 600 &&
    Number.isInteger(health?.sessionTtlSeconds) &&
    health.sessionTtlSeconds >= (betaEnvironment ? 15 * 60 : 5 * 60) &&
    health.sessionTtlSeconds <= (betaEnvironment ? 4 * 60 * 60 : 7 * 24 * 60 * 60)
  );
}

function hasRuntimeIdentityMetadata(health) {
  return Boolean(
    health &&
    ["apiUrl", "deploymentIdentityValid", "expectedApiUrl", "sourceRevision", "workerIdentity", "workerVersionId"]
      .some((field) => field in health),
  );
}

export function validateRuntimeDeploymentIdentity(
  health,
  {
    expectedApiUrl,
    expectedEnvironment,
    expectedSourceRevision,
    expectedWorkerIdentity,
    expectedWorkerVersionId,
  } = {},
) {
  const invalid = [];
  if (!isObject(health)) {
    return { invalid: ["health"], valid: false };
  }
  if (health.deploymentIdentityValid !== true) {
    invalid.push("deploymentIdentityValid");
  }
  if (!isNonEmptyString(health.apiUrl) || health.apiUrl !== expectedApiUrl) {
    invalid.push("apiUrl");
  }
  if (!isNonEmptyString(health.expectedApiUrl) || health.expectedApiUrl !== expectedApiUrl) {
    invalid.push("expectedApiUrl");
  }
  if (!isNonEmptyString(health.environment) || health.environment !== expectedEnvironment) {
    invalid.push("environment");
  }
  if (!isGitRevision(health.sourceRevision) || health.sourceRevision !== expectedSourceRevision) {
    invalid.push("sourceRevision");
  }
  if (!isWorkerIdentifier(health.workerIdentity) || health.workerIdentity !== expectedWorkerIdentity) {
    invalid.push("workerIdentity");
  }
  if (!isWorkerIdentifier(health.workerVersionId) || health.workerVersionId !== expectedWorkerVersionId) {
    invalid.push("workerVersionId");
  }
  return { invalid, valid: invalid.length === 0 };
}

export function hasSampledFrameEnvelope(envelope, expectedMode) {
  return (
    isObject(envelope) &&
    envelope.interactionMode === expectedMode &&
    envelope.sampledFrame === true &&
    envelope.hasImage === true &&
    isNonEmptyString(envelope.appVersion) &&
    isNonEmptyString(envelope.sessionId) &&
    isNonEmptyString(envelope.frameId) &&
    isNonEmptyString(envelope.frameSummary) &&
    Number.isInteger(envelope.timestampMs) &&
    envelope.timestampMs > 0 &&
    (envelope.nativePath === "native-core" || envelope.nativePath === "js-fallback") &&
    ["ios", "android", "web", "unknown"].includes(envelope.platform) &&
    (envelope.detail === "low" || envelope.detail === "high") &&
    Number.isInteger(envelope.sourceHeight) &&
    envelope.sourceHeight > 0 &&
    Number.isInteger(envelope.sourceWidth) &&
    envelope.sourceWidth > 0 &&
    isObject(envelope.captureHeuristics) &&
    ["uri", "base64", "unknown"].includes(envelope.captureHeuristics.imageSource) &&
    typeof envelope.captureHeuristics.resizedForUpload === "boolean" &&
    Number.isInteger(envelope.captureHeuristics.uploadedHeight) &&
    envelope.captureHeuristics.uploadedHeight > 0 &&
    Number.isInteger(envelope.captureHeuristics.uploadedWidth) &&
    envelope.captureHeuristics.uploadedWidth > 0 &&
    typeof envelope.captureHeuristics.frameAgeMs === "number" &&
    Number.isFinite(envelope.captureHeuristics.frameAgeMs) &&
    envelope.captureHeuristics.frameAgeMs >= 0
  );
}

export function isFreshnessBounded(artifact) {
  const generatedAtMs = Date.parse(artifact?.generatedAt);
  const expiresAtMs = Date.parse(artifact?.freshness?.expiresAt);
  const maxAgeSeconds = artifact?.freshness?.maxAgeSeconds;
  return (
    Number.isFinite(generatedAtMs) &&
    Number.isFinite(expiresAtMs) &&
    Number.isInteger(maxAgeSeconds) &&
    maxAgeSeconds >= SMOKE_EVIDENCE_MIN_AGE_SECONDS &&
    maxAgeSeconds <= SMOKE_EVIDENCE_MAX_AGE_SECONDS &&
    expiresAtMs - generatedAtMs === maxAgeSeconds * 1000
  );
}

export function isProvenanceSyntacticallyValid(provenance) {
  return (
    isObject(provenance) &&
    isWorkerIdentifier(provenance.workerDeploymentId) &&
    isWorkerIdentifier(provenance.workerVersionId) &&
    isIsoTimestamp(provenance.workerVersionCreatedAt) &&
    isGitRevision(provenance.sourceRevision)
  );
}

export function buildLaunchContract({ artifact }) {
  const lanes = SMOKE_INTERACTION_MODES.map((mode) => artifact.lanes?.[mode]);
  const analyzeRequestIds = lanes.map((lane) => lane?.analyze?.requestId);
  const structuredOutputsValid = lanes.every((lane) => lane?.analyze?.structuredOutputValid === true);
  const safetyContractsValid = lanes.every((lane) => validateAnalyzeSafetyContract(lane?.analyze).valid);
  const explicitInteractionModesValid = SMOKE_INTERACTION_MODES.every((mode) => {
    const lane = artifact.lanes?.[mode];
    return lane?.interactionMode === mode && lane?.requestEnvelope?.interactionMode === mode && lane?.analyze?.interactionMode === mode;
  });
  const contract = {
    distinctAnalyzeRequestIds:
      analyzeRequestIds.every(isSanitizedRequestId) && new Set(analyzeRequestIds).size === SMOKE_INTERACTION_MODES.length,
    dualLaneEvidencePresent: lanes.every(isObject),
    explicitInteractionModesValid,
    freshnessBounded: isFreshnessBounded(artifact),
    provenanceValid: isProvenanceSyntacticallyValid(artifact.provenance),
    runtimeControlsPresent: hasBoundedRuntimeControls(artifact.health),
    safetyContractsValid,
    sampledFrameEnvelopesValid: SMOKE_INTERACTION_MODES.every((mode) =>
      hasSampledFrameEnvelope(artifact.lanes?.[mode]?.requestEnvelope, mode),
    ),
    strictStructuredOutputsPresent: artifact.health?.structuredOutputMode === "json_schema_strict",
    structuredOutputsValid,
  };

  if (hasRuntimeIdentityMetadata(artifact.health)) {
    contract.runtimeIdentityBound = validateRuntimeDeploymentIdentity(artifact.health, {
      expectedApiUrl: artifact.apiUrl,
      expectedEnvironment: artifact.environment,
      expectedSourceRevision: artifact.provenance?.sourceRevision,
      expectedWorkerIdentity: artifact.provenance?.workerIdentity,
      expectedWorkerVersionId: artifact.provenance?.workerVersionId,
    }).valid;
  }
  if (
    artifact.health &&
    [
      "analyzeDeviceRateLimitPerMinute",
      "analyzeIpRateLimitPerMinute",
      "bootstrapIpRateLimitPerMinute",
      "providerGlobalCallLimitPerMinute",
      "sessionTtlSeconds",
    ].some((field) => field in artifact.health)
  ) {
    contract.aggregateControlsPresent = hasBoundedAggregateControls(artifact.health);
  }

  return {
    ...contract,
    valid: Object.values(contract).every((value) => value === true),
  };
}

function addRequiredField({ container, fieldPath, fieldName, invalid, missing, validator }) {
  if (!isObject(container) || !(fieldName in container) || container[fieldName] === undefined || container[fieldName] === null) {
    missing.push(fieldPath);
    return;
  }
  if (!validator(container[fieldName])) {
    invalid.push(fieldPath);
  }
}

export function validateSmokeArtifactContract(
  artifact,
  {
    expectedApiUrl,
    expectedEnvironment,
    expectedModel,
    expectedPromptVersion,
    expectedSourceRevision,
    expectedWorkerIdentity,
    expectedWorkerVersionId,
    requireAggregateControls = false,
    requireRuntimeIdentity = false,
    nowMs = Date.now(),
  } = {},
) {
  const missing = [];
  const invalid = [];
  if (!isObject(artifact)) {
    return { invalid: ["artifact"], missing, valid: false };
  }

  addRequiredField({
    container: artifact,
    fieldName: "artifactVersion",
    fieldPath: "artifactVersion",
    invalid,
    missing,
    validator: (value) => value === SMOKE_ARTIFACT_VERSION,
  });
  addRequiredField({
    container: artifact,
    fieldName: "generatedAt",
    fieldPath: "generatedAt",
    invalid,
    missing,
    validator: isIsoTimestamp,
  });
  addRequiredField({
    container: artifact,
    fieldName: "providerBacked",
    fieldPath: "providerBacked",
    invalid,
    missing,
    validator: (value) => value === true,
  });
  if (expectedApiUrl && artifact.apiUrl !== expectedApiUrl) {
    invalid.push("apiUrl");
  }
  if (expectedEnvironment && artifact.environment !== expectedEnvironment) {
    invalid.push("environment");
  }

  if (!isObject(artifact.freshness)) {
    missing.push("freshness");
  } else {
    addRequiredField({
      container: artifact.freshness,
      fieldName: "expiresAt",
      fieldPath: "freshness.expiresAt",
      invalid,
      missing,
      validator: isIsoTimestamp,
    });
    addRequiredField({
      container: artifact.freshness,
      fieldName: "maxAgeSeconds",
      fieldPath: "freshness.maxAgeSeconds",
      invalid,
      missing,
      validator: (value) => Number.isInteger(value),
    });
    if (!isFreshnessBounded(artifact)) {
      invalid.push("freshness.bounded-window");
    }

    const generatedAtMs = Date.parse(artifact.generatedAt);
    const expiresAtMs = Date.parse(artifact.freshness.expiresAt);
    if (Number.isFinite(generatedAtMs) && generatedAtMs > nowMs + SMOKE_CLOCK_SKEW_MS) {
      invalid.push("freshness.generatedAt-in-future");
    }
    if (Number.isFinite(expiresAtMs) && expiresAtMs < nowMs) {
      invalid.push("freshness.expired");
    }
  }

  if (!isObject(artifact.provenance)) {
    missing.push("provenance");
  } else {
    for (const [fieldName, validator] of [
      ["workerDeploymentId", isWorkerIdentifier],
      ["workerVersionId", isWorkerIdentifier],
      ["workerVersionCreatedAt", isIsoTimestamp],
      ["sourceRevision", isGitRevision],
    ]) {
      addRequiredField({
        container: artifact.provenance,
        fieldName,
        fieldPath: `provenance.${fieldName}`,
        invalid,
        missing,
        validator,
      });
    }
    if (isGitRevision(expectedSourceRevision) && artifact.provenance.sourceRevision !== expectedSourceRevision) {
      invalid.push("provenance.sourceRevision-mismatch");
    }
    if (requireRuntimeIdentity || "workerIdentity" in artifact.provenance) {
      addRequiredField({
        container: artifact.provenance,
        fieldName: "workerIdentity",
        fieldPath: "provenance.workerIdentity",
        invalid,
        missing,
        validator: isWorkerIdentifier,
      });
    }
  }

  addRequiredField({
    container: artifact.health,
    fieldName: "requestId",
    fieldPath: "health.requestId",
    invalid,
    missing,
    validator: isSanitizedRequestId,
  });
  addRequiredField({
    container: artifact.bootstrap,
    fieldName: "requestId",
    fieldPath: "bootstrap.requestId",
    invalid,
    missing,
    validator: isSanitizedRequestId,
  });
  if (artifact.health?.statusCode !== 200) {
    invalid.push("health.statusCode");
  }
  if (artifact.bootstrap?.statusCode !== 200) {
    invalid.push("bootstrap.statusCode");
  }
  if (!hasBoundedRuntimeControls(artifact.health)) {
    invalid.push("health.runtime-controls");
  }
  if (requireAggregateControls && !hasBoundedAggregateControls(artifact.health)) {
    invalid.push("health.aggregate-controls");
  }
  if (requireRuntimeIdentity || hasRuntimeIdentityMetadata(artifact.health)) {
    const runtimeIdentity = validateRuntimeDeploymentIdentity(artifact.health, {
      expectedApiUrl,
      expectedEnvironment,
      expectedSourceRevision,
      expectedWorkerIdentity: expectedWorkerIdentity || artifact.provenance?.workerIdentity,
      expectedWorkerVersionId: expectedWorkerVersionId || artifact.provenance?.workerVersionId,
    });
    for (const field of runtimeIdentity.invalid) {
      invalid.push(`health.runtime-identity.${field}`);
    }
  }
  if (artifact.health?.structuredOutputMode !== "json_schema_strict") {
    invalid.push("health.structuredOutputMode");
  }
  if (expectedModel && !modelMatchesExpected(artifact.health?.defaultModel, expectedModel)) {
    invalid.push("health.defaultModel");
  }
  if (expectedPromptVersion && artifact.health?.promptVersion !== expectedPromptVersion) {
    invalid.push("health.promptVersion");
  }

  const allRequestIds = [artifact.health?.requestId, artifact.bootstrap?.requestId];
  for (const mode of SMOKE_INTERACTION_MODES) {
    const lane = artifact.lanes?.[mode];
    if (!isObject(lane)) {
      missing.push(`lanes.${mode}`);
      continue;
    }
    if (lane.interactionMode !== mode) {
      invalid.push(`lanes.${mode}.interactionMode`);
    }
    if (!hasSampledFrameEnvelope(lane.requestEnvelope, mode)) {
      invalid.push(`lanes.${mode}.requestEnvelope`);
    }

    const analyze = lane.analyze;
    if (!isObject(analyze)) {
      missing.push(`lanes.${mode}.analyze`);
      continue;
    }
    if (analyze.interactionMode !== mode) {
      invalid.push(`lanes.${mode}.analyze.interactionMode`);
    }
    if (!isSanitizedRequestId(analyze.requestId)) {
      invalid.push(`lanes.${mode}.analyze.requestId`);
    }
    allRequestIds.push(analyze.requestId);
    if (analyze.statusCode !== 200) {
      invalid.push(`lanes.${mode}.analyze.statusCode`);
    }
    if (analyze.executionPath !== "provider-backed") {
      invalid.push(`lanes.${mode}.analyze.executionPath`);
    }
    if (analyze.structuredOutputValid !== true) {
      invalid.push(`lanes.${mode}.analyze.structuredOutputValid`);
    }
    if (Array.isArray(analyze.structuredOutputMissingFields) && analyze.structuredOutputMissingFields.length > 0) {
      invalid.push(`lanes.${mode}.analyze.structuredOutputMissingFields`);
    }
    if (Array.isArray(analyze.structuredOutputInvalidFields) && analyze.structuredOutputInvalidFields.length > 0) {
      invalid.push(`lanes.${mode}.analyze.structuredOutputInvalidFields`);
    }

    const structured = validateStructuredAnalyzeOutput(analyze);
    for (const field of structured.missing) {
      missing.push(`lanes.${mode}.analyze.${field}`);
    }
    for (const field of structured.invalid) {
      invalid.push(`lanes.${mode}.analyze.${field}`);
    }
    const safety = validateAnalyzeSafetyContract(analyze);
    for (const field of safety.invalid) {
      invalid.push(`lanes.${mode}.analyze.safety.${field}`);
    }
    if (expectedModel && !modelMatchesExpected(analyze.model, expectedModel)) {
      invalid.push(`lanes.${mode}.analyze.model`);
    }
    if (expectedPromptVersion && analyze.promptVersion !== expectedPromptVersion) {
      invalid.push(`lanes.${mode}.analyze.promptVersion`);
    }
  }

  if (allRequestIds.length !== 2 + SMOKE_INTERACTION_MODES.length || allRequestIds.some((value) => !isSanitizedRequestId(value))) {
    invalid.push("requestIds.sanitized");
  } else if (new Set(allRequestIds).size !== allRequestIds.length) {
    invalid.push("requestIds.distinct");
  }

  const expectedLaunchContract = buildLaunchContract({ artifact });
  if (!isObject(artifact.launchContract)) {
    missing.push("launchContract");
  } else {
    for (const [fieldName, expectedValue] of Object.entries(expectedLaunchContract)) {
      if (!(fieldName in artifact.launchContract)) {
        missing.push(`launchContract.${fieldName}`);
      } else if (artifact.launchContract[fieldName] !== expectedValue || expectedValue !== true) {
        invalid.push(`launchContract.${fieldName}`);
      }
    }
  }

  return {
    invalid: [...new Set(invalid)],
    missing: [...new Set(missing)],
    valid: missing.length === 0 && invalid.length === 0,
  };
}
