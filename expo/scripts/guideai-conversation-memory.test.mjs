import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = fileURLToPath(new URL("../src/logic/GuideAI.ts", import.meta.url));
const source = readFileSync(sourcePath, "utf8");

function analysis(overrides) {
  return {
    confidence: 0.9,
    direction: "forward",
    fallbackReason: null,
    hazardLevel: "none",
    latencyMs: 10,
    lighting: "good",
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
      return require(specifier);
    },
  }, {
    filename: sourcePath,
  });

  return module.exports.GuideAI;
}

const frame = {
  base64: "test",
  height: 1,
  source: "native-core",
  timestampMs: 1,
  width: 1,
};

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
        confidence: 0.99,
        direction: "turn-left",
        message: "Scene has a doorway on the left.",
        sceneDescription: "A doorway is on the left.",
      }),
      timestamp: 2,
    },
    {
      success: true,
      analysis: analysis({ confidence: 0.7, direction: "forward", message: "Continue forward." }),
      timestamp: 3,
    },
  ]);

  assert.equal((await GuideAI.analyzeWithVision(frame)).direction, "forward");
  assert.equal(
    (await GuideAI.analyzeWithVision(frame, { updateNavigationMemory: false })).direction,
    "turn-left",
    "Conversation-lane answers may speak their own scene direction.",
  );
  assert.deepEqual(
    optionsSeen.map((options) => options?.updateNavigationMemory),
    [false],
    "Conversation-lane calls must opt out of navigation memory updates.",
  );
  assert.equal(
    (await GuideAI.analyzeWithVision(frame)).direction,
    "forward",
    "Conversation-lane scene answers must not bias the next guidance smoothing decision.",
  );
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
    {
      success: true,
      analysis: analysis({ confidence: 0.7, direction: "turn-left", message: "Turn left." }),
      timestamp: 3,
    },
  ]);

  assert.equal((await GuideAI.analyzeWithVision(frame)).direction, "forward");
  assert.equal(
    (await GuideAI.analyzeWithVision(frame, { updateNavigationMemory: false })).direction,
    "stop",
    "Conversation-lane failures still speak a safe stop fallback.",
  );
  assert.equal(
    (await GuideAI.analyzeWithVision(frame)).direction,
    "forward",
    "Conversation-lane failures must not reset guidance smoothing memory.",
  );
}

console.log("GuideAI conversation-lane memory isolation passed.");
