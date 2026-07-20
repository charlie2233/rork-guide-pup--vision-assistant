import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const configUrl = new URL("../src/providers/config.ts", import.meta.url);

function loadProviderConfig() {
  const compiled = ts.transpileModule(fs.readFileSync(configUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    Error,
    Set,
    URL,
    exports: module.exports,
    module,
    require(specifier) {
      if (specifier === "../lib/config") {
        return {
          isNonProduction: () => false,
          parseBoolean: () => false,
        };
      }
      throw new Error(`Unexpected provider config import: ${specifier}`);
    },
  });
  return module.exports;
}

test("OpenAI key is routed only to api.openai.com", () => {
  const { getOpenAIProviderAttempts } = loadProviderConfig();
  const attempts = getOpenAIProviderAttempts({
    OPENAI_API_KEY: "openai-secret",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
  });

  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].apiKey, "openai-secret");
  assert.equal(attempts[0].baseUrl, "https://api.openai.com/v1");
  assert.equal(attempts[0].name, "openai-direct");

  assert.throws(() => getOpenAIProviderAttempts({
    OPENAI_API_KEY: "openai-secret",
    OPENAI_BASE_URL: "https://gateway.example/v1",
    PROVIDER_ALLOWED_ORIGINS: "https://gateway.example",
  }), /OPENAI_API_KEY may only be sent to api\.openai\.com/);
});

test("custom gateway hosts require an allowlist entry and dedicated credentials", () => {
  const { getOpenAIProviderAttempts } = loadProviderConfig();
  const base = {
    AI_GATEWAY_BASE_URL: "https://gateway.example/account/guidepup",
    OPENAI_API_KEY: "must-not-be-reused",
  };

  assert.throws(() => getOpenAIProviderAttempts(base), /AI_GATEWAY_API_KEY is required/);
  assert.throws(() => getOpenAIProviderAttempts({
    ...base,
    AI_GATEWAY_API_KEY: "gateway-secret",
  }), /origin is not allowlisted/);

  const attempts = getOpenAIProviderAttempts({
    ...base,
    AI_GATEWAY_API_KEY: "gateway-secret",
    PROVIDER_ALLOWED_ORIGINS: "https://gateway.example",
  });
  assert.equal(attempts[0].apiKey, "gateway-secret");
  assert.notEqual(attempts[0].apiKey, base.OPENAI_API_KEY);
  assert.equal(attempts[0].baseUrl, "https://gateway.example/account/guidepup");
  assert.equal(attempts[1].baseUrl, "https://api.openai.com/v1");
});

test("custom fallback hosts never inherit the OpenAI key", () => {
  const { getOpenAIProviderAttempts } = loadProviderConfig();
  const env = {
    AI_GATEWAY_FALLBACK_BASE_URL: "https://fallback.example/v1",
    OPENAI_API_KEY: "must-not-be-reused",
    PROVIDER_ALLOWED_ORIGINS: "https://fallback.example",
  };

  assert.throws(() => getOpenAIProviderAttempts(env), /AI_GATEWAY_FALLBACK_API_KEY is required/);
  const attempts = getOpenAIProviderAttempts({
    ...env,
    AI_GATEWAY_FALLBACK_API_KEY: "fallback-secret",
  });
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].apiKey, "fallback-secret");
  assert.equal(attempts[0].name, "configured-fallback");
});

test("provider routes reject insecure and ambiguous URLs", () => {
  const { getOpenAIProviderAttempts } = loadProviderConfig();
  const invalidBaseUrls = [
    "http://gateway.example/v1",
    "https://user:password@gateway.example/v1",
    "https://gateway.example/v1?token=secret",
    "https://gateway.example/v1#fragment",
  ];

  for (const baseUrl of invalidBaseUrls) {
    assert.throws(() => getOpenAIProviderAttempts({
      AI_GATEWAY_API_KEY: "gateway-secret",
      AI_GATEWAY_BASE_URL: baseUrl,
      PROVIDER_ALLOWED_ORIGINS: "https://gateway.example",
    }), /HTTPS|credentials|query data|fragments/);
  }

  assert.throws(() => getOpenAIProviderAttempts({
    AI_GATEWAY_API_KEY: "gateway-secret",
    AI_GATEWAY_BASE_URL: "https://gateway.example/v1",
    PROVIDER_ALLOWED_ORIGINS: "https://gateway.example/path",
  }), /must be credential-free HTTPS origins/);
});
