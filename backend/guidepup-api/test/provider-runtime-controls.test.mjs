import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);

const providerSource = fs.readFileSync(new URL("../src/providers/openai-compatible.ts", import.meta.url), "utf8");
const healthSource = fs.readFileSync(new URL("../src/routes/health.ts", import.meta.url), "utf8");
const liveSmokeSource = fs.readFileSync(new URL("../eval/run-live-smoke.mjs", import.meta.url), "utf8");
const smokeContractUrl = new URL("../eval/smoke-contract.mjs", import.meta.url);
const smokeContractSource = fs.existsSync(smokeContractUrl) ? fs.readFileSync(smokeContractUrl, "utf8") : "";
const preflightSource = fs.readFileSync(new URL("../../../expo/scripts/release-preflight.mjs", import.meta.url), "utf8");
const wranglerConfig = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const visionSchemaSource = fs.readFileSync(new URL("../src/schemas/vision.ts", import.meta.url), "utf8");

test("OpenAI-compatible provider has bounded launch runtime controls", () => {
  for (const envName of [
    "OPENAI_MAX_COMPLETION_TOKENS",
    "OPENAI_REQUEST_TIMEOUT_MS",
    "OPENAI_RETRY_COUNT",
    "OPENAI_RETRY_DELAY_MS",
  ]) {
    assert.match(providerSource, new RegExp(envName));
    assert.match(wranglerConfig, new RegExp(envName));
  }

  assert.match(providerSource, /max_completion_tokens:\s*runtimeConfig\.maxCompletionTokens/);
  assert.match(providerSource, /AbortController/);
  assert.match(providerSource, /isRetryableStatus/);
  assert.match(providerSource, /retryCount:\s*parseBoundedInteger/);
  assert.match(providerSource, /type:\s*"json_schema"/);
  assert.match(providerSource, /strict:\s*true/);
  assert.match(providerSource, /structuredOutputMode:\s*STRUCTURED_OUTPUT_MODE/);
  assert.match(providerSource, /await enforceProviderCallLimit\(env\)/);
  assert.match(providerSource, /"x-client-request-id": input\.requestId/);
  assert.match(providerSource, /response\.headers\.get\("x-request-id"\)/);
  assert.match(providerSource, /extractTokenUsage\(payload\.usage\)/);
});

function loadVisionSchemaModule() {
  const compiled = ts.transpileModule(visionSchemaSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    atob,
    exports: module.exports,
    module,
    require,
    Uint8Array,
  });
  return module.exports;
}

function validProviderVision(overrides = {}) {
  return {
    confidence: 0.91,
    criticalHazards: [],
    hazardLevel: "none",
    lighting: "normal",
    notes: "Clear path.",
    obstacles: [],
    pathClear: true,
    recommendedDirection: "forward",
    sceneDescription: "A clear sidewalk continues ahead.",
    shortMessage: "Continue forward.",
    surfaceType: "sidewalk",
    walkability: "clear",
    ...overrides,
  };
}

function loadProviderWithFetch(
  fetchImpl,
  providerVisionSchema = { parse: (value) => value },
  enforceProviderCallLimit = async () => ({
    allowed: true,
    limit: 120,
    reason: "allowed",
    remaining: 119,
    resetAt: new Date(Date.now() + 60_000).toISOString(),
  }),
) {
  const warnings = [];
  const providerUrl = new URL("../src/providers/openai-compatible.ts", import.meta.url);
  const overrides = new Map([
    [new URL("../src/lib/logging.ts", import.meta.url).href, {
      logWarn: (event, fields) => warnings.push({ event, fields }),
    }],
    [new URL("../src/lib/prompts.ts", import.meta.url).href, {
      ProviderVisionJsonSchema: {},
      buildVisionSystemPrompt: () => "system",
      buildVisionUserPrompt: () => "user",
    }],
    [new URL("../src/lib/rate-limit.ts", import.meta.url).href, {
      enforceProviderCallLimit,
    }],
    [new URL("../src/providers/config.ts", import.meta.url).href, {
      getOpenAIProviderAttempts: () => [
        {
          apiKey: "gateway-key",
          authHeader: "authorization",
          authPrefix: "Bearer ",
          baseUrl: "https://gateway.example/v1",
          name: "ai-gateway",
          path: "/chat/completions",
        },
        {
          apiKey: "fallback-key",
          authHeader: "authorization",
          authPrefix: "Bearer ",
          baseUrl: "https://api.example/v1",
          name: "openai-fallback",
          path: "/chat/completions",
        },
      ],
    }],
    [new URL("../src/schemas/vision.ts", import.meta.url).href, {
      ProviderVisionSchema: providerVisionSchema,
    }],
  ]);
  const compiled = ts.transpileModule(fs.readFileSync(providerUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) {
      return require(specifier);
    }
    const resolved = new URL(specifier, new URL("./", providerUrl));
    if (!resolved.pathname.endsWith(".ts")) {
      resolved.pathname = `${resolved.pathname}.ts`;
    }
    const override = overrides.get(resolved.href);
    if (!override) {
      throw new Error(`Missing provider test override for ${resolved.href}`);
    }
    return override;
  };

  vm.runInNewContext(compiled.outputText, {
    AbortController,
    Date,
    Error,
    JSON,
    Response,
    URL,
    clearTimeout,
    exports: module.exports,
    fetch: fetchImpl,
    module,
    require: localRequire,
    setTimeout,
  }, { filename: fileURLToPath(providerUrl) });

  return { exports: module.exports, warnings };
}

test("provider uses one sub-client deadline and a strict call cap across retries and fallback", async () => {
  let callCount = 0;
  let limiterCalls = 0;
  const { exports, warnings } = loadProviderWithFetch(async () => {
    callCount += 1;
    return new Response("{}", { status: 500 });
  }, undefined, async () => {
    limiterCalls += 1;
    return {
      allowed: true,
      limit: 120,
      reason: "allowed",
      remaining: 120 - limiterCalls,
      resetAt: new Date(Date.now() + 60_000).toISOString(),
    };
  });
  const runtime = exports.getOpenAIProviderRuntimeConfig({
    OPENAI_REQUEST_TIMEOUT_MS: "12000",
    OPENAI_RETRY_COUNT: "2",
    OPENAI_RETRY_DELAY_MS: "0",
  });

  assert.ok(runtime.requestTimeoutMs < 10_000);
  assert.equal(runtime.maxOutboundCalls, 3);
  assert.equal(exports.getOpenAIProviderRuntimeConfig({}).model, "gpt-5.6-sol");

  const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");
  await assert.rejects(() => provider.analyze({
    detail: "low",
    imageBase64: "a".repeat(128),
    interactionMode: "guidance",
    mimeType: "image/jpeg",
    promptVersion: "test-prompt",
    requestId: "request-provider-budget",
  }, {
    OPENAI_REQUEST_TIMEOUT_MS: "12000",
    OPENAI_RETRY_COUNT: "2",
    OPENAI_RETRY_DELAY_MS: "0",
  }));

  assert.equal(callCount, 3);
  assert.equal(limiterCalls, 3);
  assert.ok(warnings.some(({ event }) => event === "vision.provider_attempt_retry"));
  assert.ok(warnings.some(({ event }) => event === "vision.provider_attempt_failed"));
  for (const warning of warnings) {
    assert.equal(warning.fields.requestId, "request-provider-budget", warning.event);
  }
});

test("provider can use one bounded fallback call and correlates the failover log", async () => {
  let callCount = 0;
  const { exports, warnings } = loadProviderWithFetch(async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response("{}", { status: 500 });
    }

    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify(validProviderVision()),
        },
      }],
      model: "gpt-5.6-sol",
    });
  });
  const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");
  const result = await provider.analyze({
    detail: "low",
    imageBase64: "a".repeat(128),
    interactionMode: "guidance",
    mimeType: "image/jpeg",
    promptVersion: "test-prompt",
    requestId: "request-provider-fallback",
  }, {
    OPENAI_REQUEST_TIMEOUT_MS: "8500",
    OPENAI_RETRY_COUNT: "0",
    OPENAI_RETRY_DELAY_MS: "0",
  });

  assert.equal(callCount, 2);
  assert.equal(result.transport, "openai-fallback");
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "vision.provider_attempt_failed");
  assert.equal(warnings[0].fields.requestId, "request-provider-fallback");
});

test("provider propagates the local request ID and captures only bounded upstream metadata", async () => {
  let outboundHeaders;
  const { exports } = loadProviderWithFetch(async (_url, init) => {
    outboundHeaders = new Headers(init.headers);
    return Response.json({
      choices: [{ message: { content: JSON.stringify(validProviderVision()) } }],
      model: "gpt-5.6-sol",
      usage: {
        completion_tokens: -1,
        prompt_tokens: 321,
        total_tokens: 2_000_000,
      },
    }, {
      headers: { "x-request-id": "req_upstream-123" },
    });
  });
  const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");
  const result = await provider.analyze({
    detail: "low",
    imageBase64: "a".repeat(128),
    interactionMode: "guidance",
    mimeType: "image/jpeg",
    promptVersion: "test-prompt",
    requestId: "11111111-1111-4111-8111-111111111111",
  }, {
    OPENAI_REQUEST_TIMEOUT_MS: "3000",
    OPENAI_RETRY_COUNT: "0",
    OPENAI_RETRY_DELAY_MS: "0",
  });

  assert.equal(outboundHeaders.get("x-client-request-id"), "11111111-1111-4111-8111-111111111111");
  assert.equal(result.upstreamRequestId, "req_upstream-123");
  assert.equal(result.usage.inputTokens, 321);
  assert.equal(result.usage.outputTokens, undefined);
  assert.equal(result.usage.totalTokens, 1_000_000);
  assert.equal("rawText" in result, false);
  assert.equal("rawResponse" in result, false);
});

test("provider global call limiter fails closed before fetch and across fallback", async () => {
  let fetchCalls = 0;
  let limiterCalls = 0;
  const { exports } = loadProviderWithFetch(
    async () => {
      fetchCalls += 1;
      return Response.json({});
    },
    { parse: (value) => value },
    async () => {
      limiterCalls += 1;
      return {
        allowed: false,
        limit: 120,
        reason: "limit-exceeded",
        remaining: 0,
        resetAt: new Date(Date.now() + 60_000).toISOString(),
      };
    },
  );
  const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");

  await assert.rejects(() => provider.analyze({
    detail: "low",
    imageBase64: "a".repeat(128),
    interactionMode: "guidance",
    mimeType: "image/jpeg",
    promptVersion: "test-prompt",
    requestId: "request-global-provider-cap",
  }, {
    OPENAI_RETRY_COUNT: "2",
    OPENAI_RETRY_DELAY_MS: "0",
  }), /Provider call budget is exhausted/);

  assert.equal(limiterCalls, 1);
  assert.equal(fetchCalls, 0);
});

test("provider rejects partial, extra-field, and fenced JSON even when a gateway ignores strict mode", async () => {
  const { ProviderVisionSchema } = loadVisionSchemaModule();
  const invalidContents = [
    JSON.stringify(validProviderVision({ notes: undefined })),
    JSON.stringify(validProviderVision({ unexpected: "field" })),
    `\`\`\`json\n${JSON.stringify(validProviderVision())}\n\`\`\``,
  ];

  for (const content of invalidContents) {
    const { exports } = loadProviderWithFetch(async () => Response.json({
      choices: [{ message: { content } }],
      model: "gpt-5.6-sol",
    }), ProviderVisionSchema);
    const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");

    await assert.rejects(() => provider.analyze({
      detail: "low",
      imageBase64: "a".repeat(128),
      interactionMode: "guidance",
      mimeType: "image/jpeg",
      promptVersion: "test-prompt",
      requestId: "request-provider-strict-rejection",
    }, {
      OPENAI_REQUEST_TIMEOUT_MS: "3000",
      OPENAI_RETRY_COUNT: "0",
      OPENAI_RETRY_DELAY_MS: "0",
    }));
  }
});

test("provider errors never retain or log raw upstream response text", async () => {
  const rawMarker = "private-upstream-response-marker";
  for (const responseFactory of [
    () => new Response(`{${rawMarker}`, {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
    () => Response.json({
      choices: [{ message: { refusal: rawMarker } }],
      model: "gpt-5.6-sol",
    }),
    () => Response.json({
      choices: [{ message: { content: rawMarker } }],
      model: "gpt-5.6-sol",
    }),
  ]) {
    const { exports, warnings } = loadProviderWithFetch(async () => responseFactory());
    const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");
    let rejected;
    try {
      await provider.analyze({
        detail: "low",
        imageBase64: "a".repeat(128),
        interactionMode: "guidance",
        mimeType: "image/jpeg",
        promptVersion: "test-prompt",
        requestId: "request-no-raw-upstream",
      }, {
        OPENAI_REQUEST_TIMEOUT_MS: "3000",
        OPENAI_RETRY_COUNT: "0",
        OPENAI_RETRY_DELAY_MS: "0",
      });
    } catch (error) {
      rejected = error;
    }

    assert.ok(rejected instanceof Error);
    assert.doesNotMatch(rejected.message, new RegExp(rawMarker));
    assert.doesNotMatch(JSON.stringify(warnings), new RegExp(rawMarker));
  }
});

test("provider deadline remains active while the success response body is parsed", async () => {
  const fetchImpl = async (_url, init) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"choices":['));
      init.signal.addEventListener("abort", () => {
        controller.error(new DOMException("The operation was aborted.", "AbortError"));
      }, { once: true });
    },
  }), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
  const { exports } = loadProviderWithFetch(fetchImpl);
  const provider = new exports.OpenAICompatibleProvider("gpt-5.6-sol");
  const startedAt = Date.now();

  await assert.rejects(() => provider.analyze({
    detail: "low",
    imageBase64: "a".repeat(128),
    interactionMode: "guidance",
    mimeType: "image/jpeg",
    promptVersion: "test-prompt",
    requestId: "request-provider-body-timeout",
  }, {
    OPENAI_REQUEST_TIMEOUT_MS: "3000",
    OPENAI_RETRY_COUNT: "0",
    OPENAI_RETRY_DELAY_MS: "0",
  }), (error) => error?.name === "AbortError");

  assert.ok(Date.now() - startedAt < 4500);
});

test("runtime controls and strict Structured Outputs are surfaced in health, smoke, and release evidence gates", () => {
  for (const field of [
    "analyzeDeviceRateLimitPerMinute",
    "analyzeIpRateLimitPerMinute",
    "bootstrapIpRateLimitPerMinute",
    "defaultMaxCompletionTokens",
    "defaultRequestTimeoutMs",
    "defaultRetryCount",
    "defaultRetryDelayMs",
    "providerGlobalCallLimitPerMinute",
    "sessionTtlSeconds",
    "structuredOutputMode",
    "workerVersionId",
  ]) {
    assert.match(healthSource, new RegExp(field));
    assert.match(liveSmokeSource, new RegExp(field));
  }

  assert.match(preflightSource, /requireHealthField\("defaultMaxCompletionTokens"/);
  assert.match(preflightSource, /requireHealthField\("defaultRequestTimeoutMs"/);
  assert.match(preflightSource, /requireHealthField\("defaultRetryCount"/);
  assert.match(preflightSource, /requireHealthField\("structuredOutputMode"/);
  assert.match(preflightSource, /requireLaunchContractField\("strictStructuredOutputsPresent"/);
  assert.match(`${liveSmokeSource}\n${smokeContractSource}`, /strictStructuredOutputsPresent/);
});
