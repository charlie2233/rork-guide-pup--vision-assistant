import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);
const moduleCache = new Map();

function resolveTsUrl(specifier, parentUrl) {
  const resolved = new URL(specifier, parentUrl);
  if (!resolved.pathname.endsWith(".ts")) {
    resolved.pathname = `${resolved.pathname}.ts`;
  }
  return resolved;
}

function loadTsModule(relativePathOrUrl) {
  const sourceUrl = relativePathOrUrl instanceof URL
    ? relativePathOrUrl
    : new URL(relativePathOrUrl, import.meta.url);
  const sourcePath = fileURLToPath(sourceUrl);
  const cacheKey = sourceUrl.href;
  const cached = moduleCache.get(cacheKey);
  if (cached) {
    return cached.exports;
  }

  const module = { exports: {} };
  moduleCache.set(cacheKey, module);
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      return loadTsModule(resolveTsUrl(specifier, new URL("./", sourceUrl)));
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled.outputText, {
    exports: module.exports,
    module,
    require: localRequire,
  }, {
    filename: sourcePath,
  });

  return module.exports;
}

const { normalizeProviderVision } = loadTsModule("../src/lib/normalize.ts");

const metadata = {
  latencyMs: 42,
  model: "test-model",
  promptVersion: "test-prompt",
  provider: "test-provider",
};

function clearPath(overrides = {}) {
  return {
    confidence: 0.94,
    criticalHazards: [],
    hazardLevel: "none",
    lighting: "normal",
    notes: "No hazards visible.",
    obstacles: [],
    pathClear: true,
    recommendedDirection: "forward",
    sceneDescription: "A clear sidewalk continues ahead.",
    shortMessage: "Continue forward.",
    surfaceType: "sidewalk",
    walkability: "clear",
    ...overrides,
  };
}

test("low-visibility provider guidance is forced to safe stop", () => {
  for (const lighting of ["dark", "unknown"]) {
    const normalized = normalizeProviderVision(clearPath({ lighting }), metadata);

    assert.equal(normalized.direction, "stop");
    assert.equal(normalized.fallbackReason, "low-visibility");
    assert.equal(normalized.hazardLevel, "high");
    assert.equal(normalized.message, "Stop. Visibility is too low.");
    assert.equal(normalized.obstacle, true);
    assert.equal(normalized.lighting, lighting);
    assert.ok(normalized.confidence <= 0.45);
  }
});

test("clear normally lit provider guidance can remain forward", () => {
  const normalized = normalizeProviderVision(clearPath(), metadata);

  assert.equal(normalized.direction, "forward");
  assert.equal(normalized.fallbackReason, null);
  assert.equal(normalized.hazardLevel, "none");
  assert.equal(normalized.message, "Continue forward.");
  assert.equal(normalized.obstacle, false);
  assert.equal(normalized.lighting, "normal");
  assert.equal(normalized.walkability, "clear");
});
