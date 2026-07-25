import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const plist = require("@expo/plist").default;
const ts = require("typescript");
const navigationCorePath = fileURLToPath(new URL("../src/native/GuidePupNavigationCore.ts", import.meta.url));
const navigationCoreSource = readFileSync(navigationCorePath, "utf8");
const privacySanitizerPath = fileURLToPath(new URL("../src/lib/privacySanitizer.ts", import.meta.url));
const privacySanitizerSource = readFileSync(privacySanitizerPath, "utf8");

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ");
}

function loadTsModule(relativePath) {
  const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url));
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const module = { exports: {} };

  vm.runInNewContext(compiled.outputText, {
    exports: module.exports,
    module,
    require,
  }, { filename: sourcePath });

  return module.exports;
}

function loadPrivacySanitizer() {
  const compiled = ts.transpileModule(privacySanitizerSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: privacySanitizerPath,
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(compiled, {
    Date,
    Error,
    Number,
    Object,
    URL,
    WeakSet,
    exports: module.exports,
    module,
  }, { filename: privacySanitizerPath });

  return module.exports;
}

test("privacy sanitizer redacts secret-shaped strings, media, URLs, and local paths", () => {
  const { sanitizePrivacyString } = loadPrivacySanitizer();
  const fixtures = [
    "Authorization: Bearer fake-bearer-token-0123456789",
    "JWT eyJmYWtlSGVhZA.eyJmYWtlUGF5bG9hZA.fakeSignature123",
    "provider key sk-proj-fakefakefakefake1234",
    "password=fake-password-value",
    "https://fake-user:fake-pass@example.invalid/frame.jpg?X-Amz-Signature=fake-signature",
    "data:image/jpeg;base64,ZmFrZS1pbWFnZS1ieXRlcy1vbmx5",
    "file:///private/var/mobile/fake-frame.jpg",
    "content://camera/fake-frame/1",
    "failure at /Users/example/Library/fake-frame.jpg",
    `encoded ${"A".repeat(120)}`,
  ];
  const sanitized = fixtures.map((fixture) => sanitizePrivacyString(fixture)).join("\n");

  for (const forbidden of [
    "fake-bearer-token",
    "eyJmYWtlSGVhZA",
    "sk-proj-fakefake",
    "fake-password-value",
    "fake-pass",
    "fake-signature",
    "ZmFrZS1pbWFnZS1ieXRlcy1vbmx5",
    "file://",
    "content://",
    "/Users/example",
    "A".repeat(80),
  ]) {
    assert.doesNotMatch(sanitized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(sanitized, /\[redacted/);
});

test("privacy sanitizer recursively bounds collections, depth, cycles, keys, and strings", () => {
  const { sanitizePrivacyValue } = loadPrivacySanitizer();
  const cyclic = { label: "safe" };
  cyclic.self = cyclic;
  const manyKeys = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`field${index}`, index]));
  const result = sanitizePrivacyValue({
    apiKey: "fake-key-that-must-not-survive",
    array: Array.from({ length: 25 }, (_, index) => index),
    cyclic,
    deep: { one: { two: { three: { four: "hidden" } } } },
    long: `safe-prefix-${"ordinary text. ".repeat(60)}`,
    manyKeys,
    nested: { authorization: "fake-authorization-value" },
  });
  const plain = JSON.parse(JSON.stringify(result));
  const serialized = JSON.stringify(plain);

  assert.equal(plain.apiKey, "[redacted]");
  assert.equal(plain.nested.authorization, "[redacted]");
  assert.equal(plain.array.length, 21);
  assert.match(plain.array.at(-1), /items omitted/);
  assert.equal(plain.cyclic.self, "[circular]");
  assert.equal(plain.deep.one.two.three, "[bounded]");
  assert.match(plain.long, /\[truncated\]$/);
  assert.ok(plain.long.length <= 511);
  assert.equal(plain.manyKeys["[omitted keys]"], 5);
  assert.doesNotMatch(serialized, /fake-key|fake-authorization|hidden/);
});

test("Sentry integration sanitizes every approved event surface and captures a new safe Error", () => {
  const source = read("../src/lib/sentry.ts");

  assert.match(source, /import \{ sanitizePrivacyString, sanitizePrivacyValue \} from "\.\/privacySanitizer"/);
  assert.match(source, /event\.message = sanitizePrivacyString\(event\.message\)/);
  assert.match(source, /event\.logentry\.params = sanitizePrivacyValue\(event\.logentry\.params\)/);
  assert.match(source, /value: exception\.value \? sanitizePrivacyString\(exception\.value\)/);
  assert.match(source, /abs_path: frame\.abs_path \? sanitizePrivacyString\(frame\.abs_path\)/);
  assert.match(source, /filename: frame\.filename \? sanitizePrivacyString\(frame\.filename\)/);
  assert.match(source, /event\.breadcrumbs = event\.breadcrumbs\.map/);
  assert.match(source, /event\.tags = sanitizePrivacyValue\(event\.tags\)/);
  assert.match(source, /event\.extra = sanitizePrivacyValue\(event\.extra\)/);
  assert.match(source, /event\.contexts = sanitizePrivacyValue\(event\.contexts\)/);
  assert.match(source, /event\.transaction = sanitizePrivacyString\(event\.transaction\)/);
  assert.match(source, /event\.spans = event\.spans\.map\(\(span\) => sanitizeSpan\(span\)\)/);
  assert.match(source, /delete event\.user/);
  assert.match(source, /delete event\.server_name/);
  for (const field of ["headers", "data", "cookies", "query", "query_string", "env", "fragment"]) {
    assert.match(source, new RegExp(`delete request\\.${field}`));
  }
  assert.match(source, /beforeSend\(event\) \{\s*return sanitizeEvent\(event\)/);
  assert.match(source, /beforeSendSpan\(span\) \{\s*return sanitizeSpan\(span\)/);
  assert.match(source, /beforeSendTransaction\(event\) \{\s*return sanitizeEvent\(event\)/);
  assert.match(source, /category: breadcrumb\.category \? sanitizePrivacyString\(breadcrumb\.category\)/);
  assert.match(source, /message: breadcrumb\.message \? sanitizePrivacyString\(breadcrumb\.message\)/);
  assert.match(source, /type: breadcrumb\.type \? sanitizePrivacyString\(breadcrumb\.type\)/);
  assert.match(source, /Sentry\.setTag\(sanitizePrivacyString\(key\), sanitizePrivacyString\(String\(value\)\)\)/);
  assert.match(source, /const sanitizedError = new Error\(sanitizedMessage\)/);
  assert.match(source, /Sentry\.captureException\(sanitizedError\)/);
  assert.doesNotMatch(source, /Sentry\.captureException\(error\)/);
  assert.match(source, /console\.error\("\[GuidePupError\]", \{\s*context: sanitizedContext,\s*message: sanitizedMessage/);
});

test("native manifest, in-app summary, and public privacy policy disclose the same launch data classes", () => {
  const manifest = plist.parse(read("../ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy"));
  const collectedEntries = manifest.NSPrivacyCollectedDataTypes;
  const collectedTypes = new Set(
    collectedEntries.map((entry) => entry.NSPrivacyCollectedDataType),
  );
  assert.deepEqual(
    collectedTypes,
    new Set([
      "NSPrivacyCollectedDataTypeAudioData",
      "NSPrivacyCollectedDataTypeDeviceID",
      "NSPrivacyCollectedDataTypeEnvironmentScanning",
      "NSPrivacyCollectedDataTypeOtherDiagnosticData",
      "NSPrivacyCollectedDataTypePerformanceData",
      "NSPrivacyCollectedDataTypePhotosorVideos",
      "NSPrivacyCollectedDataTypeProductInteraction",
    ]),
  );
  const environmentScanningEntry = collectedEntries.find(
      (entry) => entry.NSPrivacyCollectedDataType === "NSPrivacyCollectedDataTypeEnvironmentScanning",
    );
  assert.ok(environmentScanningEntry);
  assert.deepEqual(
    { ...environmentScanningEntry },
    {
      NSPrivacyCollectedDataType: "NSPrivacyCollectedDataTypeEnvironmentScanning",
      NSPrivacyCollectedDataTypeLinked: true,
      NSPrivacyCollectedDataTypePurposes: [
        "NSPrivacyCollectedDataTypePurposeAppFunctionality",
        "NSPrivacyCollectedDataTypePurposeAnalytics",
      ],
      NSPrivacyCollectedDataTypeTracking: false,
    },
  );

  const inAppSummary = normalizeWhitespace(read("../src/screens/InfoScreen.tsx"));
  for (const disclosure of [
    "sampled compressed camera frames",
    "installation-scoped bootstrap token",
    "Apple speech recognition may process voice audio",
    "Derived guidance results such as confidence, direction, and hazard level support service-quality analytics, not tracking",
    "does not intentionally log raw camera frames, raw voice audio, credentials, signed URLs, or installation identifiers",
  ]) {
    assert.match(inAppSummary, new RegExp(disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  const publicPolicy = normalizeWhitespace(read("../../site/privacy/index.html"));
  for (const disclosure of [
    "sampled camera frames",
    "image-derived environment-scanning data",
    "voice audio used for Apple speech recognition",
    "installation-scoped device identifier",
    "product interactions, request identifiers",
    "latency and performance measurements",
    "sanitized errors",
    "environment-scanning data supports that app functionality and service-quality analytics; it is not used for tracking",
    "iOS Keychain values may persist after the app is uninstalled",
    "request deletion by emailing charliehan112@gmail.com",
  ]) {
    assert.match(publicPolicy, new RegExp(disclosure.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(publicPolicy, /uninstalling Guide Pup removes (?:its )?(?:local )?identifier/i);
  assert.doesNotMatch(publicPolicy, /identifier and session token[^.]*until[^.]*app is uninstalled/i);

  const privacyMatrix = normalizeWhitespace(read("../docs/privacy-answer-matrix.md"));
  assert.match(privacyMatrix, /SecureStore uses the iOS Keychain, so these values may persist after uninstall/i);
  assert.match(privacyMatrix, /request deletion by emailing `charliehan112@gmail\.com`/i);
  assert.doesNotMatch(privacyMatrix, /uninstall[^.]*deletes?[^.]*installation/i);
});

test("native speech prefers on-device recognition without removing service fallback", () => {
  const source = read("../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift");
  const navigationSource = read("../src/screens/NavigationScreen.tsx");

  assert.match(
    source,
    /if recognizer\.supportsOnDeviceRecognition \{\s*request\.requiresOnDeviceRecognition = true\s*\}/,
  );
  assert.doesNotMatch(source, /requiresOnDeviceRecognition\s*=\s*false/);
  assert.doesNotMatch(source, /guard recognizer\.supportsOnDeviceRecognition/);
  assert.match(source, /self\.activePartialResults = partialResults/);
  assert.match(source, /request\.shouldReportPartialResults = activePartialResults/);
  assert.match(source, /"isFinal": result\.isFinal/);
  assert.match(source, /if result\?\.isFinal == true \{[\s\S]*self\?\.restartListeningAfterFinalIfNeeded\(\)/);
  assert.match(
    source,
    /guard\s+commandSessionDesired,\s+listening,\s+appActive,\s+!audioSessionInterrupted,\s+!restartingAfterFinal\s+else/,
  );
  assert.match(navigationSource, /partialResults:\s*true/);
  assert.match(
    navigationSource,
    /isStopBargeInCommand\(normalizedTranscript\)[\s\S]*handleVoiceStopCommand\(\{/,
  );
});

test("shipping permission and App Review copy disclose Apple Speech and cloud vision processing", () => {
  const appJson = JSON.parse(read("../app.json"));
  const infoPlist = plist.parse(read("../ios/GuidePupVisionAssistant/Info.plist"));
  const { appReviewCommandSequence, launchInputs } = require("../release/launch-inputs.js");
  const voiceCommands = loadTsModule("../src/lib/voiceCommands.ts");
  const voiceConversation = loadTsModule("../src/lib/voiceConversation.ts");
  const speechPermission = appJson.expo.ios.infoPlist.NSSpeechRecognitionUsageDescription;

  assert.match(launchInputs.appReviewNotes, /^Cold launch Guide Pup\./);
  assert.match(
    launchInputs.appReviewNotes,
    /complete the three onboarding screens by activating Continue, Continue, then Start using Guide Pup/i,
  );
  assert.match(launchInputs.appReviewNotes, /Guide Pup does not require account sign-in/i);
  assert.match(launchInputs.appReviewNotes, /On Home, wait for the spoken ready prompt/i);
  assert.match(
    launchInputs.appReviewNotes,
    /Allow microphone and speech-recognition access when iOS requests them[\s\S]*success cue indicating listening is ready[\s\S]*say 'start guidance'/i,
  );
  assert.match(
    launchInputs.appReviewNotes,
    /say 'start guidance'[\s\S]*Allow camera access when iOS requests it[\s\S]*spoken camera-ready prompt and its success cue[\s\S]*say 'status'/i,
  );
  assert.equal(
    launchInputs.appReviewNotes.match(/'start guidance'/gi)?.length,
    1,
    "The canonical cold-start script must say start guidance exactly once.",
  );
  assert.equal(infoPlist.NSSpeechRecognitionUsageDescription, speechPermission);
  assert.match(speechPermission, /preferred on-device when available/i);
  assert.match(speechPermission, /processed by Apple/i);
  assert.doesNotMatch(speechPermission, /parsed on-device/i);

  for (const disclosure of [
    /sampled compressed camera frames/i,
    /Cloudflare backend/i,
    /OpenAI vision provider/i,
    /Apple service processing/i,
    /up to 7 days/i,
    /up to 30 days/i,
    /deterministic command lane/i,
    /assistive vision and navigation aid/i,
    /does not guarantee hazard detection or emergency response/i,
  ]) {
    assert.match(launchInputs.appReviewNotes, disclosure);
  }

  for (const step of appReviewCommandSequence) {
    assert.match(launchInputs.appReviewNotes, new RegExp(`'${step.spokenPhrase}'`));
    if (step.expectedLane === "voice-command") {
      assert.equal(voiceCommands.parseVoiceCommand(step.spokenPhrase), step.expectedIntent);
      assert.equal(voiceConversation.parseConversationPrompt(step.spokenPhrase), null);
    } else {
      assert.equal(step.expectedLane, "conversation");
      assert.equal(voiceCommands.parseVoiceCommand(step.spokenPhrase), null);
      assert.equal(voiceConversation.parseConversationPrompt(step.spokenPhrase), step.expectedIntent);
    }
  }

  const duringSpeechSteps = appReviewCommandSequence.filter((step) => step.duringSpeech);
  assert.deepEqual(
    duringSpeechSteps.map((step) => step.spokenPhrase),
    ["STOP"],
  );
  const finalStep = appReviewCommandSequence.at(-1);
  assert.equal(finalStep.expectedIntent, "stop-guidance");
  assert.equal(finalStep.duringSpeech, true);
  assert.equal(voiceCommands.isStopBargeInCommand(finalStep.spokenPhrase), true);
  assert.match(launchInputs.appReviewNotes, /then say 'STOP' while speech is playing/);
  assert.match(
    launchInputs.appReviewNotes,
    /voice STOP[\s\S]*does not return Home[\s\S]*Use VoiceOver to activate the on-screen Return Home control[\s\S]*before opening Settings/i,
  );
  assert.doesNotMatch(launchInputs.appReviewNotes, /on-screen Stop guidance control/i);
  assert.match(
    launchInputs.appReviewNotes,
    /Open Settings, then choose Backup camera check \(the camera fallback check\)/,
  );
  assert.match(
    launchInputs.appReviewNotes,
    /repeat the same ordered sequence[\s\S]*including 'STOP' while speech is playing/i,
  );
});

test("checked-in reviewer notes and screenshot plan remain launch-safe", () => {
  const { appReviewCommandSequence, launchInputs } = require("../release/launch-inputs.js");
  const reviewNotes = read("../docs/app-review-notes.md");
  const screenshotPlan = read("../docs/screenshot-shotlist.md");
  const launchPhaseReport = read("../../docs/phase-launch1-internal-testflight-smoke.md");
  const qualityReport = read("../../docs/phase-quality1-guidance-reliability.md");
  const runtimePhaseReport = read("../../docs/phase-runtime1-real-device-blind-validation.md");
  const noScreenSection = reviewNotes
    .split("## No-Screen Review Sequence")[1]
    .split("\n## ")[0];
  const renderedSequence = Array.from(noScreenSection.matchAll(/^\d+\..*?`([^`]+)`/gm), (match) => match[1]);
  const renderedCanonicalNotes = reviewNotes
    .split("<!-- APP_REVIEW_NOTES_START -->")[1]
    .split("<!-- APP_REVIEW_NOTES_END -->")[0]
    .trim();

  assert.match(reviewNotes, /does not guarantee hazard detection or emergency response/i);
  assert.match(reviewNotes, /does not provide emergency response or an SOS action/i);
  assert.match(reviewNotes, /No-Screen Review Sequence/);
  assert.match(reviewNotes, /Cold launch Guide Pup/);
  assert.match(reviewNotes, /complete the three onboarding screens by activating `Continue`, `Continue`, then `Start using Guide Pup`/i);
  assert.match(reviewNotes, /Guide Pup does not require account sign-in/i);
  assert.match(reviewNotes, /On Home, wait for the spoken ready prompt/i);
  assert.match(reviewNotes, /Allow microphone and speech-recognition access when iOS requests them/i);
  assert.match(reviewNotes, /Allow camera access when iOS requests it/i);
  assert.match(reviewNotes, /success cue indicating listening is ready/i);
  assert.match(reviewNotes, /spoken camera-ready prompt and its success cue/i);
  assert.match(
    noScreenSection,
    /success cue indicating listening is ready[\s\S]*Say `start guidance`[\s\S]*Allow camera access[\s\S]*spoken camera-ready prompt and its success cue[\s\S]*Say `status`/i,
  );
  assert.match(reviewNotes, /While spoken guidance is playing, say `STOP`/);
  assert.match(
    reviewNotes,
    /voice STOP[\s\S]*does not return Home[\s\S]*VoiceOver[\s\S]*on-screen `Return Home` control[\s\S]*before opening Settings/i,
  );
  assert.doesNotMatch(reviewNotes, /on-screen `Stop guidance` control/i);
  assert.match(reviewNotes, /Settings > Backup camera check/);
  assert.match(reviewNotes, /repeat the same ordered sequence/i);
  assert.doesNotMatch(reviewNotes, /listening cue/i);
  assert.match(reviewNotes, /Do not state that physical-device or VoiceOver validation has passed/);
  assert.deepEqual(renderedSequence, appReviewCommandSequence.map((step) => step.spokenPhrase));
  assert.equal(normalizeWhitespace(renderedCanonicalNotes), normalizeWhitespace(launchInputs.appReviewNotes));

  assert.match(screenshotPlan, /authenticated read-only observation on 2026-07-24/i);
  assert.match(screenshotPlan, /6\.5-inch Display/i);
  assert.match(screenshotPlan, /0\/10 screenshots/i);
  assert.match(screenshotPlan, /`1242 x 2688` or `1284 x 2778`/i);
  assert.match(screenshotPlan, /Prefer direct capture at `1284 x 2778`/i);
  assert.match(screenshotPlan, /final authenticated App Store Connect recheck/i);
  assert.doesNotMatch(screenshotPlan, /1320 x 2868|planned 6\.9-inch/i);
  assert.match(screenshotPlan, /The first screen with `Start Guidance` visible and no permission sheet/);
  assert.match(screenshotPlan, /consented, staged empty indoor path with no people or private text/);
  assert.match(screenshotPlan, /real `Guidance active` state plus the current direction and message from a provider-backed result/);
  assert.match(screenshotPlan, /Spoken output by itself is not screenshot evidence/);
  assert.match(screenshotPlan, /Deliberately remove network access/);
  assert.match(screenshotPlan, /real `Backend unavailable` safe STOP state/);
  assert.match(screenshotPlan, /then restore network access\. Do not mock/);
  assert.match(screenshotPlan, /`Speech`, `Descriptions`, and `Haptics` visible\. No Bounding boxes control is present/);
  assert.match(screenshotPlan, /assistive-only limitation and emergency disclaimer visible/);
  assert.match(screenshotPlan, /Do not show raw camera content/);
  assert.match(screenshotPlan, /Do not mock guidance, failures, banners, directions, or messages/);
  assert.match(screenshotPlan, /does not claim that screenshots have been uploaded or that accessibility validation is complete/);

  assert.match(launchPhaseReport, /authenticated read-only observation on 2026-07-24/i);
  assert.match(launchPhaseReport, /6\.5-inch Display/i);
  assert.match(launchPhaseReport, /0\/10 screenshots/i);
  assert.match(launchPhaseReport, /`1242 x 2688` or `1284 x 2778`/i);
  assert.match(launchPhaseReport, /prefer direct capture at `1284 x 2778`/i);
  assert.match(launchPhaseReport, /final authenticated recheck before upload/i);
  assert.match(launchPhaseReport, /No current build is selected/i);
  assert.match(launchPhaseReport, /App Review Notes are stale/i);
  assert.doesNotMatch(launchPhaseReport, /accepted `1320x2868`/i);

  assert.match(qualityReport, /earlier provider smoke at `3cc852c` is superseded historical proof only/i);
  assert.match(qualityReport, /not current exact-revision evidence/i);
  assert.match(qualityReport, /iOS runtime safety `85\/85`/i);
  assert.doesNotMatch(qualityReport, /iOS runtime safety `(?:61|63|65|70|71|77|81)\/(?:61|63|65|70|71|77|81)`/i);
  assert.match(runtimePhaseReport, /iOS runtime safety `85\/85`/i);
  assert.doesNotMatch(runtimePhaseReport, /iOS runtime safety `(?:61|63|65|70|71|77|81)\/(?:61|63|65|70|71|77|81)`/i);
});

function loadNavigationCore({ manipulateAsync, deleteFile } = {}) {
  const compiled = ts.transpileModule(navigationCoreSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: navigationCorePath,
  }).outputText;
  const deletedUris = [];
  const module = { exports: {} };

  class MockFile {
    constructor(uri) {
      this.uri = uri;
      this.exists = true;
    }

    delete() {
      deletedUris.push(this.uri);
      deleteFile?.(this.uri);
    }
  }

  const runtimeRequire = (specifier) => {
    if (specifier === "expo") {
      return { requireOptionalNativeModule: () => null };
    }
    if (specifier === "expo-file-system") {
      return { File: MockFile };
    }
    if (specifier === "expo-haptics") {
      return {
        ImpactFeedbackStyle: { Heavy: "heavy", Light: "light", Medium: "medium" },
        NotificationFeedbackType: { Error: "error", Success: "success" },
        impactAsync: async () => {},
        notificationAsync: async () => {},
      };
    }
    if (specifier === "expo-image-manipulator") {
      return {
        SaveFormat: { JPEG: "jpeg" },
        manipulateAsync: manipulateAsync ?? (async () => {
          throw new Error("Unexpected image manipulation call.");
        }),
      };
    }
    if (specifier === "react-native") {
      return {
        AccessibilityInfo: { announceForAccessibility: async () => {}, isScreenReaderEnabled: async () => false },
        Platform: { OS: "ios" },
      };
    }
    if (specifier === "@/src/lib/diagnostics") {
      return { recordAudioCueSnapshot: () => {}, recordHapticSnapshot: () => {} };
    }
    return require(specifier);
  };

  vm.runInNewContext(compiled, {
    Date,
    Error,
    Number,
    Set,
    console,
    exports: module.exports,
    module,
    require: runtimeRequire,
  }, { filename: navigationCorePath });

  return { core: module.exports.GuidePupNavigationCore, deletedUris };
}

function cameraReturning(photo) {
  return {
    takePictureAsync: async (options) => {
      assert.deepEqual(
        { base64: options.base64, skipProcessing: options.skipProcessing },
        { base64: true, skipProcessing: true },
      );
      return photo;
    },
  };
}

test("JS fallback bounds the longest edge and returns base64 without a URI", async () => {
  const cases = [
    {
      expectedActions: [{ resize: { height: 768 } }],
      input: { height: 1400, uri: "file:///private/portrait.jpg", width: 700 },
      output: { base64: "portrait-data", height: 768, uri: "file:///private/portrait-output.jpg", width: 384 },
    },
    {
      expectedActions: [{ resize: { width: 768 } }],
      input: { height: 700, uri: "file:///private/landscape.jpg", width: 1400 },
      output: { base64: "landscape-data", height: 384, uri: "file:///private/landscape-output.jpg", width: 768 },
    },
    {
      expectedActions: [{ resize: { width: 768 } }],
      input: { height: 1000, uri: "file:///private/square.jpg", width: 1000 },
      output: { base64: "square-data", height: 768, uri: "file:///private/square-output.jpg", width: 768 },
    },
    {
      expectedActions: [],
      input: { height: 640, uri: "file:///private/small.jpg", width: 480 },
      output: { base64: "small-data", height: 640, uri: "file:///private/small-output.jpg", width: 480 },
    },
  ];

  for (const fixture of cases) {
    const manipulationCalls = [];
    const { core, deletedUris } = loadNavigationCore({
      manipulateAsync: async (uri, actions, options) => {
        manipulationCalls.push({ actions, options, uri });
        return fixture.output;
      },
    });
    const result = await core.captureFrame({ cameraRef: cameraReturning(fixture.input), forceFallback: true });

    assert.deepEqual(
      JSON.parse(JSON.stringify(manipulationCalls.map((call) => call.actions))),
      [fixture.expectedActions],
    );
    assert.equal(manipulationCalls[0].options.base64, true);
    assert.equal(result.base64, fixture.output.base64);
    assert.equal(result.height, fixture.output.height);
    assert.equal(result.width, fixture.output.width);
    assert.equal("uri" in result, false);
    assert.deepEqual(new Set(deletedUris), new Set([fixture.output.uri, fixture.input.uri]));
  }
});

test("JS fallback cleans local files on manipulation failure and exposes only a bounded error", async () => {
  const secretPath = "file:///private/var/mobile/secret-frame.jpg";
  const { core, deletedUris } = loadNavigationCore({
    manipulateAsync: async () => {
      throw new Error(`Manipulator failed for ${secretPath}`);
    },
  });

  await assert.rejects(
    core.captureFrame({
      cameraRef: cameraReturning({ height: 1200, uri: secretPath, width: 600 }),
      forceFallback: true,
    }),
    (error) => {
      assert.equal(error.message, "Guide Pup could not capture a camera frame.");
      assert.doesNotMatch(error.message, /file:\/\/|private|secret-frame/);
      return true;
    },
  );
  assert.deepEqual(deletedUris, [secretPath]);
  assert.equal((await core.getState()).lastError, "Guide Pup could not capture a camera frame.");
});

test("JS fallback redacts raw camera errors", async () => {
  const { core } = loadNavigationCore();
  const cameraRef = {
    takePictureAsync: async () => {
      throw new Error("Camera failed at file:///private/raw-capture.jpg");
    },
  };

  await assert.rejects(
    core.captureFrame({ cameraRef, forceFallback: true }),
    { message: "Guide Pup could not capture a camera frame." },
  );
  assert.equal((await core.getState()).lastError, "Guide Pup could not capture a camera frame.");
});

test("JS fallback safely rejects missing base64 and cleans both local files", async () => {
  const inputUri = "file:///private/missing-input.jpg";
  const outputUri = "file:///private/missing-output.jpg";
  const { core, deletedUris } = loadNavigationCore({
    manipulateAsync: async () => ({ height: 600, uri: outputUri, width: 400 }),
  });

  await assert.rejects(
    core.captureFrame({
      cameraRef: cameraReturning({ height: 1200, uri: inputUri, width: 800 }),
      forceFallback: true,
    }),
    { message: "Guide Pup could not encode a camera frame." },
  );
  assert.deepEqual(new Set(deletedUris), new Set([inputUri, outputUri]));
});

test("JS fallback retries cleanup, reports a path-free warning, and sweeps on the next capture", async () => {
  const remoteUri = "content://camera/input/1";
  const localOutputUri = "file:///private/cleanup-fails.jpg";
  let cleanupFailuresRemaining = 2;
  const { core, deletedUris } = loadNavigationCore({
    deleteFile: (uri) => {
      if (uri === localOutputUri && cleanupFailuresRemaining > 0) {
        cleanupFailuresRemaining -= 1;
        throw new Error("Cleanup failed at file:///private/cleanup-fails.jpg");
      }
    },
    manipulateAsync: async () => ({ base64: "safe-data", height: 300, uri: localOutputUri, width: 500 }),
  });

  const firstResult = await core.captureFrame({
    cameraRef: cameraReturning({ height: 300, uri: remoteUri, width: 500 }),
    forceFallback: true,
  });
  assert.equal(firstResult.base64, "safe-data");
  assert.equal((await core.getState()).lastError, "Guide Pup could not remove a temporary camera frame.");
  assert.equal((await core.getState()).pendingFrameCleanupCount, 1);
  assert.doesNotMatch((await core.getState()).lastError, /file:\/\/|private|cleanup-fails/);

  const secondResult = await core.captureFrame({
    cameraRef: cameraReturning({ height: 300, uri: remoteUri, width: 500 }),
    forceFallback: true,
  });
  assert.equal(secondResult.base64, "safe-data");
  assert.equal((await core.getState()).lastError, null);
  assert.equal((await core.getState()).pendingFrameCleanupCount, 0);
  assert.equal(deletedUris.filter((uri) => uri === localOutputUri).length, 4);
  assert.equal(deletedUris.includes(remoteUri), false);
});

test("concurrent JS fallback captures keep frame results and cleanup independent", async () => {
  const { core, deletedUris } = loadNavigationCore({
    manipulateAsync: async (uri) => {
      await new Promise((resolve) => setTimeout(resolve, uri.includes("first") ? 15 : 1));
      const id = uri.includes("first") ? "first" : "second";
      return {
        base64: `${id}-data`,
        height: 384,
        uri: `file:///private/${id}-output.jpg`,
        width: 768,
      };
    },
  });

  const [first, second] = await Promise.all([
    core.captureFrame({
      cameraRef: cameraReturning({ height: 600, uri: "file:///private/first-input.jpg", width: 1200 }),
      forceFallback: true,
    }),
    core.captureFrame({
      cameraRef: cameraReturning({ height: 600, uri: "file:///private/second-input.jpg", width: 1200 }),
      forceFallback: true,
    }),
  ]);

  assert.equal(first.base64, "first-data");
  assert.equal(second.base64, "second-data");
  assert.deepEqual(
    new Set(deletedUris),
    new Set([
      "file:///private/first-input.jpg",
      "file:///private/first-output.jpg",
      "file:///private/second-input.jpg",
      "file:///private/second-output.jpg",
    ]),
  );
});
