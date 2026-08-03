import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";
import { getSafetyStopReason, requiresSafetyStop } from "../eval/safety-policy.mjs";

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
      if (specifier.endsWith("/eval/safety-policy.mjs")) {
        return { getSafetyStopReason, requiresSafetyStop };
      }
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
  for (const lighting of ["dark", "dim", "unknown"]) {
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

test("contradictory provider safety fields always replace forward or turn speech with STOP", () => {
  const cases = [
    {
      name: "provider STOP with unsafe forward speech",
      overrides: {
        recommendedDirection: "stop",
        shortMessage: "Continue forward.",
      },
    },
    {
      name: "very-close obstacle",
      overrides: {
        obstacles: [{ confidence: 0.92, distance: "very-close", position: "center", type: "chair" }],
      },
    },
    {
      name: "close obstacle while turning",
      overrides: {
        obstacles: [{ confidence: 0.9, distance: "close", position: "left", type: "bollard" }],
        recommendedDirection: "turn-right",
        shortMessage: "Turn right now.",
      },
    },
    {
      name: "path not clear",
      overrides: { pathClear: false },
    },
    {
      name: "caution walkability",
      overrides: { walkability: "caution" },
    },
    {
      name: "uncertain walkability",
      overrides: { walkability: "uncertain" },
    },
    {
      name: "medium hazard",
      overrides: { hazardLevel: "medium" },
    },
    {
      name: "high hazard while turning",
      overrides: {
        hazardLevel: "high",
        recommendedDirection: "turn-left",
        shortMessage: "Turn left now.",
      },
    },
    {
      name: "low confidence",
      overrides: { confidence: 0.6 },
    },
    ...[
      "oncoming vehicle",
      "moving bike",
      "wet floor",
      "blocked sidewalk",
      "unknown overhead hazard",
    ].map((hazard) => ({
      name: `critical hazard: ${hazard}`,
      overrides: {
        criticalHazards: [hazard],
        hazardLevel: "none",
        pathClear: true,
        recommendedDirection: "forward",
        shortMessage: "Continue forward.",
      },
    })),
  ];

  for (const { name, overrides } of cases) {
    const providerSpeech = overrides.shortMessage || "Continue forward.";
    const normalized = normalizeProviderVision(clearPath(overrides), metadata);

    assert.equal(normalized.direction, "stop", name);
    assert.equal(normalized.hazardLevel, "high", name);
    assert.equal(normalized.obstacle, true, name);
    assert.match(normalized.message, /^Stop\./, name);
    assert.notEqual(normalized.message, providerSpeech, name);
    assert.ok(normalized.fallbackReason, name);
  }
});

test("scene-query facts survive normalization while contradictory safety fields remain STOP-consistent", () => {
  const sceneDescription = "A chair is close in the center of the walkway.";
  const normalized = normalizeProviderVision(clearPath({
    obstacles: [{ confidence: 0.94, distance: "close", position: "center", type: "chair" }],
    sceneDescription,
    shortMessage: "Continue forward.",
  }), metadata);

  assert.equal(normalized.sceneDescription, sceneDescription);
  assert.equal(normalized.direction, "stop");
  assert.equal(normalized.hazardLevel, "high");
  assert.equal(normalized.obstacle, true);
  assert.match(normalized.message, /^Stop\./);
  assert.notEqual(normalized.message, "Continue forward.");
});

test("centered medium-distance obstacles cannot be normalized to forward", () => {
  for (const type of ["vehicle", "person", "unknown obstacle"]) {
    const normalized = normalizeProviderVision(clearPath({
      confidence: 0.98,
      hazardLevel: "none",
      obstacles: [{ confidence: 0.97, distance: "medium", position: "center", type }],
      pathClear: true,
      recommendedDirection: "forward",
      shortMessage: "Continue forward.",
      walkability: "clear",
    }), metadata);

    assert.equal(normalized.direction, "stop", type);
    assert.equal(normalized.fallbackReason, "path-blocking-obstacle", type);
    assert.equal(normalized.hazardLevel, "high", type);
    assert.equal(normalized.message, "Stop. Obstacle blocks the path.", type);
    assert.equal(normalized.obstacle, true, type);
    assert.ok(normalized.confidence <= 0.45, type);
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

test("a low, non-immediate hazard never produces a STOP haptic contradiction", () => {
  const normalized = normalizeProviderVision(clearPath({
    hazardLevel: "low",
    obstacles: [{ confidence: 0.75, distance: "far", position: "right", type: "trash can" }],
    sceneDescription: "A trash can is far ahead on the right, outside the current path.",
  }), metadata);

  assert.equal(normalized.direction, "forward");
  assert.equal(normalized.hazardLevel, "low");
  assert.equal(normalized.message, "Continue forward.");
  assert.equal(normalized.obstacle, false);
});

test("shared safety policy deterministically covers every runtime STOP cause", () => {
  const clear = {
    confidence: 0.9,
    direction: "forward",
    fallbackReason: null,
    hasCloseObstacle: false,
    hasPathBlockingObstacle: false,
    hazardLevel: "none",
    lighting: "normal",
    obstacle: false,
    pathClear: true,
    safetyTags: [],
    walkability: "clear",
  };
  const cases = [
    ["fallback", { fallbackReason: "provider-error" }],
    ["close-obstacle", { hasCloseObstacle: true }],
    ["path-blocking-obstacle", { hasPathBlockingObstacle: true }],
    ["path-not-clear", { pathClear: false }],
    ["high-hazard", { hazardLevel: "high" }],
    ["medium-hazard", { hazardLevel: "medium" }],
    ["uncertain-walkability", { walkability: "caution" }],
    ["uncertain-walkability", { walkability: "uncertain" }],
    ["low-visibility", { lighting: "dim" }],
    ["low-visibility", { lighting: "dark" }],
    ["low-visibility", { lighting: "unknown" }],
    ["critical-hazard", { safetyTags: ["vehicle"] }],
    ["low-confidence", { confidence: 0.649 }],
    ["provider-stop", { direction: "stop" }],
    ["obstacle", { obstacle: true }],
  ];

  assert.equal(requiresSafetyStop(clear), false);
  assert.equal(getSafetyStopReason(clear), null);
  for (const [expectedReason, override] of cases) {
    const input = { ...clear, ...override };
    assert.equal(requiresSafetyStop(input), true, expectedReason);
    assert.equal(getSafetyStopReason(input), expectedReason);
  }
});
