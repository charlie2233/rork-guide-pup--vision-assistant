import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { launchInputs } = require("../../../expo/release/launch-inputs.js");

const VALID_TRACKS = new Set(["staging", "production"]);
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAK0lEQVR4nO3NMQ0AAAwDoPo33ZpYsgcMkD6JWCwWi8VisVgsFovFYrFYfGcs0K5PemaPnAAAAABJRU5ErkJggg==";
const DIRECTION_VALUES = new Set(["turn-left", "turn-right", "forward", "stop"]);
const HAZARD_LEVEL_VALUES = new Set(["none", "low", "medium", "high"]);
const LIGHTING_VALUES = new Set(["dark", "dim", "normal", "bright", "unknown"]);
const WALKABILITY_VALUES = new Set(["clear", "caution", "uncertain"]);

function parseArgs(argv) {
  const args = {
    env: undefined,
    outputJson: undefined,
    outputMd: undefined,
    operator: "Codex",
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
  }

  return args;
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

function getOutputPath(value) {
  return value ? path.resolve(process.cwd(), value) : undefined;
}

async function fetchJson(url, init) {
  const startedAt = performance.now();
  const response = await fetch(url, init);
  const roundTripLatencyMs = Math.round(performance.now() - startedAt);
  const requestId = response.headers.get("x-request-id")?.trim() || undefined;
  const rawText = await response.text();
  let json;

  try {
    json = rawText ? JSON.parse(rawText) : undefined;
  } catch {
    json = undefined;
  }

  return {
    json,
    rawText,
    requestId,
    response,
    roundTripLatencyMs,
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function getDeviceIdSuffix(deviceId) {
  if (!deviceId) {
    return undefined;
  }

  return deviceId.length > 8 ? deviceId.slice(-8) : deviceId;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStructuredAnalyzeOutput(responseBody) {
  const missingFields = [];
  const invalidFields = [];

  const requireField = (fieldName, validator) => {
    if (!(fieldName in responseBody) || responseBody[fieldName] === undefined || responseBody[fieldName] === null) {
      missingFields.push(fieldName);
      return;
    }

    if (!validator(responseBody[fieldName])) {
      invalidFields.push(fieldName);
    }
  };

  if (!responseBody || typeof responseBody !== "object" || Array.isArray(responseBody)) {
    return {
      invalidFields: ["response"],
      missingFields,
      valid: false,
    };
  }

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
    missingFields.push("fallbackReason");
  } else if (
    responseBody.fallbackReason !== null &&
    responseBody.fallbackReason !== undefined &&
    !isNonEmptyString(responseBody.fallbackReason)
  ) {
    invalidFields.push("fallbackReason");
  }

  return {
    invalidFields,
    missingFields,
    valid: missingFields.length === 0 && invalidFields.length === 0,
  };
}

function buildAnalyzeRequestPayload(env) {
  const timestampMs = Date.now();
  const sessionId = `smoke-${env}-${timestampMs}`;

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
    frameId: `${sessionId}-frame-1`,
    frameSummary: "Synthetic sampled js-fallback smoke frame, source 40x40, upload 40x40.",
    hasImage: true,
    imageBase64: TEST_IMAGE_BASE64,
    mimeType: "image/png",
    nativePath: "js-fallback",
    platform: "ios",
    priorGuidance: "Synthetic smoke sample; no previous spoken guidance.",
    sampledFrame: true,
    sessionId,
    sourceHeight: 40,
    sourceWidth: 40,
    timestampMs,
  };
}

function sanitizeAnalyzeRequestEnvelope(payload) {
  return {
    appVersion: payload.appVersion,
    captureHeuristics: payload.captureHeuristics,
    detail: payload.detail,
    frameId: payload.frameId,
    frameSummary: payload.frameSummary,
    hasImage: payload.hasImage,
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

function deriveAnalyzeSummary(result) {
  if (result.response.ok && result.json) {
    const structuredOutput = validateStructuredAnalyzeOutput(result.json);
    return {
      confidence: result.json.confidence,
      direction: result.json.direction,
      errorCode: undefined,
      errorMessage: undefined,
      executionPath: "provider-backed",
      fallbackReason: result.json.fallbackReason ?? null,
      hazardLevel: result.json.hazardLevel,
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
      structuredOutputInvalidFields: structuredOutput.invalidFields,
      structuredOutputMissingFields: structuredOutput.missingFields,
      structuredOutputValid: structuredOutput.valid,
      surfaceType: result.json.surfaceType,
      walkability: result.json.walkability,
    };
  }

  const safeResponse = result.json?.safeResponse;
  const errorCode = result.json?.error?.code;
  const errorMessage = result.json?.error?.message;
  const structuredOutput = safeResponse
    ? validateStructuredAnalyzeOutput(safeResponse)
    : {
        invalidFields: [],
        missingFields: ["safeResponse"],
        valid: false,
      };

  return {
    confidence: safeResponse?.confidence,
    direction: safeResponse?.direction,
    errorCode,
    errorMessage,
    executionPath: safeResponse ? "safe-fallback" : "failed",
    fallbackReason: errorCode,
    hazardLevel: safeResponse?.hazardLevel,
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
    structuredOutputInvalidFields: structuredOutput.invalidFields,
    structuredOutputMissingFields: structuredOutput.missingFields,
    structuredOutputValid: structuredOutput.valid,
    surfaceType: safeResponse?.surfaceType,
    walkability: safeResponse?.walkability,
  };
}

function toMarkdown(artifact) {
  const lines = [
    "# Guide Pup Smoke Results",
    "",
    `Date: ${artifact.generatedAt.slice(0, 10)}`,
    `Environment: ${artifact.environment}`,
    `Operator: ${artifact.operator}`,
    "",
    "## Target URLs",
    "",
    `- API: \`${artifact.apiUrl}\``,
    "",
    "## Worker smoke",
    "",
    "- `GET /health`",
    `  - status: \`${artifact.health.statusCode} ${artifact.health.statusText}\``,
    `  - request id: \`${artifact.health.requestId || "not-found"}\``,
    `  - provider: \`${artifact.health.defaultProvider || "not-found"}\``,
    `  - model: \`${artifact.health.defaultModel || "not-found"}\``,
    `  - reasoning effort: \`${artifact.health.defaultReasoningEffort || "not-found"}\``,
    `  - max completion tokens: \`${artifact.health.defaultMaxCompletionTokens ?? "not-found"}\``,
    `  - request timeout: \`${artifact.health.defaultRequestTimeoutMs ?? "not-found"}ms\``,
    `  - retry count: \`${artifact.health.defaultRetryCount ?? "not-found"}\``,
    `  - retry delay: \`${artifact.health.defaultRetryDelayMs ?? "not-found"}ms\``,
    `  - prompt version: \`${artifact.health.promptVersion || "not-found"}\``,
    `  - latency: \`${artifact.health.roundTripLatencyMs}ms\``,
    "- `POST /v1/device/bootstrap`",
    `  - status: \`${artifact.bootstrap.statusCode} ${artifact.bootstrap.statusText}\``,
    `  - request id: \`${artifact.bootstrap.requestId || "not-found"}\``,
    `  - device id suffix: \`${artifact.bootstrap.deviceIdSuffix || "not-found"}\``,
    `  - latency: \`${artifact.bootstrap.roundTripLatencyMs}ms\``,
    "- `POST /v1/vision/analyze`",
    `  - status: \`${artifact.analyze.statusCode} ${artifact.analyze.statusText}\``,
    `  - request id: \`${artifact.analyze.requestId || "not-found"}\``,
    `  - execution path: \`${artifact.analyze.executionPath}\``,
    `  - provider: \`${artifact.analyze.provider || "not-found"}\``,
    `  - model: \`${artifact.analyze.model || "not-found"}\``,
    `  - prompt version: \`${artifact.analyze.promptVersion || "not-found"}\``,
    `  - request latency: \`${artifact.analyze.roundTripLatencyMs}ms\``,
    `  - service latency: \`${typeof artifact.analyze.latencyMs === "number" ? `${artifact.analyze.latencyMs}ms` : "not-found"}\``,
    `  - structured output valid: \`${artifact.analyze.structuredOutputValid ? "yes" : "no"}\``,
    `  - structured output missing fields: \`${artifact.analyze.structuredOutputMissingFields?.join(", ") || "none"}\``,
    `  - structured output invalid fields: \`${artifact.analyze.structuredOutputInvalidFields?.join(", ") || "none"}\``,
    `  - obstacle: \`${typeof artifact.analyze.obstacle === "boolean" ? String(artifact.analyze.obstacle) : "not-found"}\``,
    `  - hazard level: \`${artifact.analyze.hazardLevel || "not-found"}\``,
    `  - confidence: \`${typeof artifact.analyze.confidence === "number" ? artifact.analyze.confidence : "not-found"}\``,
    `  - lighting: \`${artifact.analyze.lighting || "not-found"}\``,
    `  - surface type: \`${artifact.analyze.surfaceType || "not-found"}\``,
    `  - walkability: \`${artifact.analyze.walkability || "not-found"}\``,
    `  - scene description: \`${artifact.analyze.sceneDescription || "not-found"}\``,
    `  - fallback reason: \`${artifact.analyze.fallbackReason || "none"}\``,
    `  - message: \`${artifact.analyze.message || artifact.analyze.errorMessage || "not-found"}\``,
    "",
    "## Analyze request envelope",
    "",
    `- sampled frame: \`${artifact.requestEnvelope.sampledFrame ? "yes" : "no"}\``,
    `- image included: \`${artifact.requestEnvelope.hasImage ? "yes" : "no"}\``,
    `- app version: \`${artifact.requestEnvelope.appVersion}\``,
    `- session id: \`${artifact.requestEnvelope.sessionId}\``,
    `- frame id: \`${artifact.requestEnvelope.frameId}\``,
    `- frame summary: \`${artifact.requestEnvelope.frameSummary}\``,
    `- timestamp ms: \`${artifact.requestEnvelope.timestampMs}\``,
    `- native path: \`${artifact.requestEnvelope.nativePath}\``,
    `- platform: \`${artifact.requestEnvelope.platform}\``,
    `- detail: \`${artifact.requestEnvelope.detail}\``,
    `- dimensions: \`${artifact.requestEnvelope.sourceWidth}x${artifact.requestEnvelope.sourceHeight}\``,
    `- capture heuristics: \`${JSON.stringify(artifact.requestEnvelope.captureHeuristics)}\``,
    `- prior guidance: \`${artifact.requestEnvelope.priorGuidance}\``,
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assert(args.env && VALID_TRACKS.has(args.env), "Use --env staging or --env production.");

  const apiUrl = getApiUrl(args.env);
  assert(apiUrl && !apiUrl.startsWith("TODO_"), `No API URL configured for ${args.env}.`);

  const health = await fetchJson(`${apiUrl}/health`, {
    headers: {
      "content-type": "application/json",
    },
    method: "GET",
  });

  assert(health.response.ok, `${args.env} /health failed with ${health.response.status}.`);

  const bootstrap = await fetchJson(`${apiUrl}/v1/device/bootstrap`, {
    body: JSON.stringify({
      appVersion: "1.0.0",
      platform: "ios",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert(bootstrap.response.ok, `${args.env} /v1/device/bootstrap failed with ${bootstrap.response.status}.`);

  const sessionToken = bootstrap.json?.sessionToken;
  const deviceId = bootstrap.json?.deviceId;
  assert(sessionToken, `${args.env} bootstrap did not return a sessionToken.`);
  assert(deviceId, `${args.env} bootstrap did not return a deviceId.`);

  const analyzePayload = buildAnalyzeRequestPayload(args.env);
  const analyze = await fetchJson(`${apiUrl}/v1/vision/analyze`, {
    body: JSON.stringify(analyzePayload),
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
      "x-guidepup-device-id": deviceId,
    },
    method: "POST",
  });

  const analyzeSummary = deriveAnalyzeSummary(analyze);
  const artifact = {
    analyze: {
      ...analyzeSummary,
      statusText: analyze.response.statusText || "",
    },
    apiUrl,
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
    environment: args.env,
    generatedAt: new Date().toISOString(),
    health: {
      benchmarkProviders: health.json?.benchmarkProviders,
      defaultMaxCompletionTokens: health.json?.defaultMaxCompletionTokens,
      defaultModel: health.json?.defaultModel,
      defaultProvider: health.json?.defaultProvider,
      defaultReasoningEffort: health.json?.defaultReasoningEffort,
      defaultRequestTimeoutMs: health.json?.defaultRequestTimeoutMs,
      defaultRetryCount: health.json?.defaultRetryCount,
      defaultRetryDelayMs: health.json?.defaultRetryDelayMs,
      environment: health.json?.environment,
      promptVersion: health.json?.promptVersion,
      requestId: health.requestId,
      roundTripLatencyMs: health.roundTripLatencyMs,
      statusCode: health.response.status,
      statusText: health.response.statusText || "",
    },
    operator: args.operator,
    providerBacked: analyzeSummary.executionPath === "provider-backed" && analyzeSummary.structuredOutputValid === true,
    requestEnvelope: sanitizeAnalyzeRequestEnvelope(analyzePayload),
  };

  const outputJsonPath = getOutputPath(args.outputJson);
  const outputMdPath = getOutputPath(args.outputMd);

  if (outputJsonPath) {
    fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
    fs.writeFileSync(outputJsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  }

  if (outputMdPath) {
    fs.mkdirSync(path.dirname(outputMdPath), { recursive: true });
    fs.writeFileSync(outputMdPath, toMarkdown(artifact));
  }

  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
