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
const analyzeSource = fs.readFileSync(new URL("../src/routes/analyze.ts", import.meta.url), "utf8");

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
    if (specifier === "./session") {
      return {
        getBootstrapSigningSecret: (env) => {
          if (env.BOOTSTRAP_SIGNING_SECRET) {
            return env.BOOTSTRAP_SIGNING_SECRET;
          }
          if (!env.ENVIRONMENT || env.ENVIRONMENT === "development") {
            return "guidepup-local-dev-secret-change-me";
          }
          throw new Error("BOOTSTRAP_SIGNING_SECRET is required outside development.");
        },
      };
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

test("analyze IP limits use one privacy-safe subject across rotating device IDs", async () => {
  const { exports } = loadRateLimitModule();
  const subjects = [];
  const env = {
    ANALYZE_IP_RATE_LIMIT_PER_MINUTE: "75",
    BOOTSTRAP_SIGNING_SECRET: "test-signing-secret",
    RATE_LIMITER: {
      getByName(name) {
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
  const request = new Request("https://api.example.test/v1/vision/analyze", {
    headers: { "cf-connecting-ip": "198.51.100.24" },
    method: "POST",
  });

  await exports.enforceRateLimit("11111111-1111-4111-8111-111111111111", env);
  await exports.enforceAnalyzeIpRateLimit(request, env);
  await exports.enforceRateLimit("22222222-2222-4222-8222-222222222222", env);
  await exports.enforceAnalyzeIpRateLimit(request, env);

  const ipSubjects = subjects.filter((subject) => subject.startsWith("analyze-ip:"));
  assert.equal(ipSubjects.length, 2);
  assert.equal(ipSubjects[0], ipSubjects[1]);
  assert.match(ipSubjects[0], /^analyze-ip:[a-f0-9]{64}$/);
  assert.doesNotMatch(ipSubjects[0], /198\.51\.100\.24/);
});

test("global provider calls share one bounded fail-closed subject", async () => {
  const { exports } = loadRateLimitModule();
  const subjects = [];
  const limits = [];
  const env = {
    PROVIDER_GLOBAL_CALL_LIMIT_PER_MINUTE: "99999",
    RATE_LIMITER: {
      getByName(name) {
        subjects.push(name);
        return {
          fetch: async (_url, init) => {
            const { limit } = JSON.parse(init.body);
            limits.push(limit);
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

  await exports.enforceProviderCallLimit(env);
  await exports.enforceProviderCallLimit(env);
  assert.deepEqual(subjects, ["provider-calls:global:v1", "provider-calls:global:v1"]);
  assert.deepEqual(limits, [600, 600]);

  const unavailable = await exports.enforceProviderCallLimit({});
  assert.equal(unavailable.allowed, false);
  assert.equal(unavailable.reason, "infrastructure-unavailable");
});

test("all configured quota values are clamped to beta safety bounds", () => {
  const { exports } = loadRateLimitModule();
  assert.deepEqual(JSON.parse(JSON.stringify(exports.getRateLimitCaps({
    ANALYZE_IP_RATE_LIMIT_PER_MINUTE: "99999",
    BOOTSTRAP_RATE_LIMIT_PER_MINUTE: "0",
    PROVIDER_GLOBAL_CALL_LIMIT_PER_MINUTE: "99999",
    RATE_LIMIT_PER_MINUTE: "99999",
  }))), {
    analyzeDevicePerMinute: 60,
    analyzeIpPerMinute: 300,
    bootstrapIpPerMinute: 1,
    providerCallsGlobalPerMinute: 600,
  });
});

test("analyze route checks device and hashed-IP limits before provider routing", () => {
  assert.match(analyzeSource, /await enforceRateLimit\(deviceId, env\)/);
  assert.match(analyzeSource, /await enforceAnalyzeIpRateLimit\(request, env\)/);
  assert.ok(
    analyzeSource.indexOf("await enforceAnalyzeIpRateLimit(request, env)") <
      analyzeSource.indexOf("getVisionProvider(env)"),
  );
});
