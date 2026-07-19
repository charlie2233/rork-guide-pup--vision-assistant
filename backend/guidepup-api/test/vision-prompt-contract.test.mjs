import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

const promptSource = fs.readFileSync(new URL("../src/lib/prompts.ts", import.meta.url), "utf8");
const visionSchemaSource = fs.readFileSync(new URL("../src/schemas/vision.ts", import.meta.url), "utf8");

async function importPromptModule() {
  const transpiled = ts.transpileModule(promptSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
  return import(dataUrl);
}

test("vision prompt keeps cloud analysis out of deterministic iOS controls", async () => {
  const { buildVisionSystemPrompt } = await importPromptModule();
  const prompt = buildVisionSystemPrompt("test-prompt-version", "scene-query");

  assert.match(prompt, /one sampled frame/i);
  assert.match(prompt, /STOP behavior/);
  assert.match(prompt, /haptics/);
  assert.match(prompt, /VoiceOver/);
  assert.match(prompt, /speech rate/);
  assert.match(prompt, /iOS controls those deterministically/);
  assert.match(prompt, /Return only the structured fields/);
  assert.match(prompt, /bounded scene query/i);
  assert.match(prompt, /sceneDescription field is spoken aloud/i);
  assert.match(prompt, /visible facts/i);
  assert.match(prompt, /Do not issue commands/i);
});

test("vision prompt requires walkability, surface, lighting, confidence, and concise spoken guidance", async () => {
  const { buildVisionSystemPrompt } = await importPromptModule();
  const prompt = buildVisionSystemPrompt("test-prompt-version");

  for (const requiredText of [
    "walkability",
    "surface type",
    "lighting",
    "confidence",
    "Only recommend forward",
    "shortMessage field is spoken aloud",
    "under 12 words",
  ]) {
    assert.match(prompt, new RegExp(requiredText, "i"));
  }
  assert.match(prompt, /active guidance/i);
  assert.doesNotMatch(prompt, /bounded scene query/i);
});

test("vision user prompt carries compact sampled-frame context without raw image data", async () => {
  const { buildVisionUserPrompt } = await importPromptModule();
  const prompt = buildVisionUserPrompt({
    appVersion: "1.0.0",
    captureHeuristics: {
      frameAgeMs: 42,
      imageSource: "base64",
      resizedForUpload: true,
      uploadedHeight: 512,
      uploadedWidth: 384,
    },
    detail: "low",
    frameId: "frame-123",
    frameSummary: "Native sampled frame, resized for upload.",
    hasImage: true,
    imageBase64: "test-image-payload",
    interactionMode: "scene-query",
    nativePath: "native-core",
    platform: "ios",
    priorGuidance: "Stop. Chair ahead.",
    sampledFrame: true,
    sessionId: "session-123",
    sourceHeight: 1024,
    sourceWidth: 768,
    timestampMs: 1779558000000,
  });

  assert.match(prompt, /single camera frame/);
  assert.match(prompt, /prior guidance only to avoid repetition/i);
  assert.match(prompt, /prefer stop/i);
  assert.match(prompt, /"sampledFrame":true/);
  assert.match(prompt, /"interactionMode":"scene-query"/);
  assert.match(prompt, /what-do-you-see/i);
  assert.match(prompt, /"nativePath":"native-core"/);
  assert.match(prompt, /"frameId":"frame-123"/);
  assert.match(prompt, /"sessionId":"session-123"/);
  assert.match(prompt, /"priorGuidance":"Stop\. Chair ahead\."/);
  assert.doesNotMatch(prompt, /imageBase64/i);
  assert.doesNotMatch(prompt, /data:image/i);
  assert.doesNotMatch(prompt, /test-image-payload/i);
});

test("walkability is first-class in provider and launch response contracts", async () => {
  const { ProviderVisionJsonSchema } = await importPromptModule();

  assert.equal(ProviderVisionJsonSchema.required.includes("walkability"), true);
  assert.deepEqual(ProviderVisionJsonSchema.properties.walkability.enum, ["clear", "caution", "uncertain"]);
  assert.match(visionSchemaSource, /export const WalkabilitySchema/);
  assert.match(visionSchemaSource, /walkability:\s*WalkabilitySchema/);
});
