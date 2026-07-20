import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = fileURLToPath(new URL("../src/logic/GuideAI.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");
const runtimeSafetySourcePath = fileURLToPath(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
const runtimeSafetySource = readFileSync(runtimeSafetySourcePath, "utf8");

function analysis(overrides) {
  return {
    confidence: 0.9,
    direction: "forward",
    fallbackReason: null,
    hazardLevel: "none",
    latencyMs: 10,
    lighting: "normal",
    message: "Continue forward.",
    model: "test-model",
    obstacle: false,
    promptVersion: "test",
    provider: "test",
    sceneDescription: "Clear path ahead.",
    surfaceType: "floor",
    walkability: "clear",
    ...overrides,
  };
}

function loadGuideAI(responses) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const module = { exports: {} };
  const runtimeSafetyModule = { exports: {} };
  const compiledRuntimeSafety = ts.transpileModule(runtimeSafetySource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  vm.runInNewContext(compiledRuntimeSafety.outputText, {
    AbortController,
    Date,
    Error,
    exports: runtimeSafetyModule.exports,
    module: runtimeSafetyModule,
  }, {
    filename: runtimeSafetySourcePath,
  });
  const VisionAI = {
    analyzeFrame: async (_frame, options) => {
      const next = responses.shift();
      assert.ok(next, "Test response queue was exhausted.");
      if (next.captureOptions) {
        next.captureOptions(options);
      }
      return next;
    },
  };

  vm.runInNewContext(compiled.outputText, {
    exports: module.exports,
    module,
    require: (specifier) => {
      if (specifier === "./VisionAI") {
        return { VisionAI };
      }
      if (specifier === "../lib/runtimeSafety") {
        return runtimeSafetyModule.exports;
      }
      return require(specifier);
    },
  }, {
    filename: sourcePath,
  });

  return module.exports.GuideAI;
}

function freshFrame() {
  return {
    base64: "test",
    height: 1,
    source: "native-core",
    timestampMs: Date.now(),
    width: 1,
  };
}

{
  const optionsSeen = [];
  const GuideAI = loadGuideAI([
    {
      success: true,
      analysis: analysis({ confidence: 0.9, direction: "forward", message: "Prime forward." }),
      timestamp: 1,
    },
    {
      captureOptions: (options) => optionsSeen.push(options),
      success: true,
      analysis: analysis({
        confidence: 0.2,
        direction: "turn-left",
        message: "Cloud says turn left now.",
        sceneDescription: "A doorway is on the left.",
      }),
      timestamp: 2,
    },
  ]);

  assert.equal((await GuideAI.analyzeWithVision(freshFrame())).direction, "forward");
  const sceneAnswer = await GuideAI.analyzeWithVision(freshFrame(), {
    interactionMode: "scene-query",
  });
  assert.equal(sceneAnswer.direction, "stop", "Low-confidence scene movement must become a deterministic STOP.");
  assert.equal(sceneAnswer.fallbackReason, "ios-low-confidence");
  assert.equal(sceneAnswer.message, "Stop. Guide Pup needs a clearer view.");
  assert.equal(sceneAnswer.confidence, 0.2, "Cloud confidence must remain literal.");
  assert.deepEqual(
    optionsSeen.map((options) => ({
      interactionMode: options?.interactionMode,
      updateNavigationMemory: options?.updateNavigationMemory,
    })),
    [{ interactionMode: "scene-query", updateNavigationMemory: undefined }],
    "Conversation-lane mode must reach VisionAI without relying on an auxiliary memory flag.",
  );
  assert.equal(
    (await GuideAI.getNextDirection({ headingVector: { x: -0.1, y: 0 } }, null)).direction,
    "forward",
    "Conversation-lane scene answers must not bias the separate legacy guidance smoothing path.",
  );
}

{
  const GuideAI = loadGuideAI([
    {
      success: true,
      analysis: analysis({ confidence: 0.95, direction: "forward", message: "Cloud forward." }),
      timestamp: 1,
    },
    {
      success: true,
      analysis: analysis({ confidence: 0.1, direction: "turn-right", message: "Cloud right." }),
      timestamp: 2,
    },
  ]);

  assert.equal((await GuideAI.analyzeWithVision(freshFrame())).direction, "forward");
  const changedGuidance = await GuideAI.analyzeWithVision(freshFrame());
  assert.equal(changedGuidance.direction, "stop", "Unsafe low-confidence movement must not actuate.");
  assert.equal(changedGuidance.message, "Stop. Guide Pup needs a clearer view.");
  assert.equal(changedGuidance.fallbackReason, "ios-low-confidence");
  assert.equal(changedGuidance.confidence, 0.1, "Consecutive cloud confidence must remain literal.");
}

{
  const GuideAI = loadGuideAI([
    {
      success: true,
      analysis: analysis({ confidence: 0.9, direction: "forward", message: "Prime forward." }),
      timestamp: 1,
    },
    {
      error: "backend unavailable",
      success: false,
      analysis: null,
      timestamp: 2,
    },
  ]);

  assert.equal((await GuideAI.analyzeWithVision(freshFrame())).direction, "forward");
  assert.equal(
    (await GuideAI.analyzeWithVision(freshFrame(), { interactionMode: "scene-query" })).direction,
    "stop",
    "Conversation-lane failures still speak a safe stop fallback.",
  );
  assert.equal(
    (await GuideAI.getNextDirection({ headingVector: { x: -0.1, y: 0 } }, null)).direction,
    "forward",
    "Conversation-lane failures must not reset guidance smoothing memory.",
  );
}

console.log("GuideAI conversation-lane memory isolation passed.");
