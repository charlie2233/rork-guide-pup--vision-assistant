import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { launchInputs } = require("../../../expo/release/launch-inputs.js");

const VALID_TRACKS = new Set(["staging", "production"]);
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAK0lEQVR4nO3NMQ0AAAwDoPo33ZpYsgcMkD6JWCwWi8VisVgsFovFYrFYfGcs0K5PemaPnAAAAABJRU5ErkJggg==";

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

function deriveAnalyzeSummary(result) {
  if (result.response.ok && result.json) {
    return {
      confidence: result.json.confidence,
      direction: result.json.direction,
      errorCode: undefined,
      errorMessage: undefined,
      executionPath: "provider-backed",
      fallbackReason: result.json.fallbackReason ?? undefined,
      hazardLevel: result.json.hazardLevel,
      latencyMs: result.json.latencyMs,
      message: result.json.message,
      model: result.json.model,
      promptVersion: result.json.promptVersion,
      provider: result.json.provider,
      requestId: result.requestId,
      roundTripLatencyMs: result.roundTripLatencyMs,
      sceneDescription: result.json.sceneDescription,
      statusCode: result.response.status,
      surfaceType: result.json.surfaceType,
    };
  }

  const safeResponse = result.json?.safeResponse;
  const errorCode = result.json?.error?.code;
  const errorMessage = result.json?.error?.message;

  return {
    confidence: safeResponse?.confidence,
    direction: safeResponse?.direction,
    errorCode,
    errorMessage,
    executionPath: safeResponse ? "safe-fallback" : "failed",
    fallbackReason: errorCode,
    hazardLevel: safeResponse?.hazardLevel,
    latencyMs: safeResponse?.latencyMs,
    message: safeResponse?.message,
    model: safeResponse?.model,
    promptVersion: safeResponse?.promptVersion,
    provider: safeResponse?.provider,
    requestId: result.requestId,
    roundTripLatencyMs: result.roundTripLatencyMs,
    sceneDescription: safeResponse?.sceneDescription,
    statusCode: result.response.status,
    surfaceType: safeResponse?.surfaceType,
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
    `  - fallback reason: \`${artifact.analyze.fallbackReason || "none"}\``,
    `  - message: \`${artifact.analyze.message || artifact.analyze.errorMessage || "not-found"}\``,
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

  const analyze = await fetchJson(`${apiUrl}/v1/vision/analyze`, {
    body: JSON.stringify({
      appVersion: "1.0.0",
      detail: "low",
      imageBase64: TEST_IMAGE_BASE64,
      mimeType: "image/png",
      platform: "ios",
      sourceHeight: 40,
      sourceWidth: 40,
    }),
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
      "x-guidepup-device-id": deviceId,
    },
    method: "POST",
  });

  const artifact = {
    analyze: {
      ...deriveAnalyzeSummary(analyze),
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
      defaultModel: health.json?.defaultModel,
      defaultProvider: health.json?.defaultProvider,
      environment: health.json?.environment,
      promptVersion: health.json?.promptVersion,
      requestId: health.requestId,
      roundTripLatencyMs: health.roundTripLatencyMs,
      statusCode: health.response.status,
      statusText: health.response.statusText || "",
    },
    operator: args.operator,
    providerBacked: deriveAnalyzeSummary(analyze).executionPath === "provider-backed",
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
