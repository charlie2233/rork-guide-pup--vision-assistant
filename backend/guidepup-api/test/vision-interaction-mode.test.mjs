import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as safetyPolicy from "../eval/safety-policy.mjs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const sourceUrl = new URL("../src/schemas/vision.ts", import.meta.url);
const source = fs.readFileSync(sourceUrl, "utf8");
const TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAACgAAAAoCAIAAAADnC86AAAAK0lEQVR4nO3NMQ0AAAwDoPo33ZpYsgcMkD6JWCwWi8VisVgsFovFYrFYfGcs0K5PemaPnAAAAABJRU5ErkJggg==";

function validAnalyzePayload(overrides = {}) {
  return {
    captureHeuristics: {
      imageSource: "base64",
      resizedForUpload: true,
      uploadedHeight: 40,
      uploadedWidth: 40,
    },
    hasImage: true,
    imageBase64: TEST_IMAGE_BASE64,
    mimeType: "image/png",
    sampledFrame: true,
    sourceHeight: 40,
    sourceWidth: 40,
    ...overrides,
  };
}

function syntheticPngBase64(width, height) {
  const bytes = Buffer.alloc(96);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

function syntheticJpegBase64(width, height) {
  const bytes = Buffer.alloc(96);
  bytes.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08]);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = 3;
  return bytes.toString("base64");
}

function syntheticWebpBase64(width, height) {
  const bytes = Buffer.alloc(96);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WEBP", 8, "ascii");
  bytes.write("VP8X", 12, "ascii");
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes.toString("base64");
}

function allowedRateLimitDecision(limit = 20) {
  return {
    allowed: true,
    limit,
    reason: "allowed",
    remaining: limit - 1,
    resetAt: "2099-01-01T00:00:00.000Z",
  };
}

function createObservedRequestBody() {
  const state = {
    cancelCalls: 0,
    pullCalls: 0,
  };
  const body = new ReadableStream({
    cancel() {
      state.cancelCalls += 1;
    },
    pull(controller) {
      state.pullCalls += 1;
      controller.enqueue(new TextEncoder().encode("{}"));
      controller.close();
    },
  }, {
    highWaterMark: 0,
  });

  return { body, state };
}

function loadVisionSchema() {
  const compiled = ts.transpileModule(source, {
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
  }, { filename: sourceUrl.pathname });
  return module.exports.AnalyzeVisionRequestSchema;
}

test("analyze request defaults omitted interaction mode to guidance", () => {
  const schema = loadVisionSchema();
  const parsed = schema.parse(validAnalyzePayload());
  assert.equal(parsed.interactionMode, "guidance");
});

test("analyze request accepts scene-query and rejects unsupported modes", () => {
  const schema = loadVisionSchema();
  const parsed = schema.parse(validAnalyzePayload({
    interactionMode: "scene-query",
  }));
  assert.equal(parsed.interactionMode, "scene-query");
  assert.throws(() => schema.parse(validAnalyzePayload({
    interactionMode: "settings-change",
  })));
});

test("analyze request enforces sampled image dimensions, metadata agreement, and encoded size", () => {
  const schema = loadVisionSchema();

  assert.doesNotThrow(() => schema.parse(validAnalyzePayload()));
  assert.throws(() => schema.parse(validAnalyzePayload({
    sourceWidth: 769,
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    captureHeuristics: {
      imageSource: "base64",
      resizedForUpload: true,
      uploadedHeight: 39,
      uploadedWidth: 40,
    },
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    sourceHeight: undefined,
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    imageBase64: "A".repeat(2_000_004),
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    hasImage: false,
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    sampledFrame: false,
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    captureHeuristics: undefined,
    imageBase64: syntheticPngBase64(769, 1),
    sourceHeight: undefined,
    sourceWidth: undefined,
  })));
});

test("analyze request rejects malformed base64 and MIME declarations that do not match image bytes", () => {
  const schema = loadVisionSchema();

  assert.throws(() => schema.parse(validAnalyzePayload({
    imageBase64: "not-base64!".repeat(16),
  })));
  assert.throws(() => schema.parse(validAnalyzePayload({
    mimeType: "image/jpeg",
  })));
});

test("analyze request validates actual JPEG and WebP dimensions against declared metadata", () => {
  const schema = loadVisionSchema();
  for (const fixture of [
    { imageBase64: syntheticJpegBase64(320, 240), mimeType: "image/jpeg", width: 320, height: 240 },
    { imageBase64: syntheticWebpBase64(640, 480), mimeType: "image/webp", width: 640, height: 480 },
  ]) {
    assert.doesNotThrow(() => schema.parse(validAnalyzePayload({
      captureHeuristics: {
        imageSource: "base64",
        resizedForUpload: true,
        uploadedHeight: fixture.height,
        uploadedWidth: fixture.width,
      },
      imageBase64: fixture.imageBase64,
      mimeType: fixture.mimeType,
      sourceHeight: fixture.height,
      sourceWidth: fixture.width,
    })));
    assert.throws(() => schema.parse(validAnalyzePayload({
      captureHeuristics: {
        imageSource: "base64",
        resizedForUpload: true,
        uploadedHeight: fixture.height,
        uploadedWidth: fixture.width - 1,
      },
      imageBase64: fixture.imageBase64,
      mimeType: fixture.mimeType,
      sourceHeight: fixture.height,
      sourceWidth: fixture.width - 1,
    })));
  }
});

function loadWorker({
  allowProviderSummary = false,
  analyzeIpRateLimitDecision = allowedRateLimitDecision(60),
  deviceRateLimitDecision = allowedRateLimitDecision(),
  useActualSessionVerifier = false,
} = {}) {
  const moduleCache = new Map();
  const providerCalls = [];
  const rateLimitCalls = [];
  const sessionVerificationCalls = [];
  const moduleOverrides = new Map([
    [new URL("../src/providers/index.ts", import.meta.url).href, {
      getProviderSummary: () => {
        providerCalls.push("summary");
        if (allowProviderSummary) {
          return {
            model: "test-model",
            provider: "openai",
          };
        }
        throw new Error("Invalid requests must not reach provider summary.");
      },
      getVisionProvider: () => {
        providerCalls.push("provider");
        throw new Error("Invalid requests must not reach provider routing.");
      },
    }],
    [new URL("../src/lib/rate-limit.ts", import.meta.url).href, {
      DeviceRateLimiter: class {},
      enforceAnalyzeIpRateLimit: async (...args) => {
        rateLimitCalls.push(["analyze-ip", ...args]);
        return analyzeIpRateLimitDecision;
      },
      enforceRateLimit: async (...args) => {
        rateLimitCalls.push(["device", ...args]);
        return deviceRateLimitDecision;
      },
    }],
  ]);
  if (!useActualSessionVerifier) {
    moduleOverrides.set(new URL("../src/lib/session.ts", import.meta.url).href, {
      verifySessionToken: async (...args) => {
        sessionVerificationCalls.push(args);
        return true;
      },
    });
  }

  function load(relativePathOrUrl) {
    const moduleUrl = relativePathOrUrl instanceof URL
      ? relativePathOrUrl
      : new URL(relativePathOrUrl, import.meta.url);
    const override = moduleOverrides.get(moduleUrl.href);
    if (override) {
      return override;
    }
    const cached = moduleCache.get(moduleUrl.href);
    if (cached) {
      return cached.exports;
    }

    const module = { exports: {} };
    moduleCache.set(moduleUrl.href, module);
    const sourcePath = fileURLToPath(moduleUrl);
    const compiled = ts.transpileModule(fs.readFileSync(moduleUrl, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    });
    const localRequire = (specifier) => {
      if (specifier === "cloudflare:workers") {
        return { DurableObject: class {} };
      }
      if (specifier.startsWith(".")) {
        const resolved = new URL(specifier, new URL("./", moduleUrl));
        if (resolved.pathname.endsWith("/eval/safety-policy.mjs")) {
          return safetyPolicy;
        }
        if (!resolved.pathname.endsWith(".ts")) {
          const fileCandidate = new URL(resolved);
          fileCandidate.pathname = `${fileCandidate.pathname}.ts`;
          resolved.pathname = fs.existsSync(fileURLToPath(fileCandidate))
            ? fileCandidate.pathname
            : `${resolved.pathname}/index.ts`;
        }
        return load(resolved);
      }
      return require(specifier);
    };

    vm.runInNewContext(compiled.outputText, {
      AbortController,
      Date,
      Error,
      Headers,
      JSON,
      Request,
      Response,
      TextDecoder,
      TextEncoder,
      URL,
      Uint8Array,
      clearTimeout,
      console,
      crypto: globalThis.crypto,
      exports: module.exports,
      fetch: globalThis.fetch,
      module,
      require: localRequire,
      setTimeout,
    }, { filename: sourcePath });

    return module.exports;
  }

  return {
    providerCalls,
    rateLimitCalls,
    sessionVerificationCalls,
    worker: load("../src/index.ts").default,
  };
}

async function fetchInvalidAnalyze(body, {
  allowProviderSummary = false,
  analyzeIpRateLimitDecision,
  deviceRateLimitDecision,
  headers = {},
  includeCredentials = true,
  useActualSessionVerifier = false,
} = {}) {
  const {
    providerCalls,
    rateLimitCalls,
    sessionVerificationCalls,
    worker,
  } = loadWorker({
    allowProviderSummary,
    analyzeIpRateLimitDecision,
    deviceRateLimitDecision,
    useActualSessionVerifier,
  });
  const requestHeaders = {
    "content-type": "application/json",
    ...headers,
  };
  if (includeCredentials) {
    requestHeaders.authorization = "Bearer valid-test-session";
    requestHeaders["x-guidepup-device-id"] = "test-device";
  }
  const request = new Request("https://api.example.test/v1/vision/analyze", {
    body,
    headers: requestHeaders,
    method: "POST",
    ...(typeof body === "string" ? {} : { duplex: "half" }),
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGINS: "*",
    ENVIRONMENT: "development",
  }, {
    waitUntil: () => undefined,
  });

  return {
    body: await response.json(),
    providerCalls,
    rateLimitCalls,
    response,
    sessionVerificationCalls,
  };
}

test("worker maps unsupported interaction mode to sanitized deterministic 400", async () => {
  const result = await fetchInvalidAnalyze(JSON.stringify(validAnalyzePayload({
    interactionMode: "settings-change-secret-value",
  })));

  assert.equal(result.response.status, 400);
  assert.match(result.response.headers.get("x-request-id") || "", /\S/);
  assert.deepEqual(result.body, {
    error: {
      code: "invalid_request",
      message: "Request payload is invalid.",
    },
  });
  assert.doesNotMatch(JSON.stringify(result.body), /settings-change-secret-value/);
  assert.deepEqual(result.providerCalls, []);
});

test("worker maps malformed analyze JSON to the same sanitized 400", async () => {
  const result = await fetchInvalidAnalyze('{"interactionMode":"scene-query"');

  assert.equal(result.response.status, 400);
  assert.deepEqual(result.body, {
    error: {
      code: "invalid_request",
      message: "Request payload is invalid.",
    },
  });
  assert.deepEqual(result.providerCalls, []);
});

test("analyze authenticates and rate-limits before rejecting a declared oversized body", async () => {
  const result = await fetchInvalidAnalyze("{}", {
    headers: {
      "content-length": "1600001",
    },
  });

  assert.equal(result.response.status, 413);
  assert.match(result.response.headers.get("x-request-id") || "", /\S/);
  assert.deepEqual(result.body, {
    error: {
      code: "payload_too_large",
      message: "Request payload is too large.",
    },
  });
  assert.equal(result.sessionVerificationCalls.length, 1);
  assert.deepEqual(result.rateLimitCalls.map(([scope]) => scope), ["device", "analyze-ip"]);
  assert.deepEqual(result.providerCalls, []);
});

test("analyze stream cap stays enforced after authentication and rate limiting", async () => {
  const oversizedBody = JSON.stringify({ padding: "a".repeat(1_600_000) });
  for (const headers of [{}, { "content-length": "1" }]) {
    const result = await fetchInvalidAnalyze(oversizedBody, { headers });

    assert.equal(result.response.status, 413);
    assert.deepEqual(result.body, {
      error: {
        code: "payload_too_large",
        message: "Request payload is too large.",
      },
    });
    assert.equal(result.sessionVerificationCalls.length, 1);
    assert.deepEqual(result.rateLimitCalls.map(([scope]) => scope), ["device", "analyze-ip"]);
    assert.deepEqual(result.providerCalls, []);
  }
});

test("unauthorized analyze cancels an unread body without pulling it", async () => {
  const observed = createObservedRequestBody();
  const result = await fetchInvalidAnalyze(observed.body, {
    includeCredentials: false,
  });

  assert.equal(result.response.status, 401);
  assert.equal(observed.state.pullCalls, 0);
  assert.equal(observed.state.cancelCalls, 1);
  assert.deepEqual(result.sessionVerificationCalls, []);
  assert.deepEqual(result.rateLimitCalls, []);
  assert.deepEqual(result.providerCalls, []);
});

test("rate-limited analyze cancels an unread body without pulling it", async () => {
  const observed = createObservedRequestBody();
  const result = await fetchInvalidAnalyze(observed.body, {
    allowProviderSummary: true,
    deviceRateLimitDecision: {
      allowed: false,
      limit: 20,
      reason: "limit-exceeded",
      remaining: 0,
      resetAt: "2099-01-01T00:00:00.000Z",
    },
  });

  assert.equal(result.response.status, 429);
  assert.equal(observed.state.pullCalls, 0);
  assert.equal(observed.state.cancelCalls, 1);
  assert.equal(result.sessionVerificationCalls.length, 1);
  assert.deepEqual(result.rateLimitCalls.map(([scope]) => scope), ["device"]);
  assert.deepEqual(result.providerCalls, ["summary"]);
});

test("declared oversized analyze cancels its unread body after preflight", async () => {
  const observed = createObservedRequestBody();
  const result = await fetchInvalidAnalyze(observed.body, {
    headers: {
      "content-length": "1600001",
    },
  });

  assert.equal(result.response.status, 413);
  assert.equal(observed.state.pullCalls, 0);
  assert.equal(observed.state.cancelCalls, 1);
  assert.equal(result.sessionVerificationCalls.length, 1);
  assert.deepEqual(result.rateLimitCalls.map(([scope]) => scope), ["device", "analyze-ip"]);
  assert.deepEqual(result.providerCalls, []);
});

test("malformed bearer tokens return sanitized 401 rather than throwing", async () => {
  for (const authorization of [
    "Bearer v1.only-two-parts",
    "Bearer v1.payload.%%%",
    `Bearer v1.${"a".repeat(2050)}.signature`,
  ]) {
    const result = await fetchInvalidAnalyze(JSON.stringify(validAnalyzePayload()), {
      headers: { authorization },
      useActualSessionVerifier: true,
    });

    assert.equal(result.response.status, 401);
    assert.deepEqual(result.body, {
      error: {
        code: "unauthorized",
        message: "Invalid or expired device bootstrap token.",
      },
    });
    assert.deepEqual(result.providerCalls, []);
  }
});
