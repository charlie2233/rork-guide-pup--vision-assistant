import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assessIosSubmissionEvidence,
  createIosSubmissionEvidence,
  expectedIosSubmissionEvidence,
  validateIosSubmissionEvidence,
  writeIosSubmissionEvidence,
} from "./ios-submission-evidence.mjs";

const CANDIDATE = {
  ipa: {
    appVersion: "1.0.0",
    buildNumber: "4",
    bundleIdentifier: "app.rork.guide-pup-vision-assist",
    sha256: "a".repeat(64),
  },
  release: {
    candidateBinding: {
      candidateIdentifier: "b".repeat(64),
    },
  },
  sourceRevision: "c".repeat(40),
};
const APP_STORE_CONNECT_APP_ID = "6756947790";
const UPLOAD_STARTED_AT = "2026-07-24T20:00:00.000Z";
const UPLOAD_COMPLETED_AT = "2026-07-24T20:10:00.000Z";

function validArtifact() {
  return createIosSubmissionEvidence({
    appStoreConnectAppId: APP_STORE_CONNECT_APP_ID,
    candidateArtifact: CANDIDATE,
    generatedAt: UPLOAD_COMPLETED_AT,
    track: "testflight",
    uploadCompletedAt: UPLOAD_COMPLETED_AT,
    uploadStartedAt: UPLOAD_STARTED_AT,
  });
}

test("local upload-attempt evidence is closed, sanitized, and bound to the candidate", () => {
  const artifact = validArtifact();
  const expected = expectedIosSubmissionEvidence(
    CANDIDATE,
    APP_STORE_CONNECT_APP_ID,
    "testflight",
  );
  assert.deepEqual(
    validateIosSubmissionEvidence(artifact, expected),
    { errors: [], valid: true },
  );
  assert.equal(
    JSON.stringify(artifact).includes(APP_STORE_CONNECT_APP_ID),
    false,
  );
  assert.equal(Object.hasOwn(artifact, "ipaPath"), false);
  assert.equal(Object.hasOwn(artifact, "output"), false);
  assert.equal(artifact.localAttemptCompleted, true);
  assert.equal(artifact.appleReceiptProven, false);
  assert.equal(artifact.appleIpaDigestAvailable, false);
  assert.equal(Object.hasOwn(artifact, "submitted"), false);
  assert.equal(Object.hasOwn(artifact, "receipt"), false);
});

test("local upload-attempt evidence rejects candidate splicing and overclaims", () => {
  const expected = expectedIosSubmissionEvidence(
    CANDIDATE,
    APP_STORE_CONNECT_APP_ID,
    "testflight",
  );
  for (const mutate of [
    (artifact) => {
      artifact.localCandidateIpaSha256 = "d".repeat(64);
    },
    (artifact) => {
      artifact.candidateIdentifier = "e".repeat(64);
    },
    (artifact) => {
      artifact.attemptCompletedAt = "2026-07-24T19:59:59.000Z";
    },
    (artifact) => {
      artifact.authorization = `Bearer ${"x".repeat(40)}`;
    },
    (artifact) => {
      artifact.submitted = true;
    },
    (artifact) => {
      artifact.appleReceiptProven = true;
    },
    (artifact) => {
      artifact.appleIpaDigestAvailable = true;
    },
  ]) {
    const artifact = validArtifact();
    mutate(artifact);
    assert.equal(
      validateIosSubmissionEvidence(artifact, expected).valid,
      false,
    );
  }
});

test("local upload-attempt evidence writes atomically without temporary residue", (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "guidepup-local-upload-attempt-"),
  );
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const outputPath = path.join(root, "release", "local-attempt.json");
  const artifact = validArtifact();
  writeIosSubmissionEvidence(outputPath, artifact);

  assert.deepEqual(
    JSON.parse(fs.readFileSync(outputPath, "utf8")),
    artifact,
  );
  assert.deepEqual(
    fs.readdirSync(path.dirname(outputPath))
      .filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("a locally constructed attempt is not release-ready without independent Apple correlation", () => {
  const artifact = validArtifact();
  const expected = expectedIosSubmissionEvidence(
    CANDIDATE,
    APP_STORE_CONNECT_APP_ID,
    "testflight",
  );
  assert.deepEqual(
    assessIosSubmissionEvidence({
      artifact,
      expected,
    }),
    {
      correlated: false,
      errors: [
        "independent authenticated App Store Connect build correlation is required",
      ],
      exactCandidateReceiptProven: false,
      submissionCorrelationReady: false,
    },
  );

  const correlated = assessIosSubmissionEvidence({
    appStoreConnectBuildEvidence: {
      appId: APP_STORE_CONNECT_APP_ID,
      buildNumber: "4",
      buildRecordIdentifier: "asc-build-record-4",
      correlationBasis: "app-id-version-build-uploaded-date",
      expired: false,
      ipaDigestAvailable: false,
      marketingVersion: "1.0.0",
      processingState: "VALID",
      source: "app-store-connect-api",
      uploadedAt: "2026-07-24T20:10:00.000Z",
    },
    artifact,
    expected,
  });
  assert.deepEqual(correlated, {
    correlated: true,
    errors: [],
    exactCandidateReceiptProven: false,
    submissionCorrelationReady: true,
  });

  const digestOverclaim = assessIosSubmissionEvidence({
    appStoreConnectBuildEvidence: {
      appId: APP_STORE_CONNECT_APP_ID,
      buildNumber: "4",
      buildRecordIdentifier: "asc-build-record-4",
      correlationBasis: "app-id-version-build-uploaded-date",
      expired: false,
      ipaDigestAvailable: true,
      marketingVersion: "1.0.0",
      processingState: "VALID",
      source: "app-store-connect-api",
      uploadedAt: "2026-07-24T20:10:00.000Z",
    },
    artifact,
    expected,
  });
  assert.equal(digestOverclaim.correlated, false);
  assert.equal(digestOverclaim.submissionCorrelationReady, false);
  assert.match(digestOverclaim.errors.join(" "), /must not claim an Apple IPA digest/);
});
