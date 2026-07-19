import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { Buffer } from "node:buffer";
import ts from "typescript";

const loggingSource = fs.readFileSync(new URL("../src/lib/logging.ts", import.meta.url), "utf8");
const sentrySource = fs.readFileSync(new URL("../src/lib/sentry.ts", import.meta.url), "utf8");
const providerSource = fs.readFileSync(new URL("../src/providers/openai-compatible.ts", import.meta.url), "utf8");
const wranglerSource = fs.readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

function parseWranglerConfig() {
  const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", wranglerSource);
  assert.equal(
    parsed.error,
    undefined,
    parsed.error ? ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n") : undefined,
  );
  return parsed.config;
}

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
    filePath: "/private/var/mobile/frame.jpg",
    requestId: "req-123",
    route: "/v1/vision/analyze",
    signedUrl: "https://storage.example/frame.jpg?X-Amz-Signature=secret",
  });

  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.deviceId, "[redacted]");
  assert.equal(redacted.imageBase64, "[redacted]");
  assert.equal(redacted.filePath, "[redacted]");
  assert.deepEqual(redacted.nested, {
    promptVersion: "2026-05-22.v1",
    sessionToken: "[redacted]",
  });
  assert.equal(redacted.requestId, "req-123");
  assert.equal(redacted.signedUrl, "[redacted]");
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

test("sanitizeLogMessage redacts signed URLs, embedded credentials, and local paths", async () => {
  const { sanitizeLogMessage } = await importLoggingModule();
  const message = sanitizeLogMessage(
    "provider failed at https://storage.example/frame.jpg?X-Amz-Credential=test-user&X-Amz-Signature=top-secret " +
      "with https://user:password@example.com/private/frame.jpg, " +
      "file:///private/var/mobile/frame.jpg, /Users/test/Library/frame.jpg, /home/guidepup/frame.jpg, " +
      "/opt/guidepup/frame.jpg, /workspace/guidepup/frame.jpg, /usr/local/guidepup/frame.jpg, " +
      "POST /v1/vision/analyze, and C:\\Temp\\frame.jpg",
    1000,
  );

  assert.match(message, /https:\/\/storage\.example\/frame\.jpg\?\[signed-query-redacted\]/);
  assert.match(message, /https:\/\/\[credentials-redacted\]@example\.com\/private\/frame\.jpg/);
  assert.match(message, /file:\/\/\[redacted\]/);
  assert.match(message, /\[local-path-redacted\]/);
  assert.doesNotMatch(message, /X-Amz-Credential|X-Amz-Signature|top-secret|user:password/);
  assert.match(message, /POST \/v1\/vision\/analyze/);
  assert.doesNotMatch(message, /private\/var\/mobile|Users\/test|home\/guidepup|opt\/guidepup|workspace\/guidepup|usr\/local|C:\\Temp/);
});

test("Sentry and provider error paths use sanitized messages and context", () => {
  assert.match(sentrySource, /const message = sanitizeLogMessage/);
  assert.match(sentrySource, /const extra = sanitizeLogData/);
  assert.doesNotMatch(sentrySource, /extra:\s*\{\s*\.\.\.context/);
  assert.match(providerSource, /sanitizeLogMessage\(message\.refusal/);
  assert.doesNotMatch(providerSource, /body\.slice/);
});

test("all Worker environments disable invocation logs while preserving custom logs", () => {
  const config = parseWranglerConfig();
  const environments = [
    ["development", config],
    ...Object.entries(config.env ?? {}),
  ];

  for (const [name, environment] of environments) {
    assert.ok(environment, `${name} configuration must exist`);
    assert.equal(environment.observability?.enabled, true, `${name} observability must remain enabled`);
    assert.equal(
      environment.observability?.head_sampling_rate,
      1,
      `${name} observability sampling must preserve all custom evidence`,
    );
    assert.equal(environment.observability?.logs?.enabled, true, `${name} custom logs must remain enabled`);
    assert.equal(
      environment.observability?.logs?.head_sampling_rate,
      1,
      `${name} custom log sampling must preserve all request and smoke evidence`,
    );
    assert.equal(environment.observability?.logs?.persist, true, `${name} custom logs must remain persisted`);
    assert.equal(
      Object.hasOwn(environment.observability?.logs ?? {}, "invocation_logs"),
      true,
      `${name} must explicitly configure invocation_logs`,
    );
    assert.equal(
      environment.observability.logs.invocation_logs,
      false,
      `${name} invocation logs must remain disabled`,
    );
  }
});
