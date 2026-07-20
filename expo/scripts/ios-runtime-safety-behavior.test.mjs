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
    Number,
    Promise,
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

function safeMovement(overrides = {}) {
  return {
    confidence: 0.9,
    direction: "forward",
    fallbackReason: null,
    hazardLevel: "none",
    latencyMs: 100,
    lighting: "normal",
    message: "Continue forward.",
    obstacle: false,
    walkability: "clear",
    ...overrides,
  };
}

test("deterministic iOS guard can only preserve safe movement or force STOP", () => {
  const {
    MAX_ANALYSIS_LATENCY_AT_ACTUATION_MS,
    MAX_FRAME_AGE_AT_ACTUATION_MS,
    applyDeterministicVisionSafetyGuard,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const nowMs = Date.now();
  const timing = { analysisLatencyMs: 100, capturedAtMs: nowMs, nowMs };

  assert.equal(
    applyDeterministicVisionSafetyGuard(safeMovement(), timing).direction,
    "forward",
  );

  const unsafeCases = [
    [safeMovement({ confidence: 0.64 }), "ios-low-confidence"],
    [safeMovement({ obstacle: true }), "ios-obstacle"],
    [safeMovement({ hazardLevel: "medium" }), "ios-hazard"],
    [safeMovement({ hazardLevel: "high" }), "ios-hazard"],
    [safeMovement({ walkability: "caution" }), "ios-walkability"],
    [safeMovement({ walkability: "uncertain" }), "ios-walkability"],
    [safeMovement({ lighting: "dim" }), "ios-low-visibility"],
    [safeMovement({ lighting: "dark" }), "ios-low-visibility"],
    [safeMovement({ lighting: "unknown" }), "ios-low-visibility"],
    [safeMovement({ fallbackReason: "provider-fallback" }), "ios-fallback-reason"],
    [safeMovement({ direction: "stop" }), "ios-explicit-stop"],
  ];

  for (const [candidate, expectedReason] of unsafeCases) {
    const result = applyDeterministicVisionSafetyGuard(candidate, timing);
    assert.equal(result.direction, "stop");
    assert.equal(result.fallbackReason, expectedReason);
  }

  assert.equal(
    applyDeterministicVisionSafetyGuard(safeMovement(), {
      ...timing,
      capturedAtMs: nowMs - MAX_FRAME_AGE_AT_ACTUATION_MS - 1,
    }).fallbackReason,
    "ios-stale-frame",
  );
  assert.equal(
    applyDeterministicVisionSafetyGuard(safeMovement(), {
      ...timing,
      analysisLatencyMs: MAX_ANALYSIS_LATENCY_AT_ACTUATION_MS + 1,
    }).fallbackReason,
    "ios-analysis-latency",
  );
  assert.equal(
    applyDeterministicVisionSafetyGuard(safeMovement(), {
      ...timing,
      recoveryGateActive: true,
    }).fallbackReason,
    "ios-recovery-gate",
  );
});

test("freshness gate rejects old and pre-recovery frames before upload", () => {
  const {
    MAX_FRAME_AGE_BEFORE_UPLOAD_MS,
    assertFreshFrameForUpload,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const nowMs = Date.now();

  assert.throws(
    () => assertFreshFrameForUpload({
      capturedAtMs: nowMs - MAX_FRAME_AGE_BEFORE_UPLOAD_MS - 1,
      nowMs,
    }),
    (error) => error?.reason === "stale-frame",
  );
  assert.throws(
    () => assertFreshFrameForUpload({
      capturedAtMs: nowMs - 1,
      minimumCapturedAtMs: nowMs,
      nowMs,
    }),
    (error) => error?.reason === "pre-recovery-frame",
  );
  assert.doesNotThrow(() => assertFreshFrameForUpload({
    capturedAtMs: nowMs + 1,
    minimumCapturedAtMs: nowMs,
    nowMs: nowMs + 1,
  }));
});

test("STOP remains deterministic while spoken guidance is active", () => {
  const {
    canKeepListeningForStopBargeInDuringSpeech,
    isStopBargeInCommand,
    parseVoiceCommand,
  } = loadTsModule(new URL("../src/lib/voiceCommands.ts", import.meta.url));

  assert.equal(canKeepListeningForStopBargeInDuringSpeech("Stop at the curb ahead."), true);
  for (const transcript of ["stop", "guide pup stop", "cancel guidance", "pause"]) {
    assert.equal(isStopBargeInCommand(transcript), true);
    assert.equal(parseVoiceCommand(transcript), "stop-guidance");
  }
});

test("fallback camera ownership and STOP observation are fail closed", () => {
  const {
    evaluateStopRuntimeObservation,
    shouldOwnFallbackCamera,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const baseOwnership = {
    focused: true,
    guiding: true,
    permissionGranted: true,
    runtimeSafetyHold: false,
    usingFallback: true,
  };

  assert.equal(shouldOwnFallbackCamera(baseOwnership), true);
  for (const key of ["focused", "guiding", "permissionGranted", "usingFallback"]) {
    assert.equal(shouldOwnFallbackCamera({ ...baseOwnership, [key]: false }), false);
  }
  assert.equal(shouldOwnFallbackCamera({ ...baseOwnership, runtimeSafetyHold: true }), false);

  assert.deepEqual(
    { ...evaluateStopRuntimeObservation({
      analysisActive: false,
      fallbackCameraActive: false,
      nativeCameraActive: false,
      voiceListening: false,
      voiceSpeaking: false,
    }) },
    {
      analysisInactive: true,
      cameraInactive: true,
      listeningStopped: true,
      quiescent: true,
      staleSpeechAfterStop: false,
    },
  );
  assert.equal(evaluateStopRuntimeObservation({
    analysisActive: true,
    fallbackCameraActive: false,
    nativeCameraActive: false,
    voiceListening: false,
    voiceSpeaking: false,
  }).quiescent, false);
});

test("a deferred owned voice start stops itself after STOP invalidates it", async () => {
  const {
    invalidateOwnedVoiceSessionAttempts,
    startOwnedVoiceSession,
  } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const attemptGenerationRef = { current: 0 };
  const attemptGeneration = attemptGenerationRef.current + 1;
  attemptGenerationRef.current = attemptGeneration;
  let activeOwner = null;
  let releaseStart;
  const startGate = new Promise((resolve) => {
    releaseStart = resolve;
  });

  const resultPromise = startOwnedVoiceSession({
    isCurrent: () => attemptGenerationRef.current === attemptGeneration,
    ownerToken: "old-owner",
    start: async (ownerToken) => {
      await startGate;
      activeOwner = ownerToken;
      return { listening: true };
    },
    stop: async (ownerToken) => {
      if (activeOwner === ownerToken) activeOwner = null;
    },
  });

  invalidateOwnedVoiceSessionAttempts(attemptGenerationRef);
  releaseStart();
  assert.equal(await resultPromise, null);
  assert.equal(activeOwner, null);
});

test("stale owned cleanup cannot stop a newer voice listener", async () => {
  const { startOwnedVoiceSession } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  let activeOwner = "old-owner";

  const result = await startOwnedVoiceSession({
    isCurrent: () => {
      activeOwner = "new-owner";
      return false;
    },
    ownerToken: "old-owner",
    start: async () => ({ listening: true }),
    stop: async (ownerToken) => {
      if (activeOwner === ownerToken) activeOwner = null;
    },
  });

  assert.equal(result, null);
  assert.equal(activeOwner, "new-owner");
});

test("owned cleanup captures and clears its token before an async stop", async () => {
  const { stopOwnedVoiceSession } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const ownerRef = { current: "old-owner" };
  let stoppedOwner = null;
  let releaseStop;
  const stopGate = new Promise((resolve) => {
    releaseStop = resolve;
  });

  const cleanup = stopOwnedVoiceSession({
    ownerRef,
    stop: async (ownerToken) => {
      await stopGate;
      stoppedOwner = ownerToken;
      return { listening: false };
    },
  });

  assert.equal(ownerRef.current, null);
  ownerRef.current = "new-owner";
  releaseStop();
  assert.deepEqual({ ...await cleanup }, { listening: false });
  assert.equal(stoppedOwner, "old-owner");
  assert.equal(ownerRef.current, "new-owner");

  let emptyStopCalls = 0;
  assert.equal(await stopOwnedVoiceSession({
    ownerRef: { current: null },
    stop: async () => {
      emptyStopCalls += 1;
    },
  }), null);
  assert.equal(emptyStopCalls, 0);
});

test("a delayed announcement release cannot interrupt a newer route owner", async () => {
  const { releaseOwnedAnnouncementOwner } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const ownerRef = { current: "home-announcement-owner" };
  let activeNativeOwner = ownerRef.current;
  let releaseGate;
  const delayedRelease = new Promise((resolve) => {
    releaseGate = resolve;
  });

  const staleRelease = releaseOwnedAnnouncementOwner({
    ownerRef,
    release: async (ownerToken) => {
      await delayedRelease;
      if (activeNativeOwner === ownerToken) {
        activeNativeOwner = null;
      }
      return ownerToken;
    },
  });

  assert.equal(ownerRef.current, null);
  ownerRef.current = "navigation-announcement-owner";
  activeNativeOwner = ownerRef.current;
  releaseGate();

  assert.equal(await staleRelease, "home-announcement-owner");
  assert.equal(ownerRef.current, "navigation-announcement-owner");
  assert.equal(activeNativeOwner, "navigation-announcement-owner");
});

test("voice route subscriptions keep STOP live while React handlers change", () => {
  const { subscribeToStableVoiceRoute } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  let recognitionListener;
  let stateListener;
  let recognitionAdds = 0;
  let stateAdds = 0;
  let removals = 0;
  const handled = [];
  const recognitionHandlerRef = {
    current: (event) => handled.push(`initial:${event.transcript}`),
  };
  const stateHandlerRef = {
    current: (event) => handled.push(`initial:${event.listening}`),
  };

  const unsubscribe = subscribeToStableVoiceRoute({
    addRecognitionListener: (listener) => {
      recognitionAdds += 1;
      recognitionListener = listener;
      return { remove: () => { removals += 1; } };
    },
    addStateListener: (listener) => {
      stateAdds += 1;
      stateListener = listener;
      return { remove: () => { removals += 1; } };
    },
    recognitionHandlerRef,
    stateHandlerRef,
  });

  recognitionListener({ transcript: "status" });
  stateListener({ listening: true });

  // Simulate speech/settings rerenders replacing closures without touching native listeners.
  recognitionHandlerRef.current = (event) => handled.push(`latest:${event.transcript}`);
  stateHandlerRef.current = (event) => handled.push(`latest:${event.listening}`);
  recognitionListener({ transcript: "stop" });
  stateListener({ listening: true });

  assert.equal(recognitionAdds, 1);
  assert.equal(stateAdds, 1);
  assert.equal(removals, 0);
  assert.deepEqual(handled, [
    "initial:status",
    "initial:true",
    "latest:stop",
    "latest:true",
  ]);

  unsubscribe();
  assert.equal(removals, 2);
});

test("queued resume stays blocked until the current STOP operation finishes", async () => {
  const {
    beginVoiceStopOperation,
    decideVoiceGuidanceResume,
    finishVoiceStopOperation,
    isVoiceStopOperationCurrent,
  } = loadTsModule(new URL("../src/lib/voiceStopOperation.ts", import.meta.url));
  const refs = {
    focusGenerationRef: { current: 1 },
    operationGenerationRef: { current: 0 },
    operationInFlightRef: { current: false },
  };
  const token = beginVoiceStopOperation(refs);
  assert.ok(token);
  let releaseStop;
  const stopGate = new Promise((resolve) => {
    releaseStop = resolve;
  });
  const effects = [];
  const stop = (async () => {
    try {
      await stopGate;
      if (isVoiceStopOperationCurrent({ focused: true, refs, token })) {
        effects.push("rearm-listener");
      }
    } finally {
      finishVoiceStopOperation({ refs, token });
    }
  })();

  assert.equal(decideVoiceGuidanceResume({
    guiding: false,
    recoveryHold: false,
    stopOperationInFlight: refs.operationInFlightRef.current,
  }), "stop-in-flight");
  assert.deepEqual(effects, []);

  releaseStop();
  await stop;
  assert.deepEqual(effects, ["rearm-listener"]);
  assert.equal(refs.operationInFlightRef.current, false);
  assert.equal(decideVoiceGuidanceResume({
    guiding: false,
    recoveryHold: false,
    stopOperationInFlight: refs.operationInFlightRef.current,
  }), "resume");
});

test("a STOP from an old focus cannot rearm or clear a newer STOP", async () => {
  const {
    beginVoiceStopOperation,
    finishVoiceStopOperation,
    isVoiceStopOperationCurrent,
    transitionVoiceStopOperationFocus,
  } = loadTsModule(new URL("../src/lib/voiceStopOperation.ts", import.meta.url));
  const refs = {
    focusGenerationRef: { current: 1 },
    operationGenerationRef: { current: 0 },
    operationInFlightRef: { current: false },
  };
  let focused = true;
  const oldToken = beginVoiceStopOperation(refs);
  assert.ok(oldToken);
  let releaseOldStop;
  const oldStopGate = new Promise((resolve) => {
    releaseOldStop = resolve;
  });
  const effects = [];
  const oldStop = (async () => {
    try {
      await oldStopGate;
      if (isVoiceStopOperationCurrent({ focused, refs, token: oldToken })) {
        effects.push("stale-rearm");
      }
    } finally {
      finishVoiceStopOperation({ refs, token: oldToken });
    }
  })();

  focused = false;
  transitionVoiceStopOperationFocus(refs);
  focused = true;
  transitionVoiceStopOperationFocus(refs);
  const newToken = beginVoiceStopOperation(refs);
  assert.ok(newToken);

  releaseOldStop();
  await oldStop;
  assert.deepEqual(effects, []);
  assert.equal(refs.operationInFlightRef.current, true);
  assert.equal(isVoiceStopOperationCurrent({ focused, refs, token: newToken }), true);

  finishVoiceStopOperation({ refs, token: newToken });
  assert.equal(refs.operationInFlightRef.current, false);
});

test("a rejected stale voice start cancels its native recovery owner", async () => {
  const { startOwnedVoiceSession } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  let current = true;
  let recoveringOwner = null;
  let releaseStart;
  const startGate = new Promise((resolve) => {
    releaseStart = resolve;
  });

  const resultPromise = startOwnedVoiceSession({
    isCurrent: () => current,
    ownerToken: "stale-recovery-owner",
    start: async (ownerToken) => {
      recoveringOwner = ownerToken;
      await startGate;
      throw new Error("native start failed after scheduling recovery");
    },
    stop: async (ownerToken) => {
      if (recoveringOwner === ownerToken) recoveringOwner = null;
    },
  });

  current = false;
  releaseStart();
  await assert.rejects(resultPromise, /native start failed/);
  assert.equal(recoveringOwner, null);
});

test("aborting navigation cancels an in-flight analyze upload without failure telemetry", async () => {
  const telemetry = [];
  const breadcrumbs = [];
  let uploadedSignal;
  let markFetchStarted;
  const fetchStarted = new Promise((resolve) => {
    markFetchStarted = resolve;
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    uploadedSignal = init?.signal;
    markFetchStarted();
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const error = new Error("fetch aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  };

  try {
    const mocks = new Map([
      ["expo-constants", { default: { expoConfig: { version: "1.0.0" } } }],
      ["react-native", { Platform: { OS: "ios" } }],
      ["./config", {
        appConfig: { apiBaseUrl: "https://api.example.test", apiTimeoutMs: 10_000, appEnv: "test" },
        requireApiBaseUrl: () => "https://api.example.test",
      }],
      ["./device", {
        clearDeviceSession: async () => undefined,
        ensureDeviceSession: async () => ({ deviceId: "device-test", sessionToken: "session-test" }),
      }],
      ["./diagnostics", {
        classifyAnalyzeError: () => "failure",
        recordAnalyzeEvent: (event) => telemetry.push(event),
        recordHealthCheckSnapshot: () => undefined,
        sanitizeMessage: (value) => value,
      }],
      ["./sentry", {
        addBreadcrumb: (event) => breadcrumbs.push(event),
        setSentryTag: () => undefined,
      }],
    ]);
    const { analyzeVision } = loadTsModule(new URL("../src/lib/api.ts", import.meta.url), mocks);
    const controller = new AbortController();
    const request = analyzeVision({
      imageBase64: "a".repeat(256),
      interactionMode: "guidance",
      mimeType: "image/jpeg",
      timestampMs: Date.now(),
    }, { signal: controller.signal });

    await fetchStarted;
    controller.abort();
    await assert.rejects(request, (error) => error?.name === "AbortError");
    assert.equal(uploadedSignal?.aborted, true);
    assert.equal(telemetry.length, 0, "User cancellation must not be recorded as a provider failure.");
    assert.equal(
      breadcrumbs.some((event) => event.message === "Vision analyze threw"),
      false,
      "User cancellation must not emit a failure breadcrumb.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("abort during JS preprocessing prevents the upload from starting", async () => {
  let finishPreprocessing;
  let analyzeCalls = 0;
  const preprocessing = new Promise((resolve) => {
    finishPreprocessing = resolve;
  });
  const runtimeSafety = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const mocks = new Map([
    ["expo-image-manipulator", {
      SaveFormat: { JPEG: "jpeg" },
      manipulateAsync: async () => preprocessing,
    }],
    ["react-native", { Platform: { OS: "ios" } }],
    ["@/src/lib/api", {
      analyzeVision: async () => {
        analyzeCalls += 1;
        return safeMovement();
      },
    }],
    ["@/src/lib/diagnostics", { recordAnalyzeEvent: () => undefined }],
    ["@/src/lib/runtimeSafety", runtimeSafety],
    ["@/src/lib/sentry", { captureAppError: () => undefined }],
  ]);
  const { VisionAI } = loadTsModule(new URL("../src/logic/VisionAI.ts", import.meta.url), mocks);
  const controller = new AbortController();
  const analysis = VisionAI.analyzeFrame({
    height: 1080,
    source: "js-fallback",
    timestampMs: Date.now(),
    uri: "file:///frame.jpg",
    width: 1920,
  }, { signal: controller.signal });

  await Promise.resolve();
  controller.abort();
  finishPreprocessing({ base64: "a".repeat(256), height: 432, uri: "file:///prepared.jpg", width: 768 });

  await assert.rejects(analysis, (error) => error?.name === "AbortError");
  assert.equal(analyzeCalls, 0);
});
