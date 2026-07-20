import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import ts from "typescript";

const require = createRequire(import.meta.url);

function loadTsModule(sourceUrl, mocks = new Map(), cache = new Map()) {
  const cached = cache.get(sourceUrl.href);
  if (cached) {
    return cached.exports;
  }

  const module = { exports: {} };
  cache.set(sourceUrl.href, module);
  const sourcePath = fileURLToPath(sourceUrl);
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const localRequire = (specifier) => {
    if (mocks.has(specifier)) {
      return mocks.get(specifier);
    }
    if (specifier.startsWith(".")) {
      const relativeUrl = new URL(specifier, new URL("./", sourceUrl));
      if (!relativeUrl.pathname.endsWith(".ts")) {
        relativeUrl.pathname = `${relativeUrl.pathname}.ts`;
      }
      return loadTsModule(relativeUrl, mocks, cache);
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
    URL,
    clearTimeout,
    console,
    exports: module.exports,
    fetch: globalThis.fetch,
    module,
    require: localRequire,
    setTimeout,
  }, { filename: sourcePath });

  return module.exports;
}

function analysis(overrides = {}) {
  return {
    confidence: 0.8,
    direction: "stop",
    fallbackReason: null,
    hazardLevel: "medium",
    latencyMs: 20,
    lighting: "normal",
    message: "Stop. Hold position while the curb is assessed.",
    model: "test-model",
    obstacle: true,
    promptVersion: "test-prompt",
    provider: "test-provider",
    sceneDescription: "A curb is two feet ahead and a doorway is on the right.",
    surfaceType: "sidewalk",
    walkability: "caution",
    ...overrides,
  };
}

test("scene-query crosses VisionAI and analyzeVision with the bounded JSON mode", async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({
      body: JSON.parse(String(init?.body)),
      headers: init?.headers,
      url: String(url),
    });
    return new Response(JSON.stringify(analysis()), {
      headers: {
        "content-type": "application/json",
        "x-request-id": "request-scene-1",
      },
      status: 200,
    });
  };

  try {
    const apiMocks = new Map([
      ["expo-constants", { default: { expoConfig: { version: "1.0.0" } } }],
      ["react-native", { Platform: { OS: "ios" } }],
      ["./config", { appConfig: { apiTimeoutMs: 1000 }, requireApiBaseUrl: () => "https://api.example.test" }],
      ["./device", {
        clearDeviceSession: async () => undefined,
        ensureDeviceSession: async () => ({ deviceId: "device-test", sessionToken: "session-test" }),
      }],
      ["./diagnostics", {
        classifyAnalyzeError: () => "backend",
        recordAnalyzeEvent: () => undefined,
        recordHealthCheckSnapshot: () => undefined,
        sanitizeMessage: (value) => value,
      }],
      ["./sentry", { addBreadcrumb: () => undefined, setSentryTag: () => undefined }],
    ]);
    const api = loadTsModule(new URL("../src/lib/api.ts", import.meta.url), apiMocks);
    const runtimeSafety = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
    const visionMocks = new Map([
      ["expo-image-manipulator", {
        SaveFormat: { JPEG: "jpeg" },
        manipulateAsync: async () => {
          throw new Error("URI preprocessing is not expected for a base64 frame.");
        },
      }],
      ["react-native", { Platform: { OS: "ios" } }],
      ["@/src/lib/api", api],
      ["@/src/lib/diagnostics", { recordAnalyzeEvent: () => undefined }],
      ["@/src/lib/runtimeSafety", runtimeSafety],
      ["@/src/lib/sentry", { captureAppError: () => undefined }],
    ]);
    const { VisionAI } = loadTsModule(new URL("../src/logic/VisionAI.ts", import.meta.url), visionMocks);

    const result = await VisionAI.analyzeFrame({
      base64: "a".repeat(256),
      height: 720,
      source: "native-core",
      timestampMs: Date.now(),
      width: 720,
    }, {
      interactionMode: "scene-query",
      priorGuidance: "Continue forward on the clear sidewalk.",
      sessionId: "session-guidance-1",
    });

    assert.equal(result.success, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://api.example.test/v1/vision/analyze");
    assert.equal(requests[0].body.interactionMode, "scene-query");
    assert.equal(requests[0].body.priorGuidance, "Continue forward on the clear sidewalk.");
    assert.equal(requests[0].body.sampledFrame, true);
    assert.equal(requests[0].body.imageBase64.length, 256);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scene-query safety STOP escapes conversation isolation immediately", () => {
  const { planVisionLaneResult } = loadTsModule(
    new URL("../src/lib/conversationLane.ts", import.meta.url),
  );
  const result = analysis();
  const priorDirection = { direction: "forward", message: "Continue forward." };
  const priorGuidance = "Continue forward on the clear sidewalk.";
  const settings = { descriptionMode: "short", hapticsEnabled: true, speechRate: "normal" };
  const plan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: true,
    mode: "scene-query",
    result,
  });

  assert.equal(plan.directionUpdate, result, "A cloud safety STOP must replace stale forward guidance.");
  assert.equal(plan.settingsUpdate, null, "Scene answers cannot mutate settings.");
  assert.equal(plan.guidanceMessageUpdate, result.message, "Safety STOP must replace prior guidance memory.");
  assert.equal(plan.repeatMessageUpdate, result.message, "Repeat must retain the safety STOP.");
  assert.equal(plan.speech, result.message);
  assert.equal(plan.keepListeningDuringSpeech, true, "A safety STOP must remain voice-interruptible.");
  assert.equal(plan.haptic, "stop", "Scene-query safety STOP must trigger the normal stop haptic.");
  assert.equal(plan.audioCue, "stop", "Scene-query safety STOP must trigger the normal stop earcon.");
  assert.equal(plan.announcement, null, "Scene answers cannot trigger a separate VoiceOver announcement.");

  const nextState = {
    direction: plan.directionUpdate ?? priorDirection,
    lastGuidance: plan.guidanceMessageUpdate ?? priorGuidance,
    lastSpoken: plan.repeatMessageUpdate ?? "Analyzing the scene now.",
    settings: plan.settingsUpdate ?? settings,
  };
  assert.equal(nextState.direction, result);
  assert.equal(nextState.lastGuidance, result.message);
  assert.equal(nextState.lastSpoken, result.message);
  assert.equal(nextState.settings, settings);

  const selfTriggerPlan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: false,
    mode: "scene-query",
    result: analysis({ sceneDescription: "A stopped vehicle is ahead." }),
  });
  assert.equal(
    selfTriggerPlan.keepListeningDuringSpeech,
    true,
    "STOP must remain available even when guidance speech contains stop or pause language.",
  );
});

test("safe scene-query effects update repeat only and cannot mutate guidance or settings", () => {
  const { planVisionLaneResult } = loadTsModule(
    new URL("../src/lib/conversationLane.ts", import.meta.url),
  );
  const result = analysis({
    direction: "forward",
    hazardLevel: "none",
    obstacle: false,
    walkability: "clear",
  });
  const plan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: true,
    mode: "scene-query",
    result,
  });

  assert.equal(plan.directionUpdate, null);
  assert.equal(plan.guidanceMessageUpdate, null);
  assert.equal(plan.settingsUpdate, null);
  assert.equal(plan.repeatMessageUpdate, result.sceneDescription);
  assert.equal(plan.speech, result.sceneDescription);
  assert.equal(plan.haptic, null);
  assert.equal(plan.audioCue, null);
});

test("guidance effects remain safety-bounded", () => {
  const { planVisionLaneResult } = loadTsModule(
    new URL("../src/lib/conversationLane.ts", import.meta.url),
  );
  const result = analysis();
  const plan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: false,
    mode: "guidance",
    result,
  });

  assert.equal(plan.directionUpdate, result);
  assert.equal(plan.guidanceMessageUpdate, result.message);
  assert.equal(plan.repeatMessageUpdate, result.message);
  assert.equal(plan.keepListeningDuringSpeech, true);
  assert.equal(plan.haptic, "stop");
  assert.equal(plan.audioCue, "stop");
  assert.equal(plan.announcement, null);

  const interruptingStopPlan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: true,
    mode: "guidance",
    result,
  });
  assert.equal(
    interruptingStopPlan.speech,
    result.message,
    "A safety STOP result must interrupt ordinary speech instead of being dropped.",
  );
  assert.equal(interruptingStopPlan.guidanceMessageUpdate, result.message);
  assert.equal(interruptingStopPlan.repeatMessageUpdate, result.message);

  const suppressedForwardPlan = planVisionLaneResult({
    hapticsEnabled: true,
    isGuiding: true,
    isSpeaking: true,
    mode: "guidance",
    result: analysis({
      direction: "forward",
      hazardLevel: "none",
      message: "Continue forward.",
      obstacle: false,
      walkability: "clear",
    }),
  });
  assert.equal(
    suppressedForwardPlan.speech,
    null,
    "Ordinary forward guidance must not overlap speech already in progress.",
  );
});
