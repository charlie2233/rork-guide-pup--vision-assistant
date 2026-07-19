import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);
const rateLimitUrl = new URL("../src/lib/rate-limit.ts", import.meta.url);
const bootstrapSource = fs.readFileSync(new URL("../src/routes/bootstrap.ts", import.meta.url), "utf8");

function loadRateLimitModule() {
  const warnings = [];
  const compiled = ts.transpileModule(fs.readFileSync(rateLimitUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "cloudflare:workers") {
      return { DurableObject: class {} };
    }
    if (specifier === "./logging") {
      return { logWarn: (event, fields) => warnings.push({ event, fields }) };
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled.outputText, {
    Date,
    Error,
    JSON,
    Request,
    Response,
    TextEncoder,
    crypto: globalThis.crypto,
    exports: module.exports,
    module,
    require: localRequire,
  }, { filename: fileURLToPath(rateLimitUrl) });

  return { exports: module.exports, warnings };
}

test("analyze rate limiting fails closed when its Durable Object binding is missing or unavailable", async () => {
  const { exports, warnings } = loadRateLimitModule();
  const missing = await exports.enforceRateLimit("trusted-device", {});
  const unavailable = await exports.enforceRateLimit("trusted-device", {
    RATE_LIMITER: {
      getByName: () => ({
        fetch: async () => {
          throw new Error("rate limiter unavailable");
        },
      }),
    },
  });

  for (const decision of [missing, unavailable]) {
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, "infrastructure-unavailable");
    assert.equal(decision.remaining, 0);
  }
  assert.ok(warnings.some(({ event }) => event === "rate_limit.unavailable"));
});

test("bootstrap limits use a stable hashed Cloudflare address subject without exposing raw IP", async () => {
  const { exports } = loadRateLimitModule();
  const subjects = [];
  const env = {
    RATE_LIMITER: {
      getByName: (name) => {
        subjects.push(name);
        return {
          fetch: async (_url, init) => {
            const { limit } = JSON.parse(init.body);
            return Response.json({
              allowed: true,
              limit,
              reason: "allowed",
              remaining: limit - 1,
              resetAt: new Date(Date.now() + 60_000).toISOString(),
            });
          },
        };
      },
    },
  };
  const request = new Request("https://api.example.test/v1/device/bootstrap", {
    headers: { "cf-connecting-ip": "203.0.113.42" },
    method: "POST",
  });

  const first = await exports.enforceBootstrapRateLimit(request, env);
  const second = await exports.enforceBootstrapRateLimit(request, env);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(first.limit, 10);
  assert.equal(subjects.length, 2);
  assert.equal(subjects[0], subjects[1]);
  assert.match(subjects[0], /^bootstrap:[a-f0-9]{64}$/);
  assert.doesNotMatch(subjects[0], /203\.0\.113\.42/);
});

test("bootstrap route checks its anonymous limiter before issuing a session", () => {
  assert.match(bootstrapSource, /await enforceBootstrapRateLimit\(request, env\)/);
  assert.ok(
    bootstrapSource.indexOf("await enforceBootstrapRateLimit(request, env)") <
      bootstrapSource.indexOf("await issueSessionToken(deviceId, env)"),
  );
});
