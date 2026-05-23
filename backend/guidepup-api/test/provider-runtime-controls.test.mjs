import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const providerSource = fs.readFileSync(new URL("../src/providers/openai-compatible.ts", import.meta.url), "utf8");
const healthSource = fs.readFileSync(new URL("../src/routes/health.ts", import.meta.url), "utf8");
const liveSmokeSource = fs.readFileSync(new URL("../eval/run-live-smoke.mjs", import.meta.url), "utf8");
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
});

test("runtime controls are surfaced in health, smoke, and release evidence gates", () => {
  for (const field of [
    "defaultMaxCompletionTokens",
    "defaultRequestTimeoutMs",
    "defaultRetryCount",
    "defaultRetryDelayMs",
  ]) {
    assert.match(healthSource, new RegExp(field));
    assert.match(liveSmokeSource, new RegExp(field));
  }

  assert.match(preflightSource, /requireHealthField\("defaultMaxCompletionTokens"/);
  assert.match(preflightSource, /requireHealthField\("defaultRequestTimeoutMs"/);
  assert.match(preflightSource, /requireHealthField\("defaultRetryCount"/);
});
