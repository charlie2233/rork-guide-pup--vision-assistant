import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEvalManifest } from "./manifest.schema.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const DIRECTION_VALUES = new Set(["turn-left", "turn-right", "forward", "stop"]);
const HAZARD_LEVEL_VALUES = new Set(["none", "low", "medium", "high"]);
const LIGHTING_VALUES = new Set(["dark", "dim", "normal", "bright", "unknown"]);
const WALKABILITY_VALUES = new Set(["clear", "caution", "uncertain"]);

function parseArgs(argv) {
  const args = {
    apiBaseUrl: process.env.GUIDEPUP_API_BASE_URL,
    format: "markdown",
    manifest: undefined,
    output: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--manifest") {
      args.manifest = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--api-base-url") {
      args.apiBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--format") {
      args.format = argv[index + 1] || args.format;
      index += 1;
      continue;
    }
    if (value === "--output") {
      args.output = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return args;
}

function normalizePath(inputPath, manifestPath) {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(path.dirname(manifestPath), inputPath);
}

async function loadFixturePayload(fixture, manifestPath) {
  if (fixture.imageBase64) {
    return fixture.imageBase64;
  }

  if (!fixture.imagePath) {
    throw new Error(`Fixture ${fixture.id} needs either imageBase64 or imagePath.`);
  }

  const resolvedPath = normalizePath(fixture.imagePath, manifestPath);
  const bytes = await readFile(resolvedPath);
  return bytes.toString("base64");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  return { json, response, text };
}

function getDeviceIdSuffix(deviceId) {
  if (!deviceId) {
    return "unknown";
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

function buildFixtureRequestEnvelope(fixture, session, index) {
  const timestampMs = fixture.timestampMs ?? Date.now();
  const sessionId = fixture.sessionId || `eval-${getDeviceIdSuffix(session.deviceId)}`;
  const sourceSize = fixture.sourceWidth && fixture.sourceHeight
    ? `${fixture.sourceWidth}x${fixture.sourceHeight}`
    : "unknown-size";
  const frameSummary =
    fixture.frameSummary ||
    `Eval sampled ${fixture.nativePath || "js-fallback"} frame for ${fixture.scenario}, source ${sourceSize}.`;

  return {
    appVersion: "eval-harness",
    captureHeuristics: fixture.captureHeuristics || {
      frameAgeMs: Math.max(0, Date.now() - timestampMs),
      imageSource: fixture.imagePath ? "uri" : fixture.imageBase64 ? "base64" : "unknown",
      resizedForUpload: false,
      uploadedHeight: fixture.sourceHeight,
      uploadedWidth: fixture.sourceWidth,
    },
    detail: fixture.detail,
    frameId: fixture.frameId || `${sessionId}-${fixture.id}-${index + 1}`,
    frameSummary,
    hasImage: Boolean(fixture.imagePath || fixture.imageBase64),
    nativePath: fixture.nativePath || "js-fallback",
    platform: "ios",
    priorGuidance: fixture.priorGuidance || `Eval fixture ${fixture.id}; no previous spoken guidance.`,
    sampledFrame: true,
    sessionId,
    sourceHeight: fixture.sourceHeight,
    sourceWidth: fixture.sourceWidth,
    timestampMs,
  };
}

function sanitizeRequestEnvelope(envelope) {
  return {
    appVersion: envelope.appVersion,
    captureHeuristics: envelope.captureHeuristics,
    detail: envelope.detail,
    frameId: envelope.frameId,
    frameSummary: envelope.frameSummary,
    hasImage: envelope.hasImage,
    nativePath: envelope.nativePath,
    platform: envelope.platform,
    priorGuidance: envelope.priorGuidance,
    sampledFrame: envelope.sampledFrame,
    sessionId: envelope.sessionId,
    sourceHeight: envelope.sourceHeight,
    sourceWidth: envelope.sourceWidth,
    timestampMs: envelope.timestampMs,
  };
}

async function bootstrapSession(apiBaseUrl, deviceId) {
  const { json, response } = await fetchJson(`${apiBaseUrl}/v1/device/bootstrap`, {
    body: JSON.stringify({
      appVersion: "eval-harness",
      deviceId,
      platform: "unknown",
    }),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Bootstrap failed (${response.status}): ${JSON.stringify(json).slice(0, 240)}`);
  }

  return json;
}

async function loadHealth(apiBaseUrl) {
  const { json, response } = await fetchJson(`${apiBaseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status}): ${JSON.stringify(json).slice(0, 240)}`);
  }

  return json;
}

async function analyzeFixture(apiBaseUrl, session, fixture, imageBase64, requestEnvelope) {
  const startedAt = Date.now();
  const { json, response } = await fetchJson(`${apiBaseUrl}/v1/vision/analyze`, {
    body: JSON.stringify({
      ...requestEnvelope,
      imageBase64,
      mimeType: fixture.mimeType,
    }),
    headers: {
      authorization: `Bearer ${session.sessionToken}`,
      "content-type": "application/json",
      "x-guidepup-device-id": session.deviceId,
    },
    method: "POST",
  });

  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    return {
      error: json?.error?.message || `Analyze failed (${response.status})`,
      latencyMs,
      ok: false,
    };
  }

  return {
    latencyMs,
    ok: true,
    response: json,
    structuredOutput: validateStructuredAnalyzeOutput(json),
  };
}

async function benchmarkFixture(apiBaseUrl, session, manifest, fixture, imageBase64, requestEnvelope) {
  if (!manifest.benchmark.enabled) {
    return { skipped: true };
  }

  const headers = {
    authorization: `Bearer ${session.sessionToken}`,
    "content-type": "application/json",
    "x-guidepup-device-id": session.deviceId,
  };

  if (manifest.benchmark.debugToken) {
    headers["x-guidepup-debug-token"] = manifest.benchmark.debugToken;
  }

  const startedAt = Date.now();
  const { json, response } = await fetchJson(`${apiBaseUrl}/__debug/provider-benchmark`, {
    body: JSON.stringify({
      ...requestEnvelope,
      imageBase64,
      mimeType: fixture.mimeType,
      providers: manifest.benchmark.providers,
      samples: manifest.benchmark.samples,
    }),
    headers,
    method: "POST",
  });

  const latencyMs = Date.now() - startedAt;

  if (!response.ok) {
    return {
      error: json?.error?.message || `Benchmark failed (${response.status})`,
      latencyMs,
      ok: false,
      status: response.status,
    };
  }

  return {
    latencyMs,
    ok: true,
    response: json,
  };
}

function summarizeFixtureResult(fixture, result) {
  if (!result.ok) {
    return {
      falseForward: 0,
      fixtureId: fixture.id,
      hazard: fixture.expectedHazard,
      latencyMs: result.latencyMs,
      skipped: false,
      stop: false,
      structuredOutputInvalidFields: [],
    structuredOutputMissingFields: ["response"],
    structuredOutputValid: false,
    valid: false,
    walkability: undefined,
  };
  }

  const direction = result.response?.direction;
  const isStop = direction === "stop";
  const isFalseForward = fixture.expectedHazard && direction === "forward";
  const structuredOutput = result.structuredOutput || validateStructuredAnalyzeOutput(result.response);
  const walkabilityMatches = fixture.expectedWalkability
    ? result.response?.walkability === fixture.expectedWalkability
    : undefined;

  return {
    falseForward: isFalseForward ? 1 : 0,
    fixtureId: fixture.id,
    hazard: fixture.expectedHazard,
    latencyMs: result.latencyMs,
    provider: result.response?.provider,
    model: result.response?.model,
    promptVersion: result.response?.promptVersion,
    confidence: result.response?.confidence,
    fallbackReason:
      result.response && "fallbackReason" in result.response ? result.response.fallbackReason : undefined,
    hazardLevel: result.response?.hazardLevel,
    lighting: result.response?.lighting,
    obstacle: result.response?.obstacle,
    sceneDescription: result.response?.sceneDescription,
    stop: isStop,
    structuredOutputInvalidFields: structuredOutput.invalidFields,
    structuredOutputMissingFields: structuredOutput.missingFields,
    structuredOutputValid: structuredOutput.valid,
    surfaceType: result.response?.surfaceType,
    walkability: result.response?.walkability,
    expectedWalkability: fixture.expectedWalkability,
    walkabilityMatches,
    valid: structuredOutput.valid && walkabilityMatches !== false,
  };
}

function calculateAverage(values) {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function upsertProviderSummary(map, provider, updater) {
  const current = map.get(provider) || {
    count: 0,
    falseForwardCount: 0,
    model: "unknown",
    promptVersion: "unknown",
    stopHits: 0,
    totalLatencyMs: 0,
  };

  updater(current);
  map.set(provider, current);
}

function finalizeProviderSummary(map, hazardFixtureCount) {
  return [...map.values()]
    .map((entry) => ({
      averageLatencyMs: entry.count ? Math.round(entry.totalLatencyMs / entry.count) : 0,
      falseForwardCount: entry.falseForwardCount,
      model: entry.model || "unknown",
      provider: entry.provider,
      promptVersion: entry.promptVersion || "unknown",
      stopRecallPct: hazardFixtureCount ? Math.round((entry.stopHits / hazardFixtureCount) * 100) : 0,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function summarizeScenarios(fixtures) {
  return fixtures.reduce((accumulator, fixture) => {
    const key = fixture.scenario || "unknown";
    const current = accumulator[key] || {
      count: 0,
      falseForwardCount: 0,
      stopCount: 0,
      validCount: 0,
    };

    current.count += 1;
    current.validCount += fixture.valid ? 1 : 0;
    current.stopCount += fixture.direction === "stop" ? 1 : 0;
    current.falseForwardCount += fixture.falseForward || 0;
    accumulator[key] = current;
    return accumulator;
  }, {});
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`# Guide Pup Eval Report`);
  lines.push(``);
  lines.push(`- Manifest: \`${report.manifest.name}\``);
  lines.push(`- API: \`${report.apiBaseUrl}\``);
  lines.push(`- Health environment: \`${report.environment}\``);
  lines.push(`- Prompt version: \`${report.promptVersion}\``);
  lines.push(`- Analyze average latency: \`${report.summary.analyzeAverageLatencyMs} ms\``);
  lines.push(`- STOP recall on hazard fixtures: \`${report.summary.stopRecallPct}%\``);
  lines.push(`- False-forward count: \`${report.summary.falseForwardCount}\``);
  lines.push(``);
  lines.push(`## Analyze Provider Summary`);
  for (const entry of report.analyzeProviders) {
    lines.push(`- \`${entry.provider}\`: model \`${entry.model}\`, avg latency \`${entry.averageLatencyMs} ms\`, STOP recall \`${entry.stopRecallPct}%\`, false-forward \`${entry.falseForwardCount}\``);
  }
  lines.push(``);
  lines.push(`## Benchmark Provider Summary`);
  if (report.benchmarkSkipped) {
    lines.push(`- Benchmark route skipped or disabled.`);
  } else {
    for (const entry of report.benchmarkProviders) {
      lines.push(`- \`${entry.provider}\`: model \`${entry.model}\`, avg latency \`${entry.averageLatencyMs} ms\`, STOP recall \`${entry.stopRecallPct}%\`, false-forward \`${entry.falseForwardCount}\``);
    }
  }
  lines.push(``);
  lines.push(`## Fixtures`);
  for (const fixture of report.fixtures) {
    lines.push(
      `- \`${fixture.fixtureId}\` [${fixture.scenario}]: ${
        fixture.valid ? `direction \`${fixture.direction}\`` : `error: ${fixture.error}`
      }, structured \`${fixture.structuredOutputValid ? "valid" : "invalid"}\`, frame \`${fixture.requestEnvelope.frameId}\`, native path \`${fixture.requestEnvelope.nativePath}\`, latency \`${fixture.latencyMs} ms\``,
    );
    if (!fixture.structuredOutputValid) {
      lines.push(`  - missing fields: \`${fixture.structuredOutputMissingFields.join(", ") || "none"}\``);
      lines.push(`  - invalid fields: \`${fixture.structuredOutputInvalidFields.join(", ") || "none"}\``);
    }
    if (fixture.walkability) {
      lines.push(`  - walkability: \`${fixture.walkability}\``);
    }
    if (fixture.expectedWalkability) {
      lines.push(`  - expected walkability: \`${fixture.expectedWalkability}\`, match: \`${fixture.walkabilityMatches ? "yes" : "no"}\``);
    }
  }
  lines.push(``);
  lines.push(`## Scenario Summary`);
  for (const [scenario, summary] of Object.entries(report.scenarios)) {
    lines.push(`- \`${scenario}\`: fixtures \`${summary.count}\`, valid \`${summary.validCount}\`, STOP \`${summary.stopCount}\`, false-forward \`${summary.falseForwardCount}\``);
  }
  if (report.benchmarkSkipped) {
    lines.push(``);
    lines.push(`Benchmark route was skipped or disabled.`);
  }
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    throw new Error("Pass --manifest <path>.");
  }

  const manifestPath = path.resolve(projectRoot, args.manifest);
  const manifestJson = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifest = loadEvalManifest(manifestJson);
  const apiBaseUrl = (args.apiBaseUrl || manifest.apiBaseUrl || process.env.GUIDEPUP_API_BASE_URL || "").replace(/\/+$/, "");
  if (!apiBaseUrl) {
    throw new Error("Pass --api-base-url or set apiBaseUrl in the manifest.");
  }

  const health = await loadHealth(apiBaseUrl);
  if (health.environment === "production") {
    throw new Error("Refusing to run eval harness against a production Worker.");
  }

  const session = await bootstrapSession(apiBaseUrl, manifest.deviceId || crypto.randomUUID());
  const fixtureSummaries = [];
  const analyzeLatencies = [];
  const hazardFixtures = [];
  let falseForwardCount = 0;
  let stopHits = 0;
  let benchmarkSkipped = false;

  const analyzeProviders = new Map();
  const benchmarkProviders = new Map();

  for (const [fixtureIndex, fixture] of manifest.fixtures.entries()) {
    const imageBase64 = await loadFixturePayload(fixture, manifestPath);
    const requestEnvelope = buildFixtureRequestEnvelope(fixture, session, fixtureIndex);
    const analyzeResult = await analyzeFixture(apiBaseUrl, session, fixture, imageBase64, requestEnvelope);
    const summary = summarizeFixtureResult(fixture, analyzeResult);
    const fixtureError = analyzeResult.ok
      ? summary.structuredOutputValid
        ? summary.walkabilityMatches === false
          ? `Expected walkability ${summary.expectedWalkability}; got ${summary.walkability || "missing"}`
          : undefined
        : `Structured output missing: ${summary.structuredOutputMissingFields.join(", ") || "none"}; invalid: ${summary.structuredOutputInvalidFields.join(", ") || "none"}`
      : analyzeResult.error;
    fixtureSummaries.push({
      ...summary,
      direction: analyzeResult.ok ? analyzeResult.response.direction : undefined,
      error: fixtureError,
      requestEnvelope: sanitizeRequestEnvelope(requestEnvelope),
      scenario: fixture.scenario,
    });

    if (analyzeResult.ok && summary.valid) {
      analyzeLatencies.push(analyzeResult.latencyMs);
      if (fixture.expectedHazard) {
        hazardFixtures.push(fixture.id);
        if (analyzeResult.response.direction === "stop") {
          stopHits += 1;
        }
        if (analyzeResult.response.direction === "forward") {
          falseForwardCount += 1;
        }
      }
      const provider = analyzeResult.response.provider || "unknown";
      upsertProviderSummary(analyzeProviders, provider, (bucket) => {
        bucket.count += 1;
        bucket.model = analyzeResult.response.model || bucket.model;
        bucket.promptVersion = analyzeResult.response.promptVersion || bucket.promptVersion;
        bucket.provider = provider;
        bucket.totalLatencyMs += analyzeResult.latencyMs;
        if (fixture.expectedHazard) {
          bucket.stopHits += analyzeResult.response.direction === "stop" ? 1 : 0;
          bucket.falseForwardCount += analyzeResult.response.direction === "forward" ? 1 : 0;
        }
      });
    }

    const benchmarkResult = await benchmarkFixture(apiBaseUrl, session, manifest, fixture, imageBase64, requestEnvelope);
    if (benchmarkResult.ok && benchmarkResult.response?.results) {
      for (const entry of benchmarkResult.response.results) {
        const key = entry.provider;
        upsertProviderSummary(benchmarkProviders, key, (bucket) => {
          bucket.count += 1;
          bucket.provider = key;
          bucket.totalLatencyMs += entry.averageLatencyMs;
          bucket.model = entry.model || bucket.model;
          bucket.promptVersion = benchmarkResult.response.promptVersion || bucket.promptVersion;
          if (fixture.expectedHazard && entry.direction === "stop") {
            bucket.stopHits += 1;
          }
          if (fixture.expectedHazard && entry.direction === "forward") {
            bucket.falseForwardCount += 1;
          }
        });
      }
    } else if (!benchmarkResult.ok) {
      benchmarkSkipped = true;
    } else if (benchmarkResult.skipped) {
      benchmarkSkipped = true;
    }
  }

  const analyzeProviderSummary = finalizeProviderSummary(analyzeProviders, hazardFixtures.length);
  const benchmarkProviderSummary = finalizeProviderSummary(benchmarkProviders, hazardFixtures.length);

  const report = {
    apiBaseUrl,
    benchmarkSkipped,
    environment: health.environment,
    fixtures: fixtureSummaries,
    manifest: {
      name: manifest.name,
      notes: manifest.notes,
    },
    analyzeProviders: analyzeProviderSummary,
    benchmarkProviders: benchmarkProviderSummary,
    scenarios: summarizeScenarios(fixtureSummaries),
    session: {
      deviceId: session.deviceId,
      expiresAt: session.expiresAt,
    },
    summary: {
      analyzeAverageLatencyMs: calculateAverage(analyzeLatencies),
      falseForwardCount,
      hazardFixtureCount: hazardFixtures.length,
      stopRecallPct: hazardFixtures.length ? Math.round((stopHits / hazardFixtures.length) * 100) : 0,
    },
    promptVersion: health.promptVersion,
  };

  const output = args.format === "json" ? JSON.stringify(report, null, 2) : renderMarkdown(report);
  if (args.output) {
    const outputPath = path.resolve(projectRoot, args.output);
    await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, `${output}\n`, "utf8"));
  } else {
    process.stdout.write(`${output}\n`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
