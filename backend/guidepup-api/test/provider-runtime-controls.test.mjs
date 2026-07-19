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
});

function loadProviderWithFetch(fetchImpl) {
  const warnings = [];
  const providerUrl = new URL("../src/providers/openai-compatible.ts", import.meta.url);
  const overrides = new Map([
    [new URL("../src/lib/logging.ts", import.meta.url).href, {
      logWarn: (event, fields) => warnings.push({ event, fields }),
      sanitizeLogMessage: (value) => value,
    }],
    [new URL("../src/lib/prompts.ts", import.meta.url).href, {
      ProviderVisionJsonSchema: {},
      buildVisionSystemPrompt: () => "system",
      buildVisionUserPrompt: () => "user",
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
      ProviderVisionSchema: { parse: (value) => value },
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
  const { exports, warnings } = loadProviderWithFetch(async () => {
    callCount += 1;
    return new Response("{}", { status: 500 });
  });
  const runtime = exports.getOpenAIProviderRuntimeConfig({
    OPENAI_REQUEST_TIMEOUT_MS: "12000",
    OPENAI_RETRY_COUNT: "2",
    OPENAI_RETRY_DELAY_MS: "0",
  });

  assert.ok(runtime.requestTimeoutMs < 10_000);
  assert.equal(runtime.maxOutboundCalls, 3);

  const provider = new exports.OpenAICompatibleProvider("gpt-5.5");
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
          content: JSON.stringify({
            confidence: 0.91,
            criticalHazards: [],
            hazardLevel: "none",
            lighting: "normal",
            obstacles: [],
            pathClear: true,
            recommendedDirection: "forward",
            sceneDescription: "A clear sidewalk continues ahead.",
            shortMessage: "Continue forward.",
            surfaceType: "sidewalk",
            walkability: "clear",
          }),
        },
      }],
      model: "gpt-5.5",
    });
  });
  const provider = new exports.OpenAICompatibleProvider("gpt-5.5");
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
  assert.equal(result.model, "gpt-5.5");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].event, "vision.provider_attempt_failed");
  assert.equal(warnings[0].fields.requestId, "request-provider-fallback");
});

test("runtime controls and strict Structured Outputs are surfaced in health, smoke, and release evidence gates", () => {
  for (const field of [
    "defaultMaxCompletionTokens",
    "defaultRequestTimeoutMs",
    "defaultRetryCount",
    "defaultRetryDelayMs",
    "structuredOutputMode",
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
