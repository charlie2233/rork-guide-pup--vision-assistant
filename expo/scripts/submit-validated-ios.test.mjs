import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildEasSubmitArgs,
  ipaSnapshotsMatch,
  PINNED_EAS_CLI_PACKAGE,
  runValidatedSubmission,
  snapshotIpa,
} from "./submit-validated-ios.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "guidepup-submit-"),
  );
  t.after(() =>
    fs.rmSync(root, { force: true, recursive: true }),
  );
  const archivePath = path.join(root, "GuidePup.xcarchive");
  const ipaPath = path.join(root, "GuidePup.ipa");
  const validationIpaPath = path.join(root, "GuidePup-validation.ipa");
  const candidateArtifactPath = path.join(root, "candidate.json");
  const attemptEvidencePath = path.join(root, "ios-submission.json");
  fs.mkdirSync(archivePath);
  fs.writeFileSync(ipaPath, "exact candidate ipa");
  fs.writeFileSync(validationIpaPath, "installable validation twin ipa");
  const ipaSha256 = createHash("sha256")
    .update(fs.readFileSync(ipaPath))
    .digest("hex");
  fs.writeFileSync(
    candidateArtifactPath,
    JSON.stringify({
      ipa: {
        appVersion: "1.0.0",
        buildNumber: "4",
        bundleIdentifier: "app.rork.guide-pup-vision-assist",
        sha256: ipaSha256,
      },
      release: {
        candidateBinding: {
          candidateIdentifier: "b".repeat(64),
        },
      },
      sourceRevision: "c".repeat(40),
    }),
  );
  return {
    archivePath,
    attemptEvidencePath,
    candidateArtifactPath,
    ipaPath,
    ipaSha256,
    root,
    temporaryRoot: root,
    validationIpaPath,
  };
}

test("submission preflights and attempts upload from a read-only private IPA copy", (t) => {
  const candidate = fixture(t);
  const calls = [];
  let privateIpaPath;
  const result = runValidatedSubmission({
    ...candidate,
    commandRunner(command, args) {
      calls.push({ args, command });
      if (command === process.execPath) {
        privateIpaPath = args[args.indexOf("--ipa") + 1];
        assert.notEqual(privateIpaPath, path.resolve(candidate.ipaPath));
        assert.equal(
          fs.readFileSync(privateIpaPath, "utf8"),
          "exact candidate ipa",
        );
        assert.equal(fs.statSync(privateIpaPath).mode & 0o777, 0o400);
        assert.equal(
          args[args.indexOf("--validation-ipa") + 1],
          path.resolve(candidate.validationIpaPath),
        );
      }
      return { status: 0 };
    },
    now: () => new Date("2026-07-24T20:00:00.000Z"),
    track: "testflight",
  });
  assert.equal(result.ipaSha256, candidate.ipaSha256);
  assert.equal(
    result.attemptEvidence.localCandidateIpaSha256,
    candidate.ipaSha256,
  );
  assert.equal(result.attemptEvidence.appleReceiptProven, false);
  assert.equal(result.attemptEvidence.appleIpaDigestAvailable, false);
  assert.deepEqual(calls.map((call) => call.command), [
    process.execPath,
    "npx",
  ]);
  assert.match(calls[0].args[0], /release-preflight\.mjs$/);
  assert.deepEqual(
    calls[1].args,
    buildEasSubmitArgs({
      ipaPath: privateIpaPath,
      track: "testflight",
    }),
  );
  assert.equal(PINNED_EAS_CLI_PACKAGE, "eas-cli@21.2.0");
  assert.deepEqual(calls[1].args.slice(0, 3), [
    "--yes",
    PINNED_EAS_CLI_PACKAGE,
    "submit",
  ]);
  assert.equal(fs.existsSync(privateIpaPath), false);
  assert.equal(fs.existsSync(candidate.attemptEvidencePath), true);
});

test("submission stops before upload when preflight fails", (t) => {
  const candidate = fixture(t);
  const calls = [];
  assert.throws(
    () =>
      runValidatedSubmission({
        ...candidate,
        commandRunner(command) {
          calls.push(command);
          return { status: 1 };
        },
        track: "testflight",
      }),
    /preflight failed; IPA was not uploaded/,
  );
  assert.deepEqual(calls, [process.execPath]);
});

test("submission requires the separately exported validation twin", (t) => {
  const candidate = fixture(t);
  assert.throws(
    () =>
      runValidatedSubmission({
        ...candidate,
        commandRunner() {
          throw new Error("preflight must not run");
        },
        track: "testflight",
        validationIpaPath: undefined,
      }),
    /separately exported installable validation twin IPA is required/,
  );
});

test("submission rejects candidate hash mismatch and file mutation", (t) => {
  const candidate = fixture(t);
  const wrongCandidatePath = path.join(
    path.dirname(candidate.candidateArtifactPath),
    "wrong-candidate.json",
  );
  fs.writeFileSync(
    wrongCandidatePath,
    JSON.stringify({ ipa: { sha256: "f".repeat(64) } }),
  );
  assert.throws(
    () =>
      runValidatedSubmission({
        ...candidate,
        candidateArtifactPath: wrongCandidatePath,
        commandRunner() {
          return { status: 0 };
        },
        track: "testflight",
      }),
    /SHA-256 does not match/,
  );

  let privateIpaPath;
  const sourceMutationResult = runValidatedSubmission({
    ...candidate,
    commandRunner(command, args) {
      if (command === process.execPath) {
        fs.appendFileSync(candidate.ipaPath, "source mutation after copy");
      } else {
        privateIpaPath = args[args.indexOf("--path") + 1];
        assert.equal(
          fs.readFileSync(privateIpaPath, "utf8"),
          "exact candidate ipa",
        );
      }
      return { status: 0 };
    },
    now: () => new Date("2026-07-24T20:00:00.000Z"),
    track: "testflight",
  });
  assert.equal(sourceMutationResult.attemptCompleted, true);
  assert.equal(fs.existsSync(privateIpaPath), false);
});

test("submission rejects mutation of the private upload copy", (t) => {
  const candidate = fixture(t);
  assert.throws(
    () =>
      runValidatedSubmission({
        ...candidate,
        commandRunner(command, args) {
          if (command === "npx") {
            const privateIpaPath = args[args.indexOf("--path") + 1];
            fs.chmodSync(privateIpaPath, 0o600);
            fs.appendFileSync(privateIpaPath, "mutation");
          }
          return { status: 0 };
        },
        now: () => new Date("2026-07-24T20:00:00.000Z"),
        track: "testflight",
      }),
    /Private upload copy changed during the EAS attempt/,
  );
  assert.equal(fs.existsSync(candidate.attemptEvidencePath), false);
});

test("IPA snapshots include identity and content", (t) => {
  const candidate = fixture(t);
  const first = snapshotIpa(candidate.ipaPath);
  const second = snapshotIpa(candidate.ipaPath);
  assert.equal(ipaSnapshotsMatch(first, second), true);
  fs.appendFileSync(candidate.ipaPath, "mutation");
  assert.equal(
    ipaSnapshotsMatch(first, snapshotIpa(candidate.ipaPath)),
    false,
  );
});
