import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Buffer } from "node:buffer";
import ts from "typescript";

const loggingSource = fs.readFileSync(new URL("../src/lib/logging.ts", import.meta.url), "utf8");
const sentrySource = fs.readFileSync(new URL("../src/lib/sentry.ts", import.meta.url), "utf8");
const providerSource = fs.readFileSync(new URL("../src/providers/openai-compatible.ts", import.meta.url), "utf8");

async function importLoggingModule() {
  const transpiled = ts.transpileModule(loggingSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  return import(dataUrl);
}

test("sanitizeLogData redacts keyed sensitive fields while preserving launch evidence fields", async () => {
  const { sanitizeLogData } = await importLoggingModule();
  const redacted = sanitizeLogData({
    authorization: "Bearer sk-live-secret",
    deviceId: "00000000-1111-2222-3333-444444444444",
    environment: "production",
    imageBase64: "a".repeat(200),
    nested: {
      promptVersion: "2026-05-22.v1",
      sessionToken: "session-secret-token",
    },
    requestId: "req-123",
    route: "/v1/vision/analyze",
  });

  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.deviceId, "[redacted]");
  assert.equal(redacted.imageBase64, "[redacted]");
  assert.deepEqual(redacted.nested, {
    promptVersion: "2026-05-22.v1",
    sessionToken: "[redacted]",
  });
  assert.equal(redacted.requestId, "req-123");
  assert.equal(redacted.route, "/v1/vision/analyze");
  assert.equal(redacted.environment, "production");
});

test("sanitizeLogMessage redacts keyless bearer tokens, API keys, and base64-like blobs", async () => {
  const { sanitizeLogMessage } = await importLoggingModule();
  const message = sanitizeLogMessage(
    `upstream authorization: Bearer ${"t".repeat(64)} OPENAI_API_KEY=${"k".repeat(48)} data:image/png;base64,${"a".repeat(200)}`,
  );

  assert.match(message, /Bearer \[redacted\]/);
  assert.match(message, /OPENAI_API_KEY=\[redacted\]/i);
  assert.match(message, /data:image\/\[redacted\];base64,\[redacted\]/);
  assert.doesNotMatch(message, /t{32}/);
  assert.doesNotMatch(message, /k{32}/);
  assert.doesNotMatch(message, /a{80}/);
});

test("Sentry and provider error paths use sanitized messages and context", () => {
  assert.match(sentrySource, /const message = sanitizeLogMessage/);
  assert.match(sentrySource, /const extra = sanitizeLogData/);
  assert.doesNotMatch(sentrySource, /extra:\s*\{\s*\.\.\.context/);
  assert.match(providerSource, /sanitizeLogMessage\(message\.refusal/);
  assert.doesNotMatch(providerSource, /body\.slice/);
});
