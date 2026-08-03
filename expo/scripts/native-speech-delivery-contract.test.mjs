import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const controller = readFileSync(fileURLToPath(new URL(
  "../modules/guidepup-voice-control/ios/GuidePupVoiceControlController.swift",
  import.meta.url,
)), "utf8");
const exceptions = readFileSync(fileURLToPath(new URL(
  "../modules/guidepup-voice-control/ios/GuidePupVoiceControlExceptions.swift",
  import.meta.url,
)), "utf8");

function functionBody(source, signature) {
  const signatureIndex = source.indexOf(signature);
  assert.notEqual(signatureIndex, -1, `Missing function: ${signature}`);

  const openingBrace = source.indexOf("{", signatureIndex);
  assert.notEqual(openingBrace, -1, `Missing function body: ${signature}`);

  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openingBrace + 1, index);
      }
    }
  }

  assert.fail(`Unterminated function body: ${signature}`);
}

test("native speech tracks each continuation with its exact utterance identity", () => {
  assert.match(
    controller,
    /private struct PendingSpeech \{\s*let continuation: CheckedContinuation<Void, Error>\s*let utterance: AVSpeechUtterance\s*\}/,
  );
  assert.match(controller, /private var pendingSpeech: PendingSpeech\?/);
  assert.doesNotMatch(controller, /private var speechContinuation:/);
  assert.doesNotMatch(controller, /private var activeSpeechUtterance:/);

  const completion = functionBody(
    controller,
    "private func completeSpeech(for utterance: AVSpeechUtterance, delivered: Bool)",
  );
  assert.match(
    completion,
    /guard let pendingSpeech, pendingSpeech\.utterance === utterance else \{\s*return\s*\}/,
  );
  assert.ok(
    completion.indexOf("self.pendingSpeech = nil")
      < completion.indexOf("pendingSpeech.continuation.resume"),
    "Completion must clear pending state before resuming its continuation.",
  );
});

test("didCancel fails delivery and didFinish alone reports delivery success", () => {
  const didCancel = functionBody(
    controller,
    "func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance)",
  );
  const didFinish = functionBody(
    controller,
    "func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance)",
  );
  const completion = functionBody(
    controller,
    "private func completeSpeech(for utterance: AVSpeechUtterance, delivered: Bool)",
  );

  assert.match(didCancel, /completeSpeech\(for: utterance, delivered: false\)/);
  assert.doesNotMatch(didCancel, /delivered: true|resume\(returning:/);
  assert.match(didFinish, /completeSpeech\(for: utterance, delivered: true\)/);
  assert.doesNotMatch(didFinish, /delivered: false|resume\(throwing:/);
  assert.match(
    completion,
    /if delivered \{\s*pendingSpeech\.continuation\.resume\(returning: \(\)\)\s*\} else \{\s*pendingSpeech\.continuation\.resume\(\s*throwing: GuidePupSpeechDeliveryCancelledException\(\)\s*\)\s*\}/,
  );
});

test("superseding speech and both immediate-stop paths reject pending delivery", () => {
  const speak = functionBody(
    controller,
    "func speak(text: String, rate: Double?, localeIdentifier: String?, interrupt: Bool) async throws",
  );
  const publicStop = functionBody(controller, "func stopSpeaking() async");
  const lifecycleStop = functionBody(controller, "private func stopSpeakingImmediately()");
  const rejection = functionBody(controller, "private func rejectPendingSpeech()");

  assert.ok(
    speak.indexOf("self.rejectPendingSpeech()")
      < speak.indexOf("self.pendingSpeech = PendingSpeech("),
    "A new utterance must reject any superseded delivery before it becomes pending.",
  );
  assert.match(publicStop, /self\.rejectPendingSpeech\(\)/);
  assert.ok(
    publicStop.indexOf("self.rejectPendingSpeech()")
      < publicStop.indexOf("self.speechSynthesizer.stopSpeaking(at: .immediate)"),
    "Public immediate stop must reject before requesting synthesizer cancellation.",
  );
  assert.match(lifecycleStop, /rejectPendingSpeech\(\)/);
  assert.ok(
    lifecycleStop.indexOf("rejectPendingSpeech()")
      < lifecycleStop.indexOf("speechSynthesizer.stopSpeaking(at: .immediate)"),
    "Lifecycle immediate stop must reject before requesting synthesizer cancellation.",
  );
  assert.match(
    rejection,
    /self\.pendingSpeech = nil[\s\S]*pendingSpeech\.continuation\.resume\(\s*throwing: GuidePupSpeechDeliveryCancelledException\(\)/,
  );
  assert.doesNotMatch(rejection, /resume\(returning:/);
});

test("speech cancellation failures are bounded and never include spoken text", () => {
  const exceptionMatch = exceptions.match(
    /internal final class GuidePupSpeechDeliveryCancelledException: Exception \{([\s\S]*?)\n\}/,
  );
  assert.ok(exceptionMatch, "Missing fixed speech-delivery cancellation exception.");
  assert.match(
    exceptionMatch[1],
    /"Guide Pup speech delivery was cancelled before completion\."/,
  );
  assert.doesNotMatch(exceptionMatch[1], /GenericException|param|text|utterance|\\\(/i);
  assert.ok(
    exceptionMatch[1].length < 180,
    "Cancellation exception must remain bounded.",
  );

  assert.doesNotMatch(
    controller,
    /(?:print|NSLog|os_log)\s*\([^)]*(?:text|trimmed|utterance)/,
  );
  assert.doesNotMatch(
    controller,
    /GuidePupSpeechDeliveryCancelledException\s*\([^)]*(?:text|trimmed|utterance)/,
  );
});
