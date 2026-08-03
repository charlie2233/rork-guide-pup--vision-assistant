import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const healthUrl = new URL("../src/routes/health.ts", import.meta.url);
const wranglerConfig = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function loadHealthModule() {
  const compiled = ts.transpileModule(fs.readFileSync(healthUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    URL,
    exports: module.exports,
    module,
    require(specifier) {
      if (specifier === "../lib/http") {
        return { jsonResponse: () => new Response() };
      }
      if (specifier === "../lib/prompts") {
        return { getPromptVersion: () => "test-prompt" };
      }
      if (specifier === "../lib/rate-limit") {
        return { getRateLimitCaps: () => ({}) };
      }
      if (specifier === "../lib/session") {
        return { getSessionTtlSeconds: () => 3600 };
      }
      if (specifier === "../providers") {
        return {
          getBenchmarkProviderNamesForEnv: () => [],
          getProviderSummary: () => ({}),
        };
      }
      throw new Error(`Unexpected health import: ${specifier}`);
    },
  });
  return module.exports;
}

function productionEnv(overrides = {}) {
  return {
    CF_VERSION_METADATA: { id: "66666666-6666-4666-8666-666666666666" },
    ENVIRONMENT: "production",
    EXPECTED_API_URL: "https://guidepup-api-production.example.test",
    SOURCE_REVISION: "a".repeat(40),
    WORKER_IDENTITY: "guidepup-api-production",
    ...overrides,
  };
}

test("production health identity is valid only on the pinned endpoint with stamped version metadata", () => {
  const { getRuntimeDeploymentIdentity } = loadHealthModule();
  const valid = getRuntimeDeploymentIdentity(
    new Request("https://guidepup-api-production.example.test/health"),
    productionEnv(),
  );
  assert.equal(valid.deploymentIdentityValid, true);
  assert.equal(valid.workerVersionId, "66666666-6666-4666-8666-666666666666");

  const wrongEndpoint = getRuntimeDeploymentIdentity(
    new Request("https://wrong-account.example.test/health"),
    productionEnv(),
  );
  assert.equal(wrongEndpoint.deploymentIdentityValid, false);

  const unstamped = getRuntimeDeploymentIdentity(
    new Request("https://guidepup-api-production.example.test/health"),
    productionEnv({ CF_VERSION_METADATA: undefined, SOURCE_REVISION: "development" }),
  );
  assert.equal(unstamped.deploymentIdentityValid, false);
});

test("Wrangler declares version metadata and pinned identities for every environment", () => {
  const config = JSON.parse(wranglerConfig);
  assert.equal(config.version_metadata.binding, "CF_VERSION_METADATA");
  assert.equal(config.env.staging.version_metadata.binding, "CF_VERSION_METADATA");
  assert.equal(config.env.production.version_metadata.binding, "CF_VERSION_METADATA");
  assert.equal(config.env.staging.vars.WORKER_IDENTITY, "guidepup-api-staging");
  assert.equal(config.env.production.vars.WORKER_IDENTITY, "guidepup-api-production");
  assert.match(config.env.staging.vars.EXPECTED_API_URL, /guidepup-api-staging/);
  assert.match(config.env.production.vars.EXPECTED_API_URL, /guidepup-api-production/);
});
