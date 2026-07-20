import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

import ts from "typescript";

const sessionUrl = new URL("../src/lib/session.ts", import.meta.url);
const clientApiSource = fs.readFileSync(new URL("../../../expo/src/lib/api.ts", import.meta.url), "utf8");

function loadSessionModule() {
  const compiled = ts.transpileModule(fs.readFileSync(sessionUrl, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputText, {
    Date,
    Error,
    JSON,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    atob,
    btoa,
    crypto: globalThis.crypto,
    exports: module.exports,
    module,
  });
  return module.exports;
}

test("only development may use the known local signing fallback", () => {
  const { getBootstrapSigningSecret } = loadSessionModule();
  assert.equal(
    getBootstrapSigningSecret({ ENVIRONMENT: "development" }),
    "guidepup-local-dev-secret-change-me",
  );
  assert.throws(
    () => getBootstrapSigningSecret({ ENVIRONMENT: "staging" }),
    /required outside development/,
  );
  assert.throws(
    () => getBootstrapSigningSecret({ ENVIRONMENT: "production" }),
    /required outside development/,
  );
});

test("staging and production beta session TTLs are bounded to 15 minutes through 4 hours", () => {
  const { getSessionTtlSeconds } = loadSessionModule();
  assert.equal(getSessionTtlSeconds({ ENVIRONMENT: "staging" }), 3600);
  assert.equal(getSessionTtlSeconds({ ENVIRONMENT: "production", SESSION_TTL_SECONDS: "1" }), 900);
  assert.equal(getSessionTtlSeconds({ ENVIRONMENT: "production", SESSION_TTL_SECONDS: "999999" }), 14_400);
  assert.equal(getSessionTtlSeconds({ ENVIRONMENT: "development", SESSION_TTL_SECONDS: "86400" }), 86_400);
});

test("configured staging sessions issue and verify normally", async () => {
  const { issueSessionToken, verifySessionToken } = loadSessionModule();
  const env = {
    BOOTSTRAP_SIGNING_SECRET: "staging-test-signing-secret",
    ENVIRONMENT: "staging",
    SESSION_TTL_SECONDS: "3600",
  };
  const deviceId = "11111111-1111-4111-8111-111111111111";
  const session = await issueSessionToken(deviceId, env);

  assert.equal(await verifySessionToken(session.sessionToken, deviceId, env), true);
  assert.equal(await verifySessionToken(session.sessionToken, "22222222-2222-4222-8222-222222222222", env), false);
  assert.equal(Date.parse(session.expiresAt) - Date.parse(session.issuedAt), 3_600_000);
});

test("the client refreshes an expired session once before surfacing failure", () => {
  const unauthorizedCheck = clientApiSource.indexOf("response.status === 401 && allowRetry");
  const unauthorizedBlock = clientApiSource.slice(
    unauthorizedCheck,
    clientApiSource.indexOf("if (!response.ok)", unauthorizedCheck),
  );

  assert.ok(unauthorizedCheck >= 0);
  assert.match(
    unauthorizedBlock,
    /await clearDeviceSession\(\);[\s\S]*return analyzeVision\(payload, \{[\s\S]*allowRetry: false,[\s\S]*\}\);/,
  );
});
