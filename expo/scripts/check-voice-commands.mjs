import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const sourcePath = fileURLToPath(new URL("../src/lib/voiceCommands.ts", import.meta.url));
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

const {
  canKeepListeningForStopBargeInDuringSpeech,
  isStopBargeInCommand,
  normalizeVoiceTranscript,
  parseVoiceCommand,
} = module.exports;

const acceptedCommands = [
  ["start guidance", "start-guidance"],
  ["Guide Pup, start guidance!", "start-guidance"],
  ["please resume guidance", "start-guidance"],
  ["stop", "stop-guidance"],
  ["Guide Pup stop guidance", "stop-guidance"],
  ["please pause", "stop-guidance"],
  ["please stop now", "stop-guidance"],
  ["Guide Pup, pause now", "stop-guidance"],
  ["repeat that", "repeat"],
  ["what can I say?", "help"],
  ["slower speech", "slower-speech"],
  ["speak faster", "faster-speech"],
  ["more details", "more-detail"],
  ["less detail", "less-detail"],
  ["turn on haptics", "haptics-on"],
  ["Guide Pup haptics off", "haptics-off"],
  ["what's my status", "status"],
];

for (const [transcript, expectedIntent] of acceptedCommands) {
  assert.equal(
    parseVoiceCommand(transcript),
    expectedIntent,
    `Expected "${transcript}" to parse as ${expectedIntent}`,
  );
}

const rejectedCommands = [
  "do not stop",
  "please do not stop guidance",
  "never pause guidance",
  "pause music",
  "start timer",
  "resume podcast",
  "slow down",
  "short story",
  "turn off lights",
  "what do you see",
  "the sign says stop",
  "the sign says stop now",
];

for (const transcript of rejectedCommands) {
  assert.equal(
    parseVoiceCommand(transcript),
    null,
    `Expected "${transcript}" to stay outside the deterministic command lane`,
  );
}

const stopBargeInAccepted = [
  "stop",
  "Guide Pup, stop!",
  "please stop guidance",
  "please stop now",
  "pause guidance",
  "Guide Pup, pause now",
];

for (const transcript of stopBargeInAccepted) {
  assert.equal(
    isStopBargeInCommand(transcript),
    true,
    `Expected "${transcript}" to cut through as STOP barge-in`,
  );
}

const stopBargeInRejected = [
  "do not stop",
  "pause music",
  "the sign says stop",
  "the sign says stop now",
  "stop sign ahead",
];

for (const transcript of stopBargeInRejected) {
  assert.equal(
    isStopBargeInCommand(transcript),
    false,
    `Expected "${transcript}" to stay out of STOP barge-in`,
  );
}

assert.equal(normalizeVoiceTranscript(" Guide Pup, STOP guidance! "), "guide pup stop guidance");
assert.equal(canKeepListeningForStopBargeInDuringSpeech("Keep moving forward."), true);
assert.equal(canKeepListeningForStopBargeInDuringSpeech("Safe stop active."), true);
assert.equal(canKeepListeningForStopBargeInDuringSpeech("Guidance paused."), true);
assert.equal(canKeepListeningForStopBargeInDuringSpeech("Say stop guidance any time."), true);
assert.equal(
  module.exports.isRecentDuplicateTranscript(
    "stop guidance",
    { normalizedTranscript: "stop guidance", timestampMs: 1_000 },
    2_499,
  ),
  true,
);
assert.equal(
  module.exports.isRecentDuplicateTranscript(
    "stop guidance",
    { normalizedTranscript: "stop guidance", timestampMs: 1_000 },
    2_500,
  ),
  false,
);

console.log("Voice command contract passed.");
