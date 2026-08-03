import assert from "node:assert/strict";
import test from "node:test";
import {
  findDisallowedKeys,
  findSensitivePatterns,
  validateEvidencePrivacy,
} from "./evidence-privacy.mjs";

function assertPrivate(value, pathFragment, categoryFragment) {
  const result = validateEvidencePrivacy(value);
  const findings = [...result.disallowedKeys, ...result.sensitivePatterns];
  assert.ok(
    findings.some(
      (item) => item.includes(pathFragment) && (!categoryFragment || item.includes(categoryFragment)),
    ),
    `Expected a privacy finding at ${pathFragment}: ${JSON.stringify(findings)}`,
  );
  return findings;
}

test("canonicalizes disallowed keys across case and punctuation variants", () => {
  assert.deepEqual(findDisallowedKeys({
    audit: {
      ParticipantName: "private participant",
      "DEVICE-ID": "private device identifier",
      provider_key: "private provider key",
    },
  }), [
    "audit.ParticipantName",
    "audit.DEVICE-ID",
    "audit.provider_key",
  ]);
});

test("rejects canonical provider and credential aliases", () => {
  assert.deepEqual(findDisallowedKeys({
    secrets: {
      ai_gateway_api_key: "redacted",
      aiGatewayFallbackApiKey: "redacted",
      bootstrapSigningSecret: "redacted",
      openai_api_key: "redacted",
      "CLOUDFLARE-API-TOKEN": "redacted",
      refresh_token: "redacted",
      clientSecret: "redacted",
      private_key: "redacted",
      accessToken: "redacted",
      secretAccessKey: "redacted",
      serviceAccountKey: "redacted",
      signing_secret: "redacted",
      huggingfaceMinicpmOApiKey: "redacted",
    },
  }), [
    "secrets.ai_gateway_api_key",
    "secrets.aiGatewayFallbackApiKey",
    "secrets.bootstrapSigningSecret",
    "secrets.openai_api_key",
    "secrets.CLOUDFLARE-API-TOKEN",
    "secrets.refresh_token",
    "secrets.clientSecret",
    "secrets.private_key",
    "secrets.accessToken",
    "secrets.secretAccessKey",
    "secrets.serviceAccountKey",
    "secrets.signing_secret",
    "secrets.huggingfaceMinicpmOApiKey",
  ]);
});

test("preserves launch-safe evidence fields and boolean privacy declarations", () => {
  const safeEvidence = {
    camera: {
      hasImage: true,
      imageSource: "base64",
    },
    diagnostics: {
      audioCues: ["start", "stop"],
      audioRoute: "speaker",
    },
    privacy: {
      containsFullDeviceIds: false,
      containsIdentityContactData: false,
      containsRawAudio: false,
      containsRawMedia: false,
      containsCredentials: false,
      containsSecrets: false,
      containsSignedUrls: false,
    },
  };

  assert.deepEqual(validateEvidencePrivacy(safeEvidence), {
    disallowedKeys: [],
    sensitivePatterns: [],
  });
});

test("rejects an unprefixed three-part JWT without echoing it", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcml2YWN5LXRlc3Qtb25seSJ9.dGVzdC1zaWduYXR1cmU";
  const findings = assertPrivate({ auth: { result: jwt } }, "auth.result", "JSON Web Token");

  assert.ok(findings.every((item) => !item.includes(jwt)));
  assert.deepEqual(findSensitivePatterns({
    release: "1.2.3",
    summary: "Three ordinary.parts.with-dots are not a token.",
  }), []);
});

test("rejects domestic and international phone shapes at their JSON paths", () => {
  assertPrivate({ notes: { first: "Call 949-555-0100 after the run." } }, "notes.first", "phone number");
  assertPrivate({ notes: { second: "Call (949) 555-0100 after the run." } }, "notes.second", "phone number");
  assertPrivate({ notes: { compact: "Call 9495550100 after the run." } }, "notes.compact", "phone number");
  assertPrivate({ notes: { international: "Call +44 20 7946 0958." } }, "notes.international", "phone number");
});

test("does not classify timestamps, durations, UUIDs, or ordinary numeric text as phones", () => {
  const safeValues = {
    duration: "00:12:34.567",
    generatedAt: "2026-07-25T17:04:03.123Z",
    requestId: "33333333-3333-4333-8333-333333333333",
    revision: "build 2026-07-25 17:04",
    sourceRevision: "af9495550100bcdef0123456789abcdef0123456",
  };

  assert.deepEqual(findSensitivePatterns(safeValues), []);
});

test("rejects meaningfully long byte arrays while allowing normal numeric arrays", () => {
  const bytes = Array.from({ length: 64 }, (_, index) => index % 256);
  assertPrivate({ diagnostics: { payload: bytes } }, "diagnostics.payload", "raw byte array");
  assertPrivate(
    { diagnostics: { tinyGif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] } },
    "diagnostics.tinyGif",
    "raw byte array",
  );
  assert.deepEqual(findSensitivePatterns({
    histogram: [0, 2, 5, 8, 13, 21, 34, 55],
    measurements: Array.from({ length: 40 }, (_, index) => index + 256),
  }), []);
});

test("rejects base64 chunks and whitespace-folded base64", () => {
  const encoded = Buffer.from(
    Array.from({ length: 384 }, (_, index) => (index * 37) % 256),
  ).toString("base64");
  const chunks = encoded.match(/.{1,64}/g);
  const folded = `${encoded.slice(0, 256)}\n${encoded.slice(256)}`;

  assertPrivate({ capture: { chunks } }, "capture.chunks", "base64 chunk array");
  assertPrivate({ capture: { folded } }, "capture.folded", "long base64 payload");
  assertPrivate(
    { capture: { tinyGif: "R0lGODlhAQABAIAAAAUEBA==" } },
    "capture.tinyGif",
    "encoded media payload",
  );
});

test("does not treat ordinary string arrays or prose as base64 chunks", () => {
  assert.deepEqual(findSensitivePatterns({
    commands: ["start guidance", "status", "what do you see", "stop guidance"],
    longAlphabeticValue: "a".repeat(200),
    summary: "This is a sufficiently ordinary sentence with spaces and punctuation. ".repeat(8),
  }), []);
});

test("rejects credentials, private keys, provider tokens, and Apple device identifiers in prose", () => {
  for (const [label, value, category] of [
    ["cloudflare", "CLOUDFLARE_API_TOKEN=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["expo", "EXPO_TOKEN=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["bootstrap", "BOOTSTRAP_SIGNING_SECRET=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["build", "build_token=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["password", '"password":"abcdefghijklmnopqrstuvwxyz123456"', "credential assignment"],
    ["authorization", "authorization=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["gateway", "AI_GATEWAY_API_KEY=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["gatewayFallback", "AI_GATEWAY_FALLBACK_API_KEY=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["minicpm", "HUGGINGFACE_MINICPM_O_API_KEY=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["benchmark", "DEBUG_BENCHMARK_TOKEN=abcdefghijklmnopqrstuvwxyz123456", "credential assignment"],
    ["refresh", '"refresh_token":"abcdefghijklmnopqrstuvwxyz123456"', "credential assignment"],
    ["client", '"clientSecret":"abcdefghijklmnopqrstuvwxyz123456"', "credential assignment"],
    ["private", "-----BEGIN PRIVATE KEY-----\nprivate-material", "private key block"],
    ["huggingface", "hf_abcdefghijklmnopqrstuvwxyz123456", "provider API key"],
    ["udid", "Device 00008110-001234567890801E", "Apple device identifier"],
    ["legacyUdid", `UDID ${"a1".repeat(20)}`, "legacy Apple device identifier"],
    ["legacyCamel", `deviceIdentifier:${"b2".repeat(20)}`, "legacy Apple device identifier"],
    ["legacyHyphen", `device-id=${"c3".repeat(20)}`, "legacy Apple device identifier"],
  ]) {
    assertPrivate({ notes: { [label]: value } }, `notes.${label}`, category);
  }
});

test("rejects tokenized URLs without rejecting benign URL-free signature status", () => {
  for (const [label, value] of [
    ["token", "https://example.test/build?token=abcdefghijklmnopqrstuvwxyz"],
    ["key", "https://example.test/build?key=abcdefghijklmnopqrstuvwxyz"],
    ["expires", "https://example.test/build?expires=1785000000"],
    ["aws", "https://example.test/build?X-Amz-Credential=abcdefghijklmnopqrstuvwxyz"],
  ]) {
    assertPrivate({ links: { [label]: value } }, `links.${label}`, "signed URL signature");
  }
  assertPrivate(
    { links: { auth: "https://example.test/build?auth=abcdefghijklmnopqrstuvwxyz" } },
    "links.auth",
    "URL query or fragment",
  );
});

test("rejects unlabeled legacy identifiers and unknown secret-shaped fields", () => {
  assertPrivate(
    { audit: { opaqueIdentifier: "a1".repeat(20) } },
    "audit.opaqueIdentifier",
    "unlabeled legacy Apple device identifier",
  );
  assertPrivate(
    { audit: { opaqueSyntheticSecret: "synthetic-private-value" } },
    "audit.opaqueSyntheticSecret",
  );
  assert.deepEqual(findSensitivePatterns({
    sourceRevision: "af9495550100bcdef0123456789abcdef0123456",
  }), []);
  assert.deepEqual(findDisallowedKeys({
    privacy: {
      containsCredentials: false,
      containsSecrets: false,
    },
  }), []);
});

test("allows only fixed sanitized or synthetic frame summaries", () => {
  assert.deepEqual(findSensitivePatterns({
    frameSummary: "Sanitized native-core sampled frame summary.",
    lane: {
      frameSummary:
        "Synthetic sampled js-fallback guidance smoke frame, source 40x40, upload 40x40.",
    },
  }), []);

  assertPrivate(
    { cameraPaths: { nativeCore: { frameSummary: "Front door at 123 Private Street." } } },
    "cameraPaths.nativeCore.frameSummary",
    "free-form frame summary",
  );
  assertPrivate(
    { cameraPaths: { nativeCore: { FrameSummary: "Front door at 123 Private Street." } } },
    "cameraPaths.nativeCore.FrameSummary",
    "free-form frame summary",
  );
  assertPrivate(
    { cameraPaths: { nativeCore: { frame_summary: "Front door at 123 Private Street." } } },
    "cameraPaths.nativeCore.frame_summary",
    "free-form frame summary",
  );
});

test("does not reject benign signature status text", () => {
  assert.deepEqual(findSensitivePatterns({
    signatureStatus: "signature=verified",
    shortStatus: "sig=pass",
  }), []);
});

test("findings expose paths and categories without echoing sensitive values", () => {
  const secretMarker = "PRIVATE_VALUE_MUST_NOT_APPEAR_7d79";
  const findings = assertPrivate(
    { evidence: { ParticipantName: secretMarker, contactText: `Call 949-555-0100 ${secretMarker}` } },
    "evidence.contactText",
    "phone number",
  );

  assert.ok(findings.some((item) => item === "evidence.ParticipantName"));
  assert.ok(findings.every((item) => !item.includes(secretMarker)));
  assert.ok(findings.every((item) => !item.includes("949-555-0100")));
});
