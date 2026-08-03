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

function createNavigationCoreAnnouncementHarness({ nativeModule = null } = {}) {
  const listeners = new Map();
  const postedAnnouncements = [];
  let listenerSequence = 0;
  let removedListenerCount = 0;
  const AccessibilityInfo = {
    addEventListener(eventName, listener) {
      assert.equal(eventName, "announcementFinished");
      listenerSequence += 1;
      const listenerId = listenerSequence;
      listeners.set(listenerId, listener);
      return {
        remove() {
          if (listeners.delete(listenerId)) {
            removedListenerCount += 1;
          }
        },
      };
    },
    announceForAccessibility() {},
    announceForAccessibilityWithOptions(announcement, options) {
      postedAnnouncements.push({ announcement, options });
    },
  };
  class MockFile {
    exists = false;
    delete() {}
  }
  const mocks = new Map([
    ["expo", { requireOptionalNativeModule: () => nativeModule }],
    ["expo-file-system", { File: MockFile }],
    ["expo-haptics", {
      ImpactFeedbackStyle: { Heavy: "heavy", Light: "light", Medium: "medium" },
      NotificationFeedbackType: { Error: "error", Success: "success" },
      impactAsync: async () => {},
      notificationAsync: async () => {},
    }],
    ["expo-image-manipulator", {
      SaveFormat: { JPEG: "jpeg" },
      manipulateAsync: async () => {
        throw new Error("Unexpected image manipulation.");
      },
    }],
    ["react-native", { AccessibilityInfo, Platform: { OS: "ios" } }],
    ["@/src/lib/diagnostics", {
      recordAudioCueSnapshot() {},
      recordHapticSnapshot() {},
    }],
  ]);
  const {
    GuidePupNavigationCore,
    getFallbackAnnouncementCompletionTimeoutMs,
  } = loadTsModule(
    new URL("../src/native/GuidePupNavigationCore.ts", import.meta.url),
    mocks,
  );

  return {
    activeListenerCount: () => listeners.size,
    core: GuidePupNavigationCore,
    getCompletionTimeoutMs: getFallbackAnnouncementCompletionTimeoutMs,
    emitAnnouncementFinished(event) {
      for (const listener of [...listeners.values()]) {
        listener(event);
      }
    },
    postedAnnouncements,
    removedListenerCount: () => removedListenerCount,
  };
}

test("STOP sensory calls expose the outcome of that exact delivery attempt", async () => {
  const hapticSuccessAudioFailure = createNavigationCoreAnnouncementHarness({
    nativeModule: {
      playAudioCue: async () => {
        throw new Error("simulated audio failure");
      },
      playHaptic: async () => {},
    },
  }).core;

  assert.equal(
    await hapticSuccessAudioFailure.playHapticWithOutcome("stop"),
    "success",
  );
  assert.equal(
    await hapticSuccessAudioFailure.playAudioCueWithOutcome("stop"),
    "failure",
  );

  const fallback = createNavigationCoreAnnouncementHarness().core;
  assert.equal(await fallback.playHapticWithOutcome("stop"), "success");
  assert.equal(await fallback.playAudioCueWithOutcome("stop"), "failure");
});

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

test("camera fallback validation is explicit and never overrides normal native selection", () => {
  const {
    JS_FALLBACK_VALIDATION_CAMERA_PATH,
    resolveInitialNavigationCorePath,
    shouldForceJsFallbackValidation,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));

  assert.equal(shouldForceJsFallbackValidation(JS_FALLBACK_VALIDATION_CAMERA_PATH), true);
  assert.equal(shouldForceJsFallbackValidation([JS_FALLBACK_VALIDATION_CAMERA_PATH]), true);
  assert.equal(shouldForceJsFallbackValidation([
    JS_FALLBACK_VALIDATION_CAMERA_PATH,
    "native-core",
  ]), true);
  assert.equal(shouldForceJsFallbackValidation([
    "native-core",
    JS_FALLBACK_VALIDATION_CAMERA_PATH,
  ]), true);
  assert.equal(shouldForceJsFallbackValidation([]), false);
  assert.equal(shouldForceJsFallbackValidation(["", "unknown"]), false);
  assert.equal(shouldForceJsFallbackValidation("native-core"), false);
  assert.equal(shouldForceJsFallbackValidation(""), false);
  assert.equal(shouldForceJsFallbackValidation(undefined), false);
  assert.equal(resolveInitialNavigationCorePath({ nativeAvailable: true }), "native-core");
  assert.equal(resolveInitialNavigationCorePath({ nativeAvailable: false }), "js-fallback");
  assert.equal(resolveInitialNavigationCorePath({
    nativeAvailable: true,
    requestedCameraPath: JS_FALLBACK_VALIDATION_CAMERA_PATH,
  }), "js-fallback");
});

test("spoken camera status fails closed for native recovery and stays truthful for fallback", () => {
  const { resolveNavigationCameraStatus } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const nativeInput = {
    activeCameraPath: "native-core",
    cameraRecoveryGateActive: false,
    fallbackCameraOwned: false,
    nativeRecoveryReady: true,
    nativeSessionActive: true,
    permissionGranted: true,
    transitionReady: true,
  };

  assert.deepEqual({ ...resolveNavigationCameraStatus(nativeInput) }, {
    cameraReady: true,
    cameraStatus: "Native camera path is ready.",
  });
  assert.deepEqual({ ...resolveNavigationCameraStatus({
    ...nativeInput,
    cameraRecoveryGateActive: true,
  }) }, {
    cameraReady: false,
    cameraStatus: "Native camera path is not ready.",
  });
  assert.equal(resolveNavigationCameraStatus({
    ...nativeInput,
    nativeSessionActive: false,
  }).cameraReady, false);
  assert.equal(resolveNavigationCameraStatus({
    ...nativeInput,
    nativeRecoveryReady: false,
  }).cameraReady, false);

  assert.deepEqual({ ...resolveNavigationCameraStatus({
    ...nativeInput,
    activeCameraPath: "js-fallback",
    cameraRecoveryGateActive: true,
    fallbackCameraOwned: true,
    nativeRecoveryReady: false,
    nativeSessionActive: false,
  }) }, {
    cameraReady: true,
    cameraStatus: "Backup camera is owned by this session and ready.",
  });
  assert.deepEqual({ ...resolveNavigationCameraStatus({
    ...nativeInput,
    activeCameraPath: "js-fallback",
    fallbackCameraOwned: false,
  }) }, {
    cameraReady: false,
    cameraStatus: "Backup camera is not owned or ready.",
  });
  assert.deepEqual({ ...resolveNavigationCameraStatus({
    ...nativeInput,
    permissionGranted: false,
  }) }, {
    cameraReady: false,
    cameraStatus: "Camera permission is not granted.",
  });
});

test("Navigation primary control exposes its action before and after voice STOP", () => {
  const { getNavigationPrimaryControlAccessibility } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );

  assert.deepEqual({ ...getNavigationPrimaryControlAccessibility(true) }, {
    hint: "Double tap to stop guidance.",
    label: "Stop guidance",
    visibleHint: "Tap to stop",
  });
  assert.deepEqual({ ...getNavigationPrimaryControlAccessibility(false) }, {
    hint: "Double tap to return to the Home screen.",
    label: "Return Home",
    visibleHint: "Return Home",
  });
});

test("fallback camera ownership waits for native release and rejects stale path generations", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let resolveFirstStop;
  const firstStop = new Promise((resolve) => {
    resolveFirstStop = resolve;
  });

  const firstGeneration = coordinator.beginTransition();
  const firstRelease = coordinator.releaseNativeForFallback(
    firstGeneration,
    () => firstStop,
  );
  await Promise.resolve();
  assert.equal(coordinator.hasFallbackOwnership(firstGeneration), false);

  const secondGeneration = coordinator.beginTransition();
  resolveFirstStop();
  assert.equal(await firstRelease, false);
  assert.equal(coordinator.hasFallbackOwnership(firstGeneration), false);
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), false);

  let resolveSecondStop;
  const secondStop = new Promise((resolve) => {
    resolveSecondStop = resolve;
  });
  const secondRelease = coordinator.releaseNativeForFallback(
    secondGeneration,
    () => secondStop,
  );
  await Promise.resolve();
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), false);
  resolveSecondStop();
  assert.equal(await secondRelease, true);
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), true);
  assert.equal(coordinator.isFallbackReady(secondGeneration), false);
  assert.equal(coordinator.markFallbackReady(firstGeneration), false);
  assert.equal(coordinator.markFallbackReady(secondGeneration), true);
  assert.equal(coordinator.isFallbackReady(secondGeneration), true);
  assert.equal(coordinator.markFallbackUnavailable(secondGeneration), true);
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), false);
  assert.equal(coordinator.isFallbackReady(secondGeneration), false);

  coordinator.cancelTransition(secondGeneration);
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), false);
  assert.equal(coordinator.isFallbackReady(secondGeneration), false);
});

test("queued camera shutdown finishes before a superseding native start", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  const operations = [];
  let resolveStop;
  const stopGate = new Promise((resolve) => {
    resolveStop = resolve;
  });

  const stoppingGeneration = coordinator.beginTransition();
  const stopResult = coordinator.stopNativeSession(stoppingGeneration, async () => {
    operations.push("stop-started");
    await stopGate;
    operations.push("stop-finished");
  });
  await Promise.resolve();

  const startingGeneration = coordinator.beginTransition();
  const startResult = coordinator.startNativeSession(
    startingGeneration,
    async () => {
      operations.push("start");
    },
    async () => {
      operations.push("stale-start-cleanup");
    },
  );
  assert.deepEqual(operations, ["stop-started"]);

  resolveStop();
  assert.equal(await stopResult, false);
  assert.equal(await startResult, true);
  assert.deepEqual(operations, ["stop-started", "stop-finished", "start"]);

  const staleStop = await coordinator.stopNativeSession(stoppingGeneration, async () => {
    operations.push("unexpected-stale-stop");
  });
  assert.equal(staleStop, false);
  assert.doesNotMatch(operations.join(","), /unexpected-stale-stop/);
});

test("quick blur and refocus settles the exact stop before starting a new camera owner", async () => {
  const {
    createCameraOwnershipTransitionCoordinator,
    resolveRecoveryCameraShutdownTruth,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const coordinator = createCameraOwnershipTransitionCoordinator();
  const operations = [];
  let nativeSessionActive = true;
  let resolvePhysicalStop;
  let resolveRefocusStart;
  const physicalStopGate = new Promise((resolve) => {
    resolvePhysicalStop = resolve;
  });
  const refocusStartGate = new Promise((resolve) => {
    resolveRefocusStart = resolve;
  });

  const blurStopRequest = coordinator.requestNativeStop(async () => {
    operations.push("blur-stop-started");
    await physicalStopGate;
    nativeSessionActive = false;
    operations.push("blur-stop-finished");
  });
  await Promise.resolve();

  const refocusGeneration = coordinator.beginTransition();
  const refocusStart = coordinator.startNativeSession(
    refocusGeneration,
    async () => {
      operations.push("refocus-started");
      await refocusStartGate;
      nativeSessionActive = true;
      operations.push("refocus-ready");
    },
    async () => {
      operations.push("refocus-stale-cleanup");
    },
  );
  assert.deepEqual(operations, ["blur-stop-started"]);

  resolvePhysicalStop();
  const stopCompleted = await blurStopRequest.promise;
  assert.equal(stopCompleted, true);
  assert.equal(nativeSessionActive, false);
  assert.equal(resolveRecoveryCameraShutdownTruth({
    nativeSessionActive,
    stateReadCompleted: true,
    stopCompleted,
  }), true);

  resolveRefocusStart();
  assert.equal(await refocusStart, true);
  assert.equal(nativeSessionActive, true);
  assert.deepEqual(operations, [
    "blur-stop-started",
    "blur-stop-finished",
    "refocus-started",
    "refocus-ready",
  ]);

  let staleStopCalls = 0;
  assert.equal(
    await coordinator.stopNativeSession(blurStopRequest.generation, async () => {
      staleStopCalls += 1;
      nativeSessionActive = false;
    }),
    false,
  );
  assert.equal(staleStopCalls, 0);
  assert.equal(nativeSessionActive, true);
  assert.equal(coordinator.isCurrent(refocusGeneration), true);
});

test("route teardown blocks late voice recovery and queued resume until exact settlement", () => {
  const { createRouteTeardownLaunchBarrier } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const barrier = createRouteTeardownLaunchBarrier();
  const effects = {
    cameraGateActive: true,
    cameraTransitions: 0,
    guiding: false,
    runtimeSafetyHold: true,
    voiceOwner: null,
    voiceRecoveryGateActive: true,
  };
  let persistentSafetyHold = false;

  const runOrdinaryRouteCallback = (focusGeneration, callback) => {
    if (
      !barrier.isFocusCurrent(focusGeneration)
      || barrier.isBlocked()
      || persistentSafetyHold
    ) {
      return false;
    }
    callback();
    return true;
  };
  const launchFocusedRuntime = (focusGeneration, owner) =>
    runOrdinaryRouteCallback(focusGeneration, () => {
      effects.runtimeSafetyHold = false;
      effects.voiceRecoveryGateActive = false;
      effects.cameraGateActive = false;
      effects.guiding = true;
      effects.cameraTransitions += 1;
      effects.voiceOwner = owner;
    });

  const oldFocusGeneration = barrier.beginFocus();
  const lateOldOwnerCallback = (callback) =>
    runOrdinaryRouteCallback(oldFocusGeneration, callback);
  barrier.endFocus(oldFocusGeneration);
  const teardownGeneration = barrier.beginTeardown();

  const refocusGeneration = barrier.beginFocus();
  assert.equal(
    barrier.waitForTeardown(refocusGeneration, teardownGeneration),
    true,
  );
  assert.equal(barrier.isBlocked(), true);

  const lateIdleListening = () =>
    runOrdinaryRouteCallback(refocusGeneration, () => {
      effects.voiceRecoveryGateActive = false;
      effects.runtimeSafetyHold = false;
    });
  const queuedStartGuidance = () =>
    launchFocusedRuntime(refocusGeneration, "queued-old-owner");

  assert.equal(lateIdleListening(), false);
  assert.equal(queuedStartGuidance(), false);
  assert.deepEqual(effects, {
    cameraGateActive: true,
    cameraTransitions: 0,
    guiding: false,
    runtimeSafetyHold: true,
    voiceOwner: null,
    voiceRecoveryGateActive: true,
  });

  assert.equal(barrier.settleTeardown(teardownGeneration + 1), false);
  assert.equal(
    barrier.completeFocusSettlement(refocusGeneration, teardownGeneration),
    false,
  );
  assert.equal(barrier.isBlocked(), true);

  assert.equal(barrier.settleTeardown(teardownGeneration), true);
  assert.equal(
    barrier.isBlocked(),
    true,
    "The wait barrier must remain active until the current focus consumes the exact settlement.",
  );
  assert.equal(lateIdleListening(), false);
  assert.equal(queuedStartGuidance(), false);
  assert.equal(
    barrier.completeFocusSettlement(refocusGeneration, teardownGeneration),
    true,
  );
  assert.equal(barrier.isBlocked(), false);
  assert.equal(
    launchFocusedRuntime(refocusGeneration, "current-owner"),
    true,
  );
  assert.deepEqual(effects, {
    cameraGateActive: false,
    cameraTransitions: 1,
    guiding: true,
    runtimeSafetyHold: false,
    voiceOwner: "current-owner",
    voiceRecoveryGateActive: false,
  });

  assert.equal(
    lateOldOwnerCallback(() => {
      effects.cameraGateActive = true;
      effects.guiding = false;
      effects.voiceOwner = "stale-owner";
    }),
    false,
  );
  assert.equal(effects.voiceOwner, "current-owner");
  assert.equal(effects.cameraTransitions, 1);
  assert.equal(effects.guiding, true);

  barrier.endFocus(refocusGeneration);
  const rejectedTeardownGeneration = barrier.beginTeardown();
  const rejectedRefocusGeneration = barrier.beginFocus();
  assert.equal(
    barrier.waitForTeardown(
      rejectedRefocusGeneration,
      rejectedTeardownGeneration,
    ),
    true,
  );
  assert.equal(barrier.settleTeardown(rejectedTeardownGeneration), true);
  assert.equal(
    barrier.completeFocusSettlement(
      rejectedRefocusGeneration,
      rejectedTeardownGeneration,
    ),
    true,
  );
  persistentSafetyHold = true;
  effects.runtimeSafetyHold = true;
  effects.guiding = false;
  assert.equal(
    launchFocusedRuntime(rejectedRefocusGeneration, "unsafe-owner"),
    false,
  );
  assert.equal(effects.voiceOwner, "current-owner");
  assert.equal(effects.cameraTransitions, 1);
});

test("native startup deadline rejects into the fallback ownership path", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let startCalls = 0;
  let stopCalls = 0;
  const generation = coordinator.beginTransition();

  const startWithFallback = async () => {
    try {
      return await coordinator.startNativeSession(
        generation,
        () => {
          startCalls += 1;
          return new Promise(() => {});
        },
        async () => {
          stopCalls += 1;
        },
        8,
        8,
      );
    } catch (error) {
      assert.equal(error?.name, "GuidePupDeadlineError");
      assert.match(error?.message ?? "", /native camera start.*8 ms/i);
      return coordinator.releaseNativeForFallback(
        generation,
        async () => {
          stopCalls += 1;
        },
        8,
      );
    }
  };

  assert.equal(await startWithFallback(), true);
  assert.equal(startCalls, 1);
  assert.equal(stopCalls, 1);
  assert.equal(coordinator.hasFallbackOwnership(generation), true);
});

test("late native startup resolve and reject cannot restore stale ownership", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let resolveLateStart;
  let lateResolveCleanupCalls = 0;
  const lateResolvingStart = new Promise((resolve) => {
    resolveLateStart = resolve;
  });

  const timedOutGeneration = coordinator.beginTransition();
  const timedOutStart = coordinator.startNativeSession(
    timedOutGeneration,
    () => lateResolvingStart,
    async () => {
      lateResolveCleanupCalls += 1;
    },
    8,
    8,
  );
  await assert.rejects(timedOutStart, /native camera start.*8 ms/i);

  let rejectLateStart;
  let lateRejectCleanupCalls = 0;
  const lateRejectingStart = new Promise((_, reject) => {
    rejectLateStart = reject;
  });
  const rejectedGeneration = coordinator.beginTransition();
  const rejectedStart = coordinator.startNativeSession(
    rejectedGeneration,
    () => lateRejectingStart,
    async () => {
      lateRejectCleanupCalls += 1;
    },
    8,
    8,
  );
  await assert.rejects(rejectedStart, /native camera start.*8 ms/i);

  const currentGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(
      currentGeneration,
      async () => undefined,
      8,
    ),
    true,
  );
  resolveLateStart();
  rejectLateStart(new Error("late native start rejection"));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(lateResolveCleanupCalls, 1);
  assert.equal(lateRejectCleanupCalls, 0);
  assert.equal(coordinator.isCurrent(timedOutGeneration), false);
  assert.equal(coordinator.isCurrent(rejectedGeneration), false);
  assert.equal(coordinator.hasFallbackOwnership(timedOutGeneration), false);
  assert.equal(coordinator.hasFallbackOwnership(rejectedGeneration), false);
  assert.equal(coordinator.hasFallbackOwnership(currentGeneration), true);
});

test("native startup completion after supersession uses bounded stale cleanup", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let resolveStart;
  let cleanupCalls = 0;
  const startGate = new Promise((resolve) => {
    resolveStart = resolve;
  });

  const staleGeneration = coordinator.beginTransition();
  const staleStart = coordinator.startNativeSession(
    staleGeneration,
    () => startGate,
    () => {
      cleanupCalls += 1;
      return new Promise(() => {});
    },
    50,
    8,
  );
  await Promise.resolve();
  const currentGeneration = coordinator.beginTransition();
  resolveStart();

  assert.equal(await staleStart, false);
  assert.equal(cleanupCalls, 1);
  assert.equal(coordinator.isCurrent(staleGeneration), false);
  assert.equal(coordinator.isCurrent(currentGeneration), true);
});

test("late native startup completion cannot stop a newer native owner", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let resolveLateStart;
  let staleCleanupCalls = 0;
  const lateStart = new Promise((resolve) => {
    resolveLateStart = resolve;
  });

  const staleGeneration = coordinator.beginTransition();
  await assert.rejects(
    coordinator.startNativeSession(
      staleGeneration,
      () => lateStart,
      async () => {
        staleCleanupCalls += 1;
      },
      8,
      8,
    ),
    /native camera start.*8 ms/i,
  );

  const currentGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.startNativeSession(
      currentGeneration,
      async () => undefined,
      async () => undefined,
      50,
      8,
    ),
    true,
  );

  resolveLateStart();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(staleCleanupCalls, 0);
  assert.equal(coordinator.isCurrent(currentGeneration), true);
});

test("STOP and its inactive-session effect share one native shutdown", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let stopCalls = 0;
  let resolveStop;
  const stopGate = new Promise((resolve) => {
    resolveStop = resolve;
  });
  const stopSession = async () => {
    stopCalls += 1;
    await stopGate;
  };

  const stopCommandRequest = coordinator.requestNativeStop(stopSession);
  const inactiveEffectRequest = coordinator.requestNativeStop(stopSession);
  await Promise.resolve();

  assert.equal(stopCommandRequest.created, true);
  assert.equal(inactiveEffectRequest.created, false);
  assert.equal(inactiveEffectRequest.generation, stopCommandRequest.generation);
  assert.equal(inactiveEffectRequest.promise, stopCommandRequest.promise);
  assert.equal(stopCalls, 1);

  resolveStop();
  assert.equal(await stopCommandRequest.promise, true);
  assert.equal(await inactiveEffectRequest.promise, true);
  assert.equal(stopCalls, 1);
});

test("concurrent STOP consumers share the same bounded retry sequence", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let stopCalls = 0;
  const stopSession = async () => {
    stopCalls += 1;
    if (stopCalls === 1) {
      throw new Error("simulated native stop failure");
    }
  };

  const stopCommandRequest = coordinator.requestNativeStop(stopSession, 2);
  const inactiveEffectRequest = coordinator.requestNativeStop(stopSession, 2);
  assert.equal(inactiveEffectRequest.created, false);
  assert.equal(inactiveEffectRequest.promise, stopCommandRequest.promise);
  assert.equal(await stopCommandRequest.promise, true);
  assert.equal(await inactiveEffectRequest.promise, true);
  assert.equal(stopCalls, 2);
});

test("all consumers receive the same final bounded STOP failure", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let stopCalls = 0;
  const stopSession = async () => {
    stopCalls += 1;
    throw new Error(`simulated native stop failure ${stopCalls}`);
  };

  const stopCommandRequest = coordinator.requestNativeStop(stopSession, 2);
  const inactiveEffectRequest = coordinator.requestNativeStop(stopSession, 2);
  assert.equal(inactiveEffectRequest.promise, stopCommandRequest.promise);
  await assert.rejects(stopCommandRequest.promise, /simulated native stop failure 2/);
  await assert.rejects(inactiveEffectRequest.promise, /simulated native stop failure 2/);
  assert.equal(stopCalls, 2);

  const lifecycleCleanupRequest = coordinator.requestNativeStop(stopSession, 2);
  assert.equal(lifecycleCleanupRequest.created, false);
  assert.equal(lifecycleCleanupRequest.promise, stopCommandRequest.promise);
  await assert.rejects(lifecycleCleanupRequest.promise, /simulated native stop failure 2/);
  assert.equal(stopCalls, 2);

  coordinator.beginTransition();
  const laterRetry = coordinator.requestNativeStop(async () => undefined, 2);
  assert.equal(laterRetry.created, true);
  assert.equal(await laterRetry.promise, true);
});

test("shared STOP callers get exactly two deadline-bounded native stop attempts", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let stopCalls = 0;
  const neverSettlingStop = () => {
    stopCalls += 1;
    return new Promise(() => {});
  };

  const stopCommandRequest = coordinator.requestNativeStop(neverSettlingStop, 2, 8);
  const lifecycleRequest = coordinator.requestNativeStop(neverSettlingStop, 2, 8);
  const outcomes = await Promise.allSettled([
    stopCommandRequest.promise,
    lifecycleRequest.promise,
  ]);

  assert.equal(lifecycleRequest.created, false);
  assert.equal(lifecycleRequest.promise, stopCommandRequest.promise);
  assert.equal(stopCalls, 2);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["rejected", "rejected"]);
  assert.equal(outcomes[0].reason, outcomes[1].reason);
  assert.equal(outcomes[0].reason?.name, "GuidePupDeadlineError");
  assert.match(outcomes[0].reason?.message ?? "", /native camera stop.*8 ms/i);
});

test("time-bounded shutdown operations settle never-ending work and absorb late rejection", { timeout: 2_000 }, async () => {
  const { settlePromiseWithin } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  let rejectLate;
  const lateRejectingOperation = new Promise((_, reject) => {
    rejectLate = reject;
  });

  await assert.rejects(
    settlePromiseWithin(
      () => lateRejectingOperation,
      8,
      "voice listening stop",
    ),
    (error) =>
      error?.name === "GuidePupDeadlineError"
      && /voice listening stop.*8 ms/i.test(error.message),
  );

  rejectLate(new Error("late native rejection"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    await settlePromiseWithin(
      async () => "stopped",
      50,
      "announcement stop",
    ),
    "stopped",
  );
});

test("native STOP confirmation may exceed the control deadline and rearms only after delivery", { timeout: 3_000 }, async () => {
  const {
    settleStopConfirmationDelivery,
    shouldRearmVoiceAfterStopConfirmation,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const effects = [];
  let releaseNativeSpeech;
  const nativeSpeechGate = new Promise((resolve) => {
    releaseNativeSpeech = resolve;
  });
  let stopCurrent = true;

  const stopFlow = (async () => {
    const confirmationDelivered = await settleStopConfirmationDelivery({
      deliver: async () => {
        effects.push("native-confirmation-started");
        await nativeSpeechGate;
        effects.push("native-confirmation-finished");
      },
      isCurrent: () => stopCurrent,
      operationName: "stop confirmation speech",
      timeoutMs: 2_000,
    });
    if (shouldRearmVoiceAfterStopConfirmation({
      confirmationDelivered,
      guidancePaused: true,
      recoveryGateActive: false,
      shutdownConfirmed: true,
      stopCurrent,
    })) {
      effects.push("listener-rearmed");
    }
  })();

  await new Promise((resolve) => setTimeout(resolve, 775));
  assert.deepEqual(effects, ["native-confirmation-started"]);

  releaseNativeSpeech();
  await stopFlow;
  assert.deepEqual(effects, [
    "native-confirmation-started",
    "native-confirmation-finished",
    "listener-rearmed",
  ]);
});

test("never-settling or stale STOP confirmation stays bounded and cannot rearm listening", { timeout: 2_000 }, async () => {
  const {
    resolveStopRuntimeShutdownTruth,
    settleStopConfirmationDelivery,
    shouldRearmVoiceAfterStopConfirmation,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  let rejectLate;
  const lateRejectingConfirmation = new Promise((_, reject) => {
    rejectLate = reject;
  });
  const startedAt = Date.now();
  const timedOutDelivery = await settleStopConfirmationDelivery({
    deliver: () => lateRejectingConfirmation,
    isCurrent: () => true,
    operationName: "stop confirmation speech",
    timeoutMs: 15,
  });

  assert.equal(timedOutDelivery, false);
  assert.ok(Date.now() - startedAt < 500);
  assert.equal(shouldRearmVoiceAfterStopConfirmation({
    confirmationDelivered: timedOutDelivery,
    guidancePaused: true,
    recoveryGateActive: false,
    shutdownConfirmed: true,
    stopCurrent: true,
  }), false);

  rejectLate(new Error("late confirmation rejection"));
  await new Promise((resolve) => setImmediate(resolve));

  const failedAnnouncementDelivery = await settleStopConfirmationDelivery({
    deliver: async () => {
      throw new Error("simulated VoiceOver announcement failure");
    },
    isCurrent: () => true,
    operationName: "STOP safety announcement",
    timeoutMs: 100,
  });
  assert.equal(failedAnnouncementDelivery, false);
  assert.equal(resolveStopRuntimeShutdownTruth({
    controlOperationsConfirmed: true,
    runtimeQuiescent: true,
  }), true);

  let stopCurrent = true;
  let finishStaleDelivery;
  const staleDeliveryGate = new Promise((resolve) => {
    finishStaleDelivery = resolve;
  });
  const staleDelivery = settleStopConfirmationDelivery({
    deliver: () => staleDeliveryGate,
    isCurrent: () => stopCurrent,
    operationName: "stop confirmation announcement",
    timeoutMs: 100,
  });
  stopCurrent = false;
  finishStaleDelivery();

  assert.equal(await staleDelivery, false);
  assert.equal(shouldRearmVoiceAfterStopConfirmation({
    confirmationDelivered: true,
    guidancePaused: true,
    recoveryGateActive: false,
    shutdownConfirmed: true,
    stopCurrent,
  }), false);
});

test("touch STOP leaves Navigation only after shutdown and spoken confirmation are both proven", () => {
  const {
    planVoiceRecoveryCompletion,
    shouldLeaveNavigationAfterTouchStop,
    shouldRetainRuntimeSafetyHoldAfterVoiceRecovery,
    shouldRetryFailedStop,
    shouldSuspendVoiceRecognitionForSpeech,
  } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );

  assert.equal(shouldLeaveNavigationAfterTouchStop({
    confirmationDelivered: true,
    shutdownConfirmed: true,
    stopCurrent: true,
  }), true);

  for (const failedGate of [
    {
      confirmationDelivered: false,
      shutdownConfirmed: true,
      stopCurrent: true,
    },
    {
      confirmationDelivered: true,
      shutdownConfirmed: false,
      stopCurrent: true,
    },
    {
      confirmationDelivered: true,
      shutdownConfirmed: true,
      stopCurrent: false,
    },
  ]) {
    assert.equal(shouldLeaveNavigationAfterTouchStop(failedGate), false);
  }

  assert.equal(shouldRetainRuntimeSafetyHoldAfterVoiceRecovery({
    stopSafetyFailureHold: false,
    touchStopFailureHold: false,
  }), false);
  assert.equal(shouldRetainRuntimeSafetyHoldAfterVoiceRecovery({
    stopSafetyFailureHold: true,
    touchStopFailureHold: false,
  }), true);
  assert.equal(shouldRetainRuntimeSafetyHoldAfterVoiceRecovery({
    stopSafetyFailureHold: false,
    touchStopFailureHold: true,
  }), true);

  const recoveredPlan = planVoiceRecoveryCompletion({
    stopSafetyFailureHold: false,
    touchStopFailureHold: false,
  });
  assert.equal(
    recoveredPlan.detail,
    "Voice control recovered. Say start guidance to resume.",
  );
  assert.equal(recoveredPlan.guidanceActive, false);
  assert.equal(recoveredPlan.runtimeSafetyHold, false);
  assert.equal(recoveredPlan.title, "Guidance paused");
  assert.equal(planVoiceRecoveryCompletion({
    stopSafetyFailureHold: true,
    touchStopFailureHold: false,
  }).guidanceActive, false);

  assert.equal(shouldSuspendVoiceRecognitionForSpeech({
    keepListeningDuringSpeech: false,
    listening: true,
    ownedSession: true,
  }), true);
  assert.equal(shouldSuspendVoiceRecognitionForSpeech({
    keepListeningDuringSpeech: true,
    listening: true,
    ownedSession: true,
  }), false);
  assert.equal(shouldSuspendVoiceRecognitionForSpeech({
    keepListeningDuringSpeech: false,
    listening: false,
    ownedSession: false,
  }), false);

  assert.equal(shouldRetryFailedStop({
    guiding: false,
    stopSafetyFailureHold: true,
    touchStopFailureHold: false,
  }), true);
  assert.equal(shouldRetryFailedStop({
    guiding: false,
    stopSafetyFailureHold: false,
    touchStopFailureHold: true,
  }), true);
  assert.equal(shouldRetryFailedStop({
    guiding: true,
    stopSafetyFailureHold: true,
    touchStopFailureHold: true,
  }), false);
});

test("Home ordinary VoiceOver delivery stays guarded past 750 ms and rearms only after success", { timeout: 3_000 }, async () => {
  const { settleCurrentAnnouncementDelivery } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "home-owner-delayed";
  await harness.core.claimAnnouncementOwner(ownerToken);
  let current = true;
  let listeningRearmed = false;

  const response = (async () => {
    const outcome = await settleCurrentAnnouncementDelivery({
      deliver: () => harness.core.announce(
        "Guide Pup is ready.",
        ownerToken,
        { completionTimeoutMs: 2_000 },
      ),
      interrupt: () => harness.core.cancelAnnouncement(ownerToken),
      isCurrent: () => current,
    });
    if (outcome === "completed" && current) {
      listeningRearmed = true;
    }
    return outcome;
  })();

  assert.equal(harness.activeListenerCount(), 1);
  await new Promise((resolve) => setTimeout(resolve, 775));
  assert.equal(listeningRearmed, false);

  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  assert.equal(await response, "completed");
  assert.equal(listeningRearmed, true);
  assert.equal(harness.activeListenerCount(), 0);
  current = false;
});

test("Navigation ordinary VoiceOver response keeps STOP-only recognition until completion", { timeout: 3_000 }, async () => {
  const { settleCurrentAnnouncementDelivery } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "navigation-owner-ordinary-delayed";
  await harness.core.claimAnnouncementOwner(ownerToken);
  let speechGuardActive = true;
  const canProcessCommand = (intent) => !speechGuardActive || intent === "stop-guidance";

  const response = (async () => {
    const outcome = await settleCurrentAnnouncementDelivery({
      deliver: () => harness.core.announce(
        "Camera is ready.",
        ownerToken,
        { completionTimeoutMs: 2_000 },
      ),
      interrupt: () => harness.core.cancelAnnouncement(ownerToken),
      isCurrent: () => true,
    });
    if (outcome !== "unsafe") {
      speechGuardActive = false;
    }
    return outcome;
  })();

  await new Promise((resolve) => setTimeout(resolve, 775));
  assert.equal(speechGuardActive, true);
  assert.equal(canProcessCommand("status"), false);
  assert.equal(canProcessCommand("stop-guidance"), true);

  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  assert.equal(await response, "completed");
  assert.equal(speechGuardActive, false);
  assert.equal(canProcessCommand("status"), true);
});

test("ordinary VoiceOver fallback timeout covers slow core prompts and remains bounded", () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const homeHelpPrompt = [
    "You can say start guidance, status, slower speech, faster speech, more detail, less detail,",
    "haptics on, haptics off, or help. Guide Pup only accepts this bounded command list for safety.",
  ].join(" ");
  const navigationHelpPrompt = [
    "You can say stop guidance, repeat, status, slower speech, faster speech, more detail,",
    "less detail, haptics on, haptics off, or what do you see.",
    "Guide Pup only accepts this bounded command list for safety.",
  ].join(" ");

  for (const prompt of [homeHelpPrompt, navigationHelpPrompt]) {
    const wordCount = prompt.split(/\s+/).length;
    const slowSpeechDurationMs = wordCount * 2_400;
    const timeoutMs = harness.getCompletionTimeoutMs(prompt);
    assert.ok(timeoutMs > slowSpeechDurationMs);
    assert.ok(timeoutMs <= 120_000);
  }

  assert.equal(harness.getCompletionTimeoutMs("Stop.", 2_000), 2_000);
  assert.equal(harness.getCompletionTimeoutMs("Short response."), 15_000);
  assert.equal(
    harness.getCompletionTimeoutMs(new Array(200).fill("guidance").join(" ")),
    120_000,
  );
});

test("Home can rearm after confirmed announcement interruption but not unsafe cleanup", async () => {
  const { settleCurrentAnnouncementDelivery } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  let interruptionCalls = 0;
  const interruptedOutcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      throw new Error("simulated delivery failure");
    },
    interrupt: async () => {
      interruptionCalls += 1;
    },
    isCurrent: () => true,
  });

  assert.equal(interruptedOutcome, "interrupted");
  assert.equal(interruptionCalls, 1);
  assert.equal(interruptedOutcome !== "unsafe", true);

  const unsafeOutcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      throw new Error("simulated delivery failure");
    },
    interrupt: async () => {
      throw new Error("simulated interruption failure");
    },
    isCurrent: () => true,
  });

  assert.equal(unsafeOutcome, "unsafe");
  assert.equal(unsafeOutcome !== "unsafe", false);
});

test("voice recovery speech guard survives unsafe cleanup and clears after confirmed completion", async () => {
  const { settleCurrentAnnouncementDelivery } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  let recoveryHoldActive = true;
  let speechGuardActive = true;
  const canProcessCommand = (intent) =>
    (!recoveryHoldActive && !speechGuardActive) || intent === "stop-guidance";

  const outcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      throw new Error("simulated recovery announcement failure");
    },
    interrupt: async () => {
      throw new Error("simulated recovery interruption failure");
    },
    isCurrent: () => recoveryHoldActive,
  });
  if (outcome !== "unsafe") {
    speechGuardActive = false;
  }

  assert.equal(outcome, "unsafe");
  assert.equal(recoveryHoldActive, true);
  assert.equal(speechGuardActive, true);
  assert.equal(canProcessCommand("status"), false);
  assert.equal(canProcessCommand("more-detail"), false);
  assert.equal(canProcessCommand("stop-guidance"), true);

  recoveryHoldActive = false;

  let announcementOwnerCurrent = true;
  let releaseRecoveryAnnouncement;
  const recoveryAnnouncementGate = new Promise((resolve) => {
    releaseRecoveryAnnouncement = resolve;
  });
  const completedDelivery = settleCurrentAnnouncementDelivery({
    deliver: () => recoveryAnnouncementGate,
    interrupt: async () => undefined,
    isCurrent: () => announcementOwnerCurrent,
  });
  let recoveredSpeechGuardActive = true;

  releaseRecoveryAnnouncement();
  const completedOutcome = await completedDelivery;
  if (completedOutcome !== "unsafe" && announcementOwnerCurrent) {
    recoveredSpeechGuardActive = false;
  }

  assert.equal(completedOutcome, "completed");
  assert.equal(recoveryHoldActive, false);
  assert.equal(recoveredSpeechGuardActive, false);
  announcementOwnerCurrent = false;
});

test("stale ordinary delivery failure cannot interrupt a newer caller", async () => {
  const { settleCurrentAnnouncementDelivery } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  let current = true;
  let rejectDelivery;
  let interruptionCalls = 0;
  const deliveryGate = new Promise((_, reject) => {
    rejectDelivery = reject;
  });
  const outcome = settleCurrentAnnouncementDelivery({
    deliver: () => deliveryGate,
    interrupt: async () => {
      interruptionCalls += 1;
    },
    isCurrent: () => current,
  });

  current = false;
  rejectDelivery(new Error("superseded ordinary announcement"));

  assert.equal(await outcome, "unsafe");
  assert.equal(interruptionCalls, 0);
});

test("native ordinary announcement rejection posts one completion-aware JS fallback", async () => {
  let nativeAnnouncementCalls = 0;
  const nativeModule = {
    async announce() {
      nativeAnnouncementCalls += 1;
      throw new Error("simulated native rejection");
    },
    async claimAnnouncementOwner() {},
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "ordinary-owner-native-reject";
  await harness.core.claimAnnouncementOwner(ownerToken);
  let delivered = false;
  const delivery = harness.core.announce(
    "Ordinary response.",
    ownerToken,
    { completionTimeoutMs: 500 },
  ).then(() => {
    delivered = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(nativeAnnouncementCalls, 1);
  assert.equal(harness.postedAnnouncements.length, 1);
  assert.equal(harness.activeListenerCount(), 1);
  assert.equal(delivered, false);

  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  await delivery;
  assert.equal(delivered, true);
  assert.equal(harness.postedAnnouncements.length, 1);
  assert.equal(harness.activeListenerCount(), 0);
});

test("aborting in-flight native announcement cancels it without posting JS fallback", async () => {
  let cancelCalls = 0;
  let finishNativeDelivery;
  const nativeDelivery = new Promise((resolve) => {
    finishNativeDelivery = resolve;
  });
  const nativeModule = {
    async announce() {
      await nativeDelivery;
    },
    async cancelAnnouncement() {
      cancelCalls += 1;
    },
    async claimAnnouncementOwner() {},
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "ordinary-owner-native-abort";
  const abortController = new AbortController();
  await harness.core.claimAnnouncementOwner(ownerToken);

  const delivery = harness.core.announce(
    "Announcement that must be cancelled.",
    ownerToken,
    { signal: abortController.signal },
  );
  const outcome = delivery.then(() => "resolved", () => "rejected");
  await new Promise((resolve) => setImmediate(resolve));
  abortController.abort();

  assert.equal(await outcome, "rejected");
  assert.equal(cancelCalls, 1);
  assert.equal(harness.postedAnnouncements.length, 0);

  finishNativeDelivery();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelCalls, 1);
  assert.equal(harness.postedAnnouncements.length, 0);
});

test("native cleanup rejection remains unsafe for callers and STOP shutdown", async () => {
  const nativeModule = {
    async cancelAnnouncement() {
      throw new Error("simulated native cancellation rejection");
    },
    async claimAnnouncementOwner() {},
    async interruptAllAnnouncements() {
      throw new Error("simulated native global interruption rejection");
    },
    async releaseAnnouncementOwner() {
      throw new Error("simulated native owner release rejection");
    },
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "native-cleanup-rejection";
  await harness.core.claimAnnouncementOwner(ownerToken);
  const {
    resolveStopRuntimeShutdownTruth,
    settleCurrentAnnouncementDelivery,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));

  const deliveryOutcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      throw new Error("simulated announcement delivery failure");
    },
    interrupt: () => harness.core.cancelAnnouncement(ownerToken),
    isCurrent: () => true,
  });

  assert.equal(deliveryOutcome, "unsafe");
  await assert.rejects(
    harness.core.cancelAnnouncement(ownerToken),
    /Native VoiceOver announcement interruption could not be confirmed/,
  );
  await assert.rejects(
    harness.core.releaseAnnouncementOwner(ownerToken),
    /Native VoiceOver announcement owner release could not be confirmed/,
  );
  const shutdownOutcomes = await Promise.allSettled([
    harness.core.interruptAllAnnouncements(),
  ]);
  assert.equal(shutdownOutcomes[0].status, "rejected");
  assert.equal(resolveStopRuntimeShutdownTruth({
    controlOperationsConfirmed: shutdownOutcomes.every(
      (outcome) => outcome.status === "fulfilled",
    ),
    runtimeQuiescent: true,
  }), false);
});

test("native cleanup rejection still removes and interrupts pending JS fallback delivery", async () => {
  const nativeModule = {
    async announce() {
      throw new Error("simulated native delivery rejection");
    },
    async cancelAnnouncement() {
      throw new Error("simulated native cancellation rejection");
    },
    async claimAnnouncementOwner() {},
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "native-cleanup-pending-fallback";
  await harness.core.claimAnnouncementOwner(ownerToken);
  const delivery = harness.core.announce(
    "Fallback delivery that must be interrupted.",
    ownerToken,
    { completionTimeoutMs: 5_000 },
  );
  const deliveryOutcome = delivery.then(() => "resolved", () => "rejected");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 1);

  await assert.rejects(
    harness.core.cancelAnnouncement(ownerToken),
    /Native VoiceOver announcement interruption could not be confirmed/,
  );
  assert.equal(await deliveryOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");
});

test("ordinary fallback rejects failed, mismatched, stale, cancelled, and missing completion", { timeout: 2_000 }, async () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "ordinary-owner-fail-closed";
  await harness.core.claimAnnouncementOwner(ownerToken);

  const first = harness.core.announce(
    "First ordinary response.",
    ownerToken,
    { completionTimeoutMs: 500 },
  );
  const firstOutcome = first.then(() => "resolved", () => "rejected");
  const firstPosted = harness.postedAnnouncements[0].announcement;
  const replacement = harness.core.announce(
    "Replacement ordinary response.",
    ownerToken,
    { completionTimeoutMs: 500 },
  );
  const replacementOutcome = replacement.then(() => "resolved", () => "rejected");
  assert.equal(await firstOutcome, "rejected");
  assert.equal(harness.postedAnnouncements[1].announcement, "\u200B");
  const replacementPosted = harness.postedAnnouncements.at(-1).announcement;
  assert.notEqual(firstPosted, replacementPosted);
  assert.equal(harness.activeListenerCount(), 1);

  harness.emitAnnouncementFinished({ announcement: firstPosted, success: true });
  harness.emitAnnouncementFinished({ announcement: "Mismatched response.", success: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 1);

  harness.emitAnnouncementFinished({ announcement: replacementPosted, success: false });
  assert.equal(await replacementOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");

  const cancelled = harness.core.announce(
    "Cancel ordinary response.",
    ownerToken,
    { completionTimeoutMs: 500 },
  );
  const cancelledOutcome = cancelled.then(() => "resolved", () => "rejected");
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.cancelAnnouncement(ownerToken);
  assert.equal(await cancelledOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);

  await assert.rejects(
    harness.core.announce(
      "No completion response.",
      ownerToken,
      { completionTimeoutMs: 20 },
    ),
    /announcement completion.*20 ms/i,
  );
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");
});

test("successful native cleanup silences ordinary JS fallback speech", { timeout: 2_000 }, async () => {
  const nativeCalls = {
    announce: 0,
    cancel: 0,
    interrupt: 0,
    release: 0,
  };
  const nativeModule = {
    async announce() {
      nativeCalls.announce += 1;
      throw new Error("simulated native rejection");
    },
    async cancelAnnouncement() {
      nativeCalls.cancel += 1;
    },
    async claimAnnouncementOwner() {},
    async interruptAllAnnouncements() {
      nativeCalls.interrupt += 1;
    },
    async releaseAnnouncementOwner() {
      nativeCalls.release += 1;
    },
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "ordinary-owner-native-cleanup";
  await harness.core.claimAnnouncementOwner(ownerToken);

  const runCleanupCase = async (message, cleanup) => {
    const delivery = harness.core.announce(
      message,
      ownerToken,
      { completionTimeoutMs: 5_000 },
    );
    const outcome = delivery.then(() => "resolved", () => "rejected");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.activeListenerCount(), 1);
    await cleanup();
    assert.equal(await outcome, "rejected");
    assert.equal(harness.activeListenerCount(), 0);
    assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");
  };

  await runCleanupCase(
    "Cancel ordinary fallback.",
    () => harness.core.cancelAnnouncement(ownerToken),
  );
  await runCleanupCase(
    "Release ordinary fallback.",
    () => harness.core.releaseAnnouncementOwner(ownerToken),
  );
  await harness.core.claimAnnouncementOwner(ownerToken);
  await runCleanupCase(
    "Interrupt ordinary fallback.",
    () => harness.core.interruptAllAnnouncements(),
  );

  assert.deepEqual(nativeCalls, {
    announce: 3,
    cancel: 1,
    interrupt: 1,
    release: 1,
  });
  assert.equal(harness.removedListenerCount(), 3);
});

test("JS VoiceOver fallback waits past 750 ms for matching completion before rearm", { timeout: 3_000 }, async () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "navigation-owner-delayed";
  await harness.core.claimAnnouncementOwner(ownerToken);
  let listeningRearmed = false;
  const delivery = harness.core.supersedeAnnouncement(
    "Guidance paused. Say start guidance to resume.",
    ownerToken,
    { completionTimeoutMs: 2_000 },
  ).then(() => {
    listeningRearmed = true;
  });

  assert.equal(harness.activeListenerCount(), 1);
  assert.equal(harness.postedAnnouncements.length, 1);
  await new Promise((resolve) => setTimeout(resolve, 775));
  assert.equal(listeningRearmed, false);

  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  await delivery;
  assert.equal(listeningRearmed, true);
  assert.equal(harness.activeListenerCount(), 0);
});

test("native supersede rejection falls through to one completion-aware JS announcement", async () => {
  let nativeSupersedeCalls = 0;
  const nativeModule = {
    async claimAnnouncementOwner() {},
    async supersedeAnnouncement() {
      nativeSupersedeCalls += 1;
      throw new Error("simulated native rejection");
    },
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "navigation-owner-native-reject";
  await harness.core.claimAnnouncementOwner(ownerToken);
  let delivered = false;
  const delivery = harness.core.supersedeAnnouncement(
    "Guidance paused.",
    ownerToken,
    { completionTimeoutMs: 500 },
  ).then(() => {
    delivered = true;
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(nativeSupersedeCalls, 1);
  assert.equal(harness.postedAnnouncements.length, 1);
  assert.equal(harness.activeListenerCount(), 1);
  assert.equal(delivered, false);

  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  await delivery;
  assert.equal(delivered, true);
  assert.equal(harness.postedAnnouncements.length, 1);
  assert.equal(harness.activeListenerCount(), 0);
});

test("failed, mismatched, and stale JS completion cannot rearm a newer announcement", async () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "navigation-owner-stale";
  await harness.core.claimAnnouncementOwner(ownerToken);
  const firstDelivery = harness.core.supersedeAnnouncement(
    "Guidance paused.",
    ownerToken,
    { completionTimeoutMs: 500 },
  );
  const firstOutcome = firstDelivery.then(
    () => "resolved",
    () => "rejected",
  );
  const firstPostedAnnouncement = harness.postedAnnouncements[0].announcement;

  let newerRearmed = false;
  const newerDelivery = harness.core.supersedeAnnouncement(
    "Guidance paused.",
    ownerToken,
    { completionTimeoutMs: 500 },
  ).then(
    () => {
      newerRearmed = true;
      return "resolved";
    },
    () => "rejected",
  );
  assert.equal(harness.postedAnnouncements[1].announcement, "\u200B");
  const newerPostedAnnouncement = harness.postedAnnouncements.at(-1).announcement;

  assert.equal(await firstOutcome, "rejected");
  assert.notEqual(firstPostedAnnouncement, newerPostedAnnouncement);
  assert.equal(harness.activeListenerCount(), 1);

  harness.emitAnnouncementFinished({
    announcement: firstPostedAnnouncement,
    success: true,
  });
  harness.emitAnnouncementFinished({
    announcement: "Different announcement",
    success: true,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(newerRearmed, false);

  harness.emitAnnouncementFinished({
    announcement: newerPostedAnnouncement,
    success: false,
  });
  assert.equal(await newerDelivery, "rejected");
  assert.equal(newerRearmed, false);
  assert.equal(harness.activeListenerCount(), 0);
});

test("cancel, release, interrupt, and newer supersede clean pending JS delivery", async () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "navigation-owner-cleanup";
  await harness.core.claimAnnouncementOwner(ownerToken);

  const cancelled = harness.core.supersedeAnnouncement(
    "Cancel me.",
    ownerToken,
    { completionTimeoutMs: 200 },
  );
  const cancelledOutcome = cancelled.then(() => "resolved", () => "rejected");
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.cancelAnnouncement(ownerToken);
  assert.equal(await cancelledOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);

  const superseded = harness.core.supersedeAnnouncement(
    "Supersede me.",
    ownerToken,
    { completionTimeoutMs: 200 },
  );
  const supersededOutcome = superseded.then(() => "resolved", () => "rejected");
  const replacement = harness.core.supersedeAnnouncement(
    "Replacement.",
    ownerToken,
    { completionTimeoutMs: 200 },
  );
  const replacementOutcome = replacement.then(() => "resolved", () => "rejected");
  assert.equal(await supersededOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.releaseAnnouncementOwner(ownerToken);
  assert.equal(await replacementOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);

  await harness.core.claimAnnouncementOwner(ownerToken);
  const interrupted = harness.core.supersedeAnnouncement(
    "Interrupt me.",
    ownerToken,
    { completionTimeoutMs: 200 },
  );
  const interruptedOutcome = interrupted.then(() => "resolved", () => "rejected");
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.interruptAllAnnouncements();
  assert.equal(await interruptedOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);

  await harness.core.claimAnnouncementOwner(ownerToken);
  const abortController = new AbortController();
  const aborted = harness.core.supersedeAnnouncement(
    "Abort me.",
    ownerToken,
    { completionTimeoutMs: 200, signal: abortController.signal },
  );
  const abortedOutcome = aborted.then(() => "resolved", () => "rejected");
  assert.equal(harness.activeListenerCount(), 1);
  abortController.abort();
  assert.equal(await abortedOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);
  assert.ok(harness.removedListenerCount() >= 5);
});

test("successful native cleanup still silences a pending JS fallback announcement", { timeout: 2_000 }, async () => {
  const nativeCalls = {
    cancel: 0,
    release: 0,
    supersede: 0,
  };
  let nativeSupersedeRejects = true;
  const nativeModule = {
    async cancelAnnouncement() {
      nativeCalls.cancel += 1;
    },
    async claimAnnouncementOwner() {},
    async releaseAnnouncementOwner() {
      nativeCalls.release += 1;
    },
    async supersedeAnnouncement() {
      nativeCalls.supersede += 1;
      if (nativeSupersedeRejects) {
        throw new Error("simulated native rejection");
      }
    },
  };
  const harness = createNavigationCoreAnnouncementHarness({ nativeModule });
  const ownerToken = "navigation-owner-native-cleanup";
  await harness.core.claimAnnouncementOwner(ownerToken);

  const cancelled = harness.core.supersedeAnnouncement(
    "Cancel pending fallback.",
    ownerToken,
    { completionTimeoutMs: 5_000 },
  );
  const cancelledOutcome = cancelled.then(() => "resolved", () => "rejected");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.cancelAnnouncement(ownerToken);
  assert.equal(await cancelledOutcome, "rejected");
  assert.equal(nativeCalls.cancel, 1);
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");

  const released = harness.core.supersedeAnnouncement(
    "Release pending fallback.",
    ownerToken,
    { completionTimeoutMs: 5_000 },
  );
  const releasedOutcome = released.then(() => "resolved", () => "rejected");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 1);
  await harness.core.releaseAnnouncementOwner(ownerToken);
  assert.equal(await releasedOutcome, "rejected");
  assert.equal(nativeCalls.release, 1);
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");

  await harness.core.claimAnnouncementOwner(ownerToken);
  const superseded = harness.core.supersedeAnnouncement(
    "Supersede pending fallback.",
    ownerToken,
    { completionTimeoutMs: 5_000 },
  );
  const supersededOutcome = superseded.then(() => "resolved", () => "rejected");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 1);
  nativeSupersedeRejects = false;
  await harness.core.supersedeAnnouncement(
    "Native replacement.",
    ownerToken,
    { completionTimeoutMs: 5_000 },
  );
  assert.equal(await supersededOutcome, "rejected");
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.postedAnnouncements.at(-1).announcement, "\u200B");
  assert.equal(nativeCalls.supersede, 4);
  assert.equal(harness.removedListenerCount(), 3);
});

test("never-firing JS completion is bounded and removes its listener", { timeout: 2_000 }, async () => {
  const harness = createNavigationCoreAnnouncementHarness();
  const ownerToken = "navigation-owner-timeout";
  await harness.core.claimAnnouncementOwner(ownerToken);
  const startedAt = Date.now();

  await assert.rejects(
    harness.core.supersedeAnnouncement(
      "This completion never arrives.",
      ownerToken,
      { completionTimeoutMs: 20 },
    ),
    /announcement completion.*20 ms/i,
  );

  assert.ok(Date.now() - startedAt < 500);
  assert.equal(harness.activeListenerCount(), 0);
  assert.equal(harness.removedListenerCount(), 1);
  harness.emitAnnouncementFinished({
    announcement: harness.postedAnnouncements[0].announcement,
    success: true,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.activeListenerCount(), 0);
});

test("stale CameraView readiness and error events cannot mutate a newer fallback owner", async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();

  const firstGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(firstGeneration, async () => undefined),
    true,
  );
  assert.equal(coordinator.hasFallbackOwnership(firstGeneration), true);

  const secondGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(secondGeneration, async () => undefined),
    true,
  );
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), true);
  assert.equal(coordinator.isFallbackReady(secondGeneration), false);

  assert.equal(coordinator.markFallbackReady(firstGeneration), false);
  assert.equal(coordinator.isFallbackReady(secondGeneration), false);
  assert.equal(coordinator.markFallbackUnavailable(firstGeneration), false);
  assert.equal(coordinator.hasFallbackOwnership(secondGeneration), true);
  assert.equal(coordinator.markFallbackReady(secondGeneration), true);
  assert.equal(coordinator.isFallbackReady(secondGeneration), true);
});

test("fallback readiness deadline fires only for the current unready owner", { timeout: 2_000 }, async () => {
  const { createCameraOwnershipTransitionCoordinator } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const coordinator = createCameraOwnershipTransitionCoordinator();
  let staleDeadlineCalls = 0;
  let currentDeadlineCalls = 0;

  const staleGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(staleGeneration, async () => undefined),
    true,
  );
  coordinator.scheduleFallbackReadinessDeadline(
    staleGeneration,
    8,
    () => {
      staleDeadlineCalls += 1;
    },
  );

  const currentGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(currentGeneration, async () => undefined),
    true,
  );
  await new Promise((resolve) => {
    coordinator.scheduleFallbackReadinessDeadline(
      currentGeneration,
      8,
      () => {
        currentDeadlineCalls += 1;
        resolve();
      },
    );
    coordinator.scheduleFallbackReadinessDeadline(
      staleGeneration,
      1,
      () => {
        staleDeadlineCalls += 1;
      },
    );
  });

  assert.equal(staleDeadlineCalls, 0);
  assert.equal(currentDeadlineCalls, 1);

  const readyGeneration = coordinator.beginTransition();
  assert.equal(
    await coordinator.releaseNativeForFallback(readyGeneration, async () => undefined),
    true,
  );
  let readyDeadlineCalls = 0;
  const cancelReadyDeadline = coordinator.scheduleFallbackReadinessDeadline(
    readyGeneration,
    8,
    () => {
      readyDeadlineCalls += 1;
    },
  );
  assert.equal(coordinator.markFallbackReady(readyGeneration), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  cancelReadyDeadline();
  assert.equal(readyDeadlineCalls, 0);
});

test("live route requests serialize native, forced fallback, and normal ownership", async () => {
  const {
    JS_FALLBACK_VALIDATION_CAMERA_PATH,
    createCameraOwnershipTransitionCoordinator,
    shouldForceJsFallbackValidation,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const coordinator = createCameraOwnershipTransitionCoordinator();
  const operations = [];
  let nativeActive = false;

  const nativeGeneration = coordinator.beginTransition();
  assert.equal(shouldForceJsFallbackValidation(undefined), false);
  assert.equal(await coordinator.startNativeSession(
    nativeGeneration,
    async () => {
      operations.push("native-start-1");
      nativeActive = true;
    },
    async () => {
      operations.push("native-cleanup-1");
      nativeActive = false;
    },
  ), true);
  assert.equal(nativeActive, true);

  const fallbackRequest = ["native-core", JS_FALLBACK_VALIDATION_CAMERA_PATH];
  assert.equal(shouldForceJsFallbackValidation(fallbackRequest), true);
  const fallbackGeneration = coordinator.beginTransition();
  assert.equal(await coordinator.releaseNativeForFallback(
    fallbackGeneration,
    async () => {
      operations.push("native-stop-for-fallback");
      nativeActive = false;
    },
  ), true);
  assert.equal(nativeActive, false);
  assert.equal(coordinator.hasFallbackOwnership(fallbackGeneration), true);
  assert.equal(coordinator.markFallbackReady(fallbackGeneration), true);

  const normalRequest = ["unknown", "native-core"];
  assert.equal(shouldForceJsFallbackValidation(normalRequest), false);
  const resumedNativeGeneration = coordinator.beginTransition();
  assert.equal(coordinator.hasFallbackOwnership(fallbackGeneration), false);
  assert.equal(await coordinator.startNativeSession(
    resumedNativeGeneration,
    async () => {
      assert.equal(coordinator.hasFallbackOwnership(fallbackGeneration), false);
      operations.push("native-start-2");
      nativeActive = true;
    },
    async () => {
      operations.push("native-cleanup-2");
      nativeActive = false;
    },
  ), true);
  assert.equal(nativeActive, true);
  assert.deepEqual(operations, [
    "native-start-1",
    "native-stop-for-fallback",
    "native-start-2",
  ]);
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

test("superseded speech preserves one shared voice-recognition rearm debt", () => {
  const {
    beginVoiceRecognitionRearm,
    cancelVoiceRecognitionRearm,
    createVoiceRecognitionRearmState,
    finishVoiceRecognitionRearm,
    markVoiceRecognitionRearmNeeded,
  } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const stateRef = {
    current: createVoiceRecognitionRearmState(),
  };

  markVoiceRecognitionRearmNeeded(stateRef);
  const replacementResponseRearm = beginVoiceRecognitionRearm(stateRef);
  assert.equal(typeof replacementResponseRearm, "number");
  assert.equal(beginVoiceRecognitionRearm(stateRef), null);

  assert.equal(
    finishVoiceRecognitionRearm(
      stateRef,
      replacementResponseRearm,
      false,
    ),
    true,
  );
  const retry = beginVoiceRecognitionRearm(stateRef);
  assert.equal(typeof retry, "number");

  cancelVoiceRecognitionRearm(stateRef);
  assert.equal(
    finishVoiceRecognitionRearm(stateRef, retry, false),
    false,
  );
  assert.equal(beginVoiceRecognitionRearm(stateRef), null);
});

test("a keep-listening superseder drains the shared rearm debt exactly once", async () => {
  const {
    createVoiceRecognitionRearmState,
    drainVoiceRecognitionRearm,
    markVoiceRecognitionRearmNeeded,
  } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const stateRef = {
    current: createVoiceRecognitionRearmState(),
  };
  const promiseRef = { current: null };
  let releaseStart;
  const startGate = new Promise((resolve) => {
    releaseStart = resolve;
  });
  let startCalls = 0;

  markVoiceRecognitionRearmNeeded(stateRef);
  const interruptedResponseRearm = drainVoiceRecognitionRearm({
    isListeningReady: () => false,
    promiseRef,
    start: async () => {
      startCalls += 1;
      await startGate;
      return true;
    },
    stateRef,
  });
  const keepListeningSupersederRearm = drainVoiceRecognitionRearm({
    isListeningReady: () => false,
    promiseRef,
    start: async () => {
      startCalls += 1;
      return true;
    },
    stateRef,
  });

  assert.equal(startCalls, 1);
  assert.equal(stateRef.current.inFlight, true);
  releaseStart();
  assert.equal(await interruptedResponseRearm, true);
  assert.equal(await keepListeningSupersederRearm, true);
  assert.equal(startCalls, 1);
  assert.equal(stateRef.current.inFlight, false);
  assert.equal(stateRef.current.needed, false);
  assert.equal(promiseRef.current, null);
});

test("failed shared rearm remains debt and cannot report STOP listening ready", async () => {
  const {
    createVoiceRecognitionRearmState,
    drainVoiceRecognitionRearm,
    markVoiceRecognitionRearmNeeded,
  } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const stateRef = {
    current: createVoiceRecognitionRearmState(),
  };
  const promiseRef = { current: null };
  markVoiceRecognitionRearmNeeded(stateRef);

  assert.equal(await drainVoiceRecognitionRearm({
    isListeningReady: () => false,
    promiseRef,
    start: async () => false,
    stateRef,
  }), false);
  assert.equal(stateRef.current.inFlight, false);
  assert.equal(stateRef.current.needed, true);
});

test("screen-reader speech invalidation drains shared rearm debt and stale speech cannot clear a newer guard", async () => {
  const {
    createVoiceRecognitionRearmState,
    drainVoiceRecognitionRearm,
    markVoiceRecognitionRearmNeeded,
  } = loadTsModule(
    new URL("../src/lib/ownedVoiceSession.ts", import.meta.url),
  );
  const { isSpeechTransitionCurrent } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const stateRef = {
    current: createVoiceRecognitionRearmState(),
  };
  const promiseRef = { current: null };
  let startCalls = 0;
  let currentSpeechGeneration = 7;
  const invalidatedSpeechGeneration = currentSpeechGeneration;

  markVoiceRecognitionRearmNeeded(stateRef);
  assert.equal(await drainVoiceRecognitionRearm({
    isListeningReady: () => false,
    promiseRef,
    start: async () => {
      startCalls += 1;
      return true;
    },
    stateRef,
  }), true);
  assert.equal(startCalls, 1);
  assert.equal(stateRef.current.needed, false);

  currentSpeechGeneration += 1;
  let newerSpeechGuardActive = true;
  if (isSpeechTransitionCurrent({
    currentGeneration: currentSpeechGeneration,
    expectedGeneration: invalidatedSpeechGeneration,
    focused: true,
    ownerMatches: true,
  })) {
    newerSpeechGuardActive = false;
  }
  assert.equal(newerSpeechGuardActive, true);
});

test("recovery exhaustion surfaces once after an earlier event paused guidance", () => {
  const { shouldSurfaceRecoveryTransition } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );

  assert.equal(shouldSurfaceRecoveryTransition({
    exhaustedAlreadyHandled: false,
    focused: true,
    guidanceActive: true,
    recoveryGateActive: false,
    recoveryState: "recovering",
    transitionReady: true,
  }), true);
  assert.equal(shouldSurfaceRecoveryTransition({
    exhaustedAlreadyHandled: false,
    focused: true,
    guidanceActive: false,
    recoveryGateActive: true,
    recoveryState: "exhausted",
    transitionReady: false,
  }), true);
  assert.equal(shouldSurfaceRecoveryTransition({
    exhaustedAlreadyHandled: true,
    focused: true,
    guidanceActive: false,
    recoveryGateActive: true,
    recoveryState: "exhausted",
    transitionReady: false,
  }), false);
});

test("recovery camera shutdown requires bounded stop completion and observed native inactivity", () => {
  const { resolveRecoveryCameraShutdownTruth } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );

  assert.equal(resolveRecoveryCameraShutdownTruth({
    nativeSessionActive: false,
    stateReadCompleted: true,
    stopCompleted: true,
  }), true);
  for (const unsafeObservation of [
    {
      nativeSessionActive: true,
      stateReadCompleted: true,
      stopCompleted: true,
    },
    {
      nativeSessionActive: false,
      stateReadCompleted: false,
      stopCompleted: true,
    },
    {
      nativeSessionActive: false,
      stateReadCompleted: true,
      stopCompleted: false,
    },
  ]) {
    assert.equal(resolveRecoveryCameraShutdownTruth(unsafeObservation), false);
  }
});

test("rejected recovery shutdown still requires the critical spoken warning", async () => {
  const {
    resolveRecoveryCameraShutdownTruth,
    settleCurrentAnnouncementDelivery,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const effects = [];
  const shutdownConfirmed = resolveRecoveryCameraShutdownTruth({
    nativeSessionActive: true,
    stateReadCompleted: true,
    stopCompleted: false,
  });
  const message = shutdownConfirmed
    ? "Camera recovery paused."
    : "Stop. Guidance remains paused. Shutdown could not be confirmed. Close Guide Pup before moving.";

  const outcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      effects.push(["spoken", message]);
    },
    interrupt: async () => {
      effects.push(["interrupted"]);
    },
    isCurrent: () => true,
  });

  assert.equal(shutdownConfirmed, false);
  assert.equal(outcome, "completed");
  assert.deepEqual(effects, [["spoken", message]]);
  assert.match(message, /^Stop\./);
  assert.match(message, /Close Guide Pup before moving\./);
});

test("rejected route teardown records fail-closed truth and cannot authorize restart", () => {
  const { resolveRouteTeardownShutdownTruth } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const teardownConfirmed = resolveRouteTeardownShutdownTruth({
    announcementOwnerReleased: false,
    cameraShutdownConfirmed: false,
    voiceSessionStopped: false,
  });
  const routeState = {
    cameraRecoveryGateActive: true,
    focused: false,
    runtimeSafetyHold: true,
    voiceRecoveryGateActive: true,
  };
  const canRestartCamera =
    teardownConfirmed
    && routeState.focused
    && !routeState.cameraRecoveryGateActive
    && !routeState.runtimeSafetyHold;
  const canRestartListener =
    teardownConfirmed
    && routeState.focused
    && !routeState.voiceRecoveryGateActive
    && !routeState.runtimeSafetyHold;

  assert.equal(teardownConfirmed, false);
  assert.equal(canRestartCamera, false);
  assert.equal(canRestartListener, false);
});

test("failed prior-speech cancellation prevents replacement channel delivery", async () => {
  const { settlePriorSpeechChannels } = loadTsModule(
    new URL("../src/lib/runtimeSafety.ts", import.meta.url),
  );
  const effects = [];
  const previousSpeechStopped = await settlePriorSpeechChannels({
    isCurrent: () => true,
    operations: [
      {
        name: "native speech stop",
        stop: async () => {
          effects.push("native-stop-attempt");
          throw new Error("simulated native speech cancellation failure");
        },
      },
      {
        name: "VoiceOver announcement stop",
        stop: async () => {
          effects.push("voiceover-stop-attempt");
        },
      },
    ],
    timeoutMs: 100,
  });
  if (previousSpeechStopped) {
    effects.push("replacement-delivery-started");
  }

  assert.equal(previousSpeechStopped, false);
  assert.deepEqual(effects, [
    "native-stop-attempt",
    "voiceover-stop-attempt",
  ]);
});

test("retained STOP hold recovery instructions remain paused and are announced", async () => {
  const {
    planVoiceRecoveryCompletion,
    settleCurrentAnnouncementDelivery,
    shouldSuspendVoiceRecognitionForSpeech,
  } = loadTsModule(new URL("../src/lib/runtimeSafety.ts", import.meta.url));
  const recoveryPlan = planVoiceRecoveryCompletion({
    stopSafetyFailureHold: true,
    touchStopFailureHold: false,
  });
  const announcements = [];

  const outcome = await settleCurrentAnnouncementDelivery({
    deliver: async () => {
      announcements.push(recoveryPlan.detail);
    },
    interrupt: async () => undefined,
    isCurrent: () => recoveryPlan.runtimeSafetyHold,
  });

  assert.equal(recoveryPlan.guidanceActive, false);
  assert.equal(recoveryPlan.runtimeSafetyHold, true);
  assert.equal(shouldSuspendVoiceRecognitionForSpeech({
    keepListeningDuringSpeech: true,
    listening: true,
    ownedSession: true,
  }), false);
  assert.equal(outcome, "completed");
  assert.deepEqual(announcements, [
    "Voice control recovered, but STOP safety is still unconfirmed. Say stop guidance again or double tap Return Home to retry.",
  ]);
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
      ["./clientDiagnostics", {
        addBreadcrumb: (event) => breadcrumbs.push(event),
        setDiagnosticTag: () => undefined,
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
    ["@/src/lib/clientDiagnostics", { captureAppError: () => undefined }],
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
