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

function loadWorker() {
  const moduleCache = new Map();
  const providerCalls = [];
  const moduleOverrides = new Map([
    [new URL("../src/lib/session.ts", import.meta.url).href, {
      verifySessionToken: async () => true,
    }],
    [new URL("../src/providers/index.ts", import.meta.url).href, {
      getProviderSummary: () => {
        providerCalls.push("summary");
        throw new Error("Invalid requests must not reach provider summary.");
      },
      getVisionProvider: () => {
        providerCalls.push("provider");
        throw new Error("Invalid requests must not reach provider routing.");
      },
    }],
  ]);

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
    worker: load("../src/index.ts").default,
  };
}

async function fetchInvalidAnalyze(body) {
  const { providerCalls, worker } = loadWorker();
  const request = new Request("https://api.example.test/v1/vision/analyze", {
    body,
    headers: {
      authorization: "Bearer valid-test-session",
      "content-type": "application/json",
      "x-guidepup-device-id": "test-device",
    },
    method: "POST",
  });
  const response = await worker.fetch(request, {
    ALLOWED_ORIGINS: "*",
    ENVIRONMENT: "development",
  }, {
    waitUntil: () => undefined,
  });

  return { body: await response.json(), providerCalls, response };
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
