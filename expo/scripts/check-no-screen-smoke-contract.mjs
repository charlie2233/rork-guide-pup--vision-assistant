import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

function loadTsModule(relativePath) {
  const sourcePath = fileURLToPath(new URL(relativePath, import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
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
  }, {
    filename: sourcePath,
  });

  return module.exports;
}

function mustInclude(source, pattern, label) {
  const found = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  assert.equal(found, true, `${label} is missing`);
}

function mustNotInclude(source, pattern, label) {
  const found = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  assert.equal(found, false, `${label} must not be present`);
}

const voiceCommands = loadTsModule("../src/lib/voiceCommands.ts");
const voiceConversation = loadTsModule("../src/lib/voiceConversation.ts");

const requiredSequence = [
  ["start guidance", "start-guidance"],
  ["status", "status"],
  ["slower speech", "slower-speech"],
  ["faster speech", "faster-speech"],
  ["more detail", "more-detail"],
  ["less detail", "less-detail"],
  ["haptics off", "haptics-off"],
  ["haptics on", "haptics-on"],
  ["repeat", "repeat"],
  ["stop guidance", "stop-guidance"],
];

for (const [transcript, expectedIntent] of requiredSequence) {
  assert.equal(
    voiceCommands.parseVoiceCommand(transcript),
    expectedIntent,
    `No-screen command "${transcript}" must stay in the deterministic command lane`,
  );
}

assert.equal(
  voiceCommands.parseVoiceCommand("what do you see"),
  null,
  "Scene questions must stay outside the deterministic command lane",
);
assert.equal(
  voiceConversation.parseConversationPrompt("what do you see"),
  "what-do-you-see",
  "Scene question must be handled by the conversation lane",
);
assert.equal(
  voiceConversation.parseConversationPrompt("describe the scene"),
  "what-do-you-see",
  "Scene-description alias must be handled by the conversation lane",
);
assert.equal(
  voiceConversation.parseConversationPrompt("please what do you see"),
  "what-do-you-see",
  "Polite scene question must be handled by the conversation lane",
);
assert.equal(
  voiceConversation.parseConversationPrompt("guide pup what do you see"),
  "what-do-you-see",
  "Wake-prefixed scene question must be handled by the conversation lane",
);
for (const transcript of [
  "do not describe the scene",
  "please do not answer what do you see",
  "I did not ask what do you see",
  "the phrase what do you see is printed here",
]) {
  assert.equal(
    voiceConversation.parseConversationPrompt(transcript),
    null,
    `Negated or ambient phrase "${transcript}" must not enter the conversation lane`,
  );
}

const navigationScreen = read("../src/screens/NavigationScreen.tsx");
const analyzeApi = read("../src/lib/api.ts");
const conversationLane = read("../src/lib/conversationLane.ts");
const visionAI = read("../src/logic/VisionAI.ts");
const guideAI = read("../src/logic/GuideAI.ts");
const cloudAnalyzePath = guideAI.slice(
  guideAI.indexOf("async analyzeWithVision("),
  guideAI.indexOf("async getNextDirection("),
);
mustInclude(navigationScreen, "conversationIntent === \"what-do-you-see\"", "Conversation-lane route");
mustInclude(navigationScreen, "Guidance settings are unchanged", "Scene-query non-mutation confirmation");
mustInclude(navigationScreen, "interactionMode: mode", "Conversation mode reaches GuideAI");
mustInclude(navigationScreen, "updateNavigationMemory: mode === \"guidance\"", "Conversation lane does not mutate navigation smoothing memory");
mustInclude(navigationScreen, "priorGuidance: lastGuidanceMessageRef.current", "Scene answers stay out of guidance context memory");
mustInclude(navigationScreen, "if (mode === \"guidance\")", "Scene answers do not overwrite guidance context memory");
mustInclude(navigationScreen, "planVisionLaneResult", "Vision results use the behaviorally tested lane boundary");
mustInclude(navigationScreen, "isStopBargeInCommand(normalizedTranscript)", "Partial STOP cut-through");
mustInclude(navigationScreen, "lastStopHandledAtRef", "STOP stale-speech guard");
mustInclude(navigationScreen, "recordStopBargeInSnapshot", "STOP cut-through diagnostic recorder");
mustInclude(navigationScreen, "recognizedCommand: \"stop-guidance-partial\"", "Partial STOP diagnostic proof");
mustInclude(navigationScreen, "recognizedDuringSpeech: stopRecognizedDuringSpeech", "STOP recognized during speech proof");
mustInclude(navigationScreen, "playAudioCue(\"success\")", "Success audio cue path");
mustInclude(navigationScreen, "playAudioCue(\"stop\")", "STOP audio cue path");
mustInclude(navigationScreen, "playAudioCue(\"error\")", "Error audio cue path");
mustInclude(navigationScreen, "updateSpeechRate", "Spoken speech-rate setting path");
mustInclude(navigationScreen, "updateDescriptionMode", "Spoken detail-level setting path");
mustInclude(navigationScreen, "updateHapticsEnabled", "Spoken haptics setting path");
mustInclude(visionAI, "interactionMode: options?.interactionMode ?? \"guidance\"", "VisionAI propagates typed interaction mode");
mustInclude(analyzeApi, "interactionMode: payload.interactionMode", "API JSON propagates interaction mode");
mustInclude(conversationLane, "speech\n      && isGuiding", "All guidance speech remains STOP-interruptible");
mustInclude(
  conversationLane,
  "isSceneQuery || isSafetyStop || !isSpeaking",
  "Scene-query and safety STOP results can interrupt an earlier prompt",
);
mustInclude(conversationLane, "canKeepListeningForStopBargeInDuringSpeech", "Guidance speech retains STOP barge-in eligibility");
mustInclude(conversationLane, "settingsUpdate: null", "Scene-query result plan cannot mutate settings");
mustInclude(conversationLane, "isSceneQuery && !isSafetyStop ? null : result", "Scene-query safety STOP escapes conversation isolation");
mustInclude(conversationLane, "audioCue: isSafetyStop ? \"stop\" : null", "Scene-query safety STOP keeps the stop earcon");
mustInclude(cloudAnalyzePath, "direction: analysis.direction", "Cloud direction is returned literally");
mustInclude(cloudAnalyzePath, "message: analysis.message", "Cloud message is returned literally");
mustInclude(cloudAnalyzePath, "options?.interactionMode !== \"scene-query\"", "Scene-query mode enforces memory isolation");
mustNotInclude(cloudAnalyzePath, "smoothDirection(", "Cloud response path must not smooth provider direction");
mustNotInclude(cloudAnalyzePath, "buildMessage(", "Cloud response path must not rewrite provider message");

const homeScreen = read("../src/screens/HomeScreen.tsx");
mustInclude(homeScreen, "isFocusedRef", "Home voice-session focus ownership guard");
mustInclude(homeScreen, "hasAnnouncedReadyPromptRef", "Home ready prompt one-shot guard");
mustInclude(homeScreen, "speakVoiceResponseRef", "Home ready prompt is not coupled to settings-change effect cleanup");
mustInclude(homeScreen, "startGuidanceFromHome", "Home guidance handoff helper");
mustInclude(homeScreen, "lastSpokenMessageRef.current = \"Guidance started. Analyzing your surroundings.\"", "Home handoff seeds Navigation repeat text");
mustInclude(homeScreen, "if (responseIsCurrent())", "Home stale voice-session restart guard");
mustNotInclude(homeScreen, "Guidance starting. Say stop guidance any time to pause.", "Home must not speak overlapping start prompt during Navigation handoff");

const settingsProvider = read("../src/providers/SettingsProvider.tsx");
mustInclude(settingsProvider, "AsyncStorage.getItem", "Settings persistence load");
mustInclude(settingsProvider, "AsyncStorage.setItem", "Settings persistence save");
mustInclude(settingsProvider, "persistenceQueueRef", "Settings writes are serialized");
mustInclude(settingsProvider, "return false", "Settings persistence reports failure");
mustInclude(settingsProvider, "speechRate", "Speech-rate persisted setting");
mustInclude(settingsProvider, "descriptionMode", "Detail-level persisted setting");
mustInclude(settingsProvider, "hapticsEnabled", "Haptics persisted setting");

const diagnostics = read("../src/lib/diagnostics.ts");
mustInclude(diagnostics, "unexpectedSpeechListeningOverlapCount", "Unexpected overlap diagnostic");
mustInclude(diagnostics, "lastSpeechListeningOverlapReason", "STOP overlap reason diagnostic");
mustInclude(diagnostics, "DiagnosticsStopBargeInSnapshot", "STOP barge-in diagnostic snapshot");
mustInclude(diagnostics, "recordStopBargeInSnapshot", "STOP barge-in diagnostic recorder");
mustInclude(diagnostics, "resetStopBargeInSnapshot", "STOP barge-in diagnostic reset");
mustInclude(diagnostics, "recognizedDuringSpeech", "STOP recognition during speech diagnostic");
mustInclude(diagnostics, "recognizedPhase", "STOP recognition phase diagnostic");
mustInclude(diagnostics, "voiceOverRunning", "VoiceOver diagnostic");
mustInclude(diagnostics, "nativePath", "Native camera path diagnostic");
mustInclude(diagnostics, "frameSummary", "Frame summary diagnostic");
mustInclude(diagnostics, "captureHeuristics", "Capture heuristics diagnostic");
mustInclude(diagnostics, "walkability", "Walkability diagnostic");
mustInclude(diagnostics, "DiagnosticsAudioCueSnapshot", "Audio cue diagnostic snapshot");
mustInclude(diagnostics, "recordAudioCueSnapshot", "Audio cue diagnostic recorder");
mustInclude(diagnostics, "DiagnosticsHapticSnapshot", "Haptic diagnostic snapshot");
mustInclude(diagnostics, "recordHapticSnapshot", "Haptic diagnostic recorder");
mustInclude(diagnostics, "buildNoScreenSmokeEvidenceDraftJson", "No-screen evidence JSON draft exporter");
mustInclude(diagnostics, "requestIds", "No-screen evidence backend request ID draft");

const navigationCore = read("../src/native/GuidePupNavigationCore.ts");
mustInclude(navigationCore, "playAudioCue", "Audio cue path");
mustInclude(navigationCore, "recordAudioCueSnapshot", "Audio cue path records diagnostics");
mustInclude(navigationCore, "recordHapticSnapshot", "Haptic path records diagnostics");
mustInclude(navigationCore, "AccessibilityInfo.announceForAccessibility", "VoiceOver announcement fallback");
mustInclude(navigationCore, "source: \"native-core\"", "Native camera capture source");
mustInclude(navigationCore, "source: \"js-fallback\"", "JS camera fallback source");

const voiceController = read("../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift");
mustInclude(voiceController, "activeLocaleIdentifier", "Native voice controller keeps active locale for final-result renewal");
mustInclude(voiceController, "activePartialResults", "Native voice controller preserves partial-result option for STOP renewal");
mustInclude(voiceController, "restartListeningAfterFinalIfNeeded", "Native voice controller renews recognition after final commands");
mustInclude(voiceController, "result?.isFinal == true", "Native voice controller observes final recognition results");

const diagnosticsScreen = read("../src/screens/DiagnosticsScreen.tsx");
mustInclude(diagnosticsScreen, "Speech/listening invariant", "Diagnostics screen overlap invariant");
mustInclude(diagnosticsScreen, "VoiceOver running", "Diagnostics screen VoiceOver status");
mustInclude(diagnosticsScreen, "Audio cues", "Diagnostics screen audio cue evidence");
mustInclude(diagnosticsScreen, "Last execution path", "Diagnostics screen haptic execution path");
mustInclude(diagnosticsScreen, "Frame summary", "Diagnostics screen frame summary");
mustInclude(diagnosticsScreen, "Walkability", "Diagnostics screen walkability");
mustInclude(diagnosticsScreen, "Export no-screen JSON draft", "Diagnostics screen no-screen JSON draft export");

const noScreenEvidence = read("../docs/no-screen-smoke-evidence.md");
for (const phrase of [
  "expo/release/no-screen-smoke.latest.json",
  "check:no-screen-evidence",
  "Cold prompt",
  "start guidance",
  "status",
  "help",
  "slower speech",
  "faster speech",
  "more detail",
  "less detail",
  "haptics off",
  "haptics on",
  "repeat",
  "what do you see",
  "stop guidance",
  "Speech/listening invariant: PASS",
  "Backend smoke artifact request IDs",
  "walkability",
]) {
  mustInclude(noScreenEvidence, phrase, `No-screen evidence phrase "${phrase}"`);
}

const releasePreflight = read("../scripts/release-preflight.mjs");
mustInclude(releasePreflight, "validateNoScreenSmokeEvidence", "No-screen hardware evidence preflight gate");
mustInclude(releasePreflight, "NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH", "No-screen hardware artifact path");
mustInclude(releasePreflight, "real-iPhone no-screen validation", "No-screen hardware missing-artifact message");
mustInclude(releasePreflight, "artifact.health?.requestId", "Health request ID preflight gate");
mustInclude(releasePreflight, "artifact.bootstrap?.requestId", "Bootstrap request ID preflight gate");
mustInclude(releasePreflight, "artifact.analyze?.requestId", "Analyze request ID preflight gate");
mustInclude(releasePreflight, "requireHealthField(\"defaultMaxCompletionTokens\"", "Max completion token preflight gate");
mustInclude(releasePreflight, "requireHealthField(\"defaultRequestTimeoutMs\"", "Provider timeout preflight gate");
mustInclude(releasePreflight, "requireHealthField(\"defaultRetryCount\"", "Provider retry preflight gate");
mustInclude(releasePreflight, "requireHealthField(\"structuredOutputMode\"", "Strict Structured Outputs health preflight gate");
mustInclude(releasePreflight, "requireEnvelopeField(\"frameSummary\"", "Frame summary preflight gate");
mustInclude(releasePreflight, "requireEnvelopeField(\"captureHeuristics\"", "Capture heuristics preflight gate");
mustInclude(releasePreflight, "requireAnalyzeField(\"walkability\"", "Walkability preflight gate");
mustInclude(releasePreflight, "requireLaunchContractField(\"valid\"", "Launch contract preflight gate");
mustInclude(releasePreflight, "requireLaunchContractField(\"strictStructuredOutputsPresent\"", "Strict Structured Outputs launch contract preflight gate");
mustInclude(releasePreflight, "validatePublicSupportPageForStore", "Public support page App Store preflight gate");
mustInclude(releasePreflight, "Public support page must include the configured support email", "Public support contact preflight gate");
mustInclude(releasePreflight, "validateAppReviewMetadataForStore", "App Review metadata preflight gate");
mustInclude(releasePreflight, "App Review sign-in required / demoRequired", "App Review sign-in required preflight gate");
mustInclude(releasePreflight, "does not require account sign-in", "App Review no-login notes preflight gate");
mustInclude(releasePreflight, "validateSentryLaunchDecision", "Sentry launch decision preflight gate");
mustInclude(releasePreflight, "launchInputs.sentryMode", "Sentry launch mode preflight gate");

const liveSmoke = read("../../backend/guidepup-api/eval/run-live-smoke.mjs");
mustInclude(liveSmoke, "launchContract", "Live smoke records launch contract");
mustInclude(liveSmoke, "requireLaunchContract", "Live smoke can fail on launch-invalid evidence");
mustInclude(liveSmoke, "validateLaunchReadinessArtifact", "Live smoke validates launch readiness before success");
mustInclude(liveSmoke, "hasImage: true", "Live smoke sends hasImage");
mustInclude(liveSmoke, "sampledFrame: true", "Live smoke sends sampledFrame");
mustInclude(liveSmoke, "frameSummary", "Live smoke records frame summary");
mustInclude(liveSmoke, "captureHeuristics", "Live smoke records capture heuristics");
mustInclude(liveSmoke, "walkability", "Live smoke records walkability");
mustInclude(liveSmoke, "defaultMaxCompletionTokens", "Live smoke records max completion tokens");
mustInclude(liveSmoke, "defaultRequestTimeoutMs", "Live smoke records provider timeout");
mustInclude(liveSmoke, "defaultRetryCount", "Live smoke records provider retry count");

const noScreenEvidenceSchema = read("../scripts/no-screen-smoke-evidence.mjs");
mustInclude(noScreenEvidenceSchema, "REQUIRED_NO_SCREEN_SEQUENCE", "No-screen evidence required sequence");
mustInclude(noScreenEvidenceSchema, "sequence.order", "No-screen evidence required sequence order");
mustInclude(noScreenEvidenceSchema, "requireMatchingFields", "No-screen evidence provenance/device consistency");
mustInclude(noScreenEvidenceSchema, "provenance.bundleIdentifier", "No-screen evidence bundle provenance consistency");
mustInclude(noScreenEvidenceSchema, "helpIncludesBoundedCommandList", "No-screen evidence voice help proof");
mustInclude(noScreenEvidenceSchema, "sequence.help.settingsChanged", "No-screen evidence help non-mutation proof");
mustInclude(noScreenEvidenceSchema, "stopBargeIn.cutThrough", "No-screen evidence STOP cut-through proof");
mustInclude(noScreenEvidenceSchema, "stopBargeIn.recognizedCommand", "No-screen evidence STOP recognized command proof");
mustInclude(noScreenEvidenceSchema, "stopBargeIn.recognizedDuringSpeech", "No-screen evidence STOP during-speech proof");
mustInclude(noScreenEvidenceSchema, "stopBargeIn.recognizedPhase", "No-screen evidence STOP recognition phase proof");
mustInclude(noScreenEvidenceSchema, "settingsPersistence.nonDefaultSettingSurvivedRelaunch", "No-screen evidence settings persistence proof");
mustInclude(noScreenEvidenceSchema, "settingsPersistence.afterVoiceChange.differsFromBefore", "No-screen evidence settings change proof");
mustInclude(noScreenEvidenceSchema, "settingsPersistence.afterRelaunch.matchesAfterVoiceChange", "No-screen evidence settings relaunch proof");
mustInclude(noScreenEvidenceSchema, "captureHeuristics.uploadedHeightMatchesPath", "No-screen evidence capture heuristic upload-height proof");
mustInclude(noScreenEvidenceSchema, "captureHeuristics.uploadedWidthMatchesPath", "No-screen evidence capture heuristic upload-width proof");
mustInclude(noScreenEvidenceSchema, "nativeCore", "No-screen evidence native-core camera proof");
mustInclude(noScreenEvidenceSchema, "jsFallback", "No-screen evidence JS fallback camera proof");
mustInclude(noScreenEvidenceSchema, "backendSmoke.walkability", "No-screen evidence walkability proof");
mustInclude(noScreenEvidenceSchema, "privacy.containsRawMedia", "No-screen evidence privacy proof");

const iosDeviceReady = read("../scripts/check-ios-device-ready.mjs");
mustInclude(iosDeviceReady, "--json", "iOS device readiness JSON output");
mustInclude(iosDeviceReady, "identifierHandling", "iOS device readiness suffix-only evidence");
mustInclude(iosDeviceReady, "containsFullDeviceIds", "iOS device readiness privacy guard");
mustInclude(iosDeviceReady, "probeCoreDeviceExecution", "iOS device readiness active CoreDevice probe");

const iosDeviceReadiness = read("../scripts/ios-device-readiness.mjs");
mustInclude(iosDeviceReadiness, "devicectl-process-info", "iOS device active probe type");
mustInclude(iosDeviceReadiness, "coreDeviceExecutionReady", "iOS device executable readiness result");
mustInclude(iosDeviceReadiness, "guidepup-coredevice-", "iOS device private temporary probe output");

console.log("No-screen smoke contract passed. Real iPhone validation is still required for hardware proof.");
