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

const navigationScreen = read("../src/screens/NavigationScreen.tsx");
mustInclude(navigationScreen, "conversationIntent === \"what-do-you-see\"", "Conversation-lane route");
mustInclude(navigationScreen, "Guidance settings are unchanged", "Scene-query non-mutation confirmation");
mustInclude(navigationScreen, "isStopBargeInCommand(normalizedTranscript)", "Partial STOP cut-through");
mustInclude(navigationScreen, "lastStopHandledAtRef", "STOP stale-speech guard");
mustInclude(navigationScreen, "updateSpeechRate", "Spoken speech-rate setting path");
mustInclude(navigationScreen, "updateDescriptionMode", "Spoken detail-level setting path");
mustInclude(navigationScreen, "updateHapticsEnabled", "Spoken haptics setting path");

const settingsProvider = read("../src/providers/SettingsProvider.tsx");
mustInclude(settingsProvider, "AsyncStorage.getItem", "Settings persistence load");
mustInclude(settingsProvider, "AsyncStorage.setItem", "Settings persistence save");
mustInclude(settingsProvider, "speechRate", "Speech-rate persisted setting");
mustInclude(settingsProvider, "descriptionMode", "Detail-level persisted setting");
mustInclude(settingsProvider, "hapticsEnabled", "Haptics persisted setting");

const diagnostics = read("../src/lib/diagnostics.ts");
mustInclude(diagnostics, "unexpectedSpeechListeningOverlapCount", "Unexpected overlap diagnostic");
mustInclude(diagnostics, "lastSpeechListeningOverlapReason", "STOP overlap reason diagnostic");
mustInclude(diagnostics, "voiceOverRunning", "VoiceOver diagnostic");
mustInclude(diagnostics, "nativePath", "Native camera path diagnostic");
mustInclude(diagnostics, "frameSummary", "Frame summary diagnostic");
mustInclude(diagnostics, "captureHeuristics", "Capture heuristics diagnostic");
mustInclude(diagnostics, "DiagnosticsHapticSnapshot", "Haptic diagnostic snapshot");
mustInclude(diagnostics, "recordHapticSnapshot", "Haptic diagnostic recorder");

const navigationCore = read("../src/native/GuidePupNavigationCore.ts");
mustInclude(navigationCore, "recordHapticSnapshot", "Haptic path records diagnostics");
mustInclude(navigationCore, "AccessibilityInfo.announceForAccessibility", "VoiceOver announcement fallback");
mustInclude(navigationCore, "source: \"native-core\"", "Native camera capture source");
mustInclude(navigationCore, "source: \"js-fallback\"", "JS camera fallback source");

const diagnosticsScreen = read("../src/screens/DiagnosticsScreen.tsx");
mustInclude(diagnosticsScreen, "Speech/listening invariant", "Diagnostics screen overlap invariant");
mustInclude(diagnosticsScreen, "VoiceOver running", "Diagnostics screen VoiceOver status");
mustInclude(diagnosticsScreen, "Last execution path", "Diagnostics screen haptic execution path");
mustInclude(diagnosticsScreen, "Frame summary", "Diagnostics screen frame summary");

const noScreenEvidence = read("../docs/no-screen-smoke-evidence.md");
for (const phrase of [
  "Cold prompt",
  "start guidance",
  "status",
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
]) {
  mustInclude(noScreenEvidence, phrase, `No-screen evidence phrase "${phrase}"`);
}

const releasePreflight = read("../scripts/release-preflight.mjs");
mustInclude(releasePreflight, "artifact.health?.requestId", "Health request ID preflight gate");
mustInclude(releasePreflight, "artifact.bootstrap?.requestId", "Bootstrap request ID preflight gate");
mustInclude(releasePreflight, "artifact.analyze?.requestId", "Analyze request ID preflight gate");
mustInclude(releasePreflight, "requireEnvelopeField(\"frameSummary\"", "Frame summary preflight gate");
mustInclude(releasePreflight, "requireEnvelopeField(\"captureHeuristics\"", "Capture heuristics preflight gate");

const liveSmoke = read("../../backend/guidepup-api/eval/run-live-smoke.mjs");
mustInclude(liveSmoke, "hasImage: true", "Live smoke sends hasImage");
mustInclude(liveSmoke, "sampledFrame: true", "Live smoke sends sampledFrame");
mustInclude(liveSmoke, "frameSummary", "Live smoke records frame summary");
mustInclude(liveSmoke, "captureHeuristics", "Live smoke records capture heuristics");

console.log("No-screen smoke contract passed. Real iPhone validation is still required for hardware proof.");
