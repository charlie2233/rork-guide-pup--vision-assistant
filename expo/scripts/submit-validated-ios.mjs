import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RELEASE_CANDIDATE_PATH,
} from "./release-candidate-evidence.mjs";
import {
  createIosSubmissionEvidence,
  DEFAULT_IOS_SUBMISSION_ARTIFACT_PATH,
  writeIosSubmissionEvidence,
} from "./ios-submission-evidence.mjs";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(import.meta.url);
const { launchInputs } = require("../release/launch-inputs.js");
export const PINNED_EAS_CLI_PACKAGE = "eas-cli@21.2.0";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [name, inlineValue] = argument.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[name] = inlineValue;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}.`);
    }
    values[name] = value;
    index += 1;
  }
  return values;
}

function requireValue(values, name) {
  const value = values[name]?.trim();
  if (!value) {
    throw new Error(`Missing required --${name}.`);
  }
  return value;
}

function hashFile(filePath) {
  return createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

export function snapshotIpa(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error("Validated IPA path is not a file.");
  }
  return {
    device: stat.dev,
    inode: stat.ino,
    modifiedAtMs: stat.mtimeMs,
    sha256: hashFile(filePath),
    size: stat.size,
  };
}

export function ipaSnapshotsMatch(left, right) {
  return left.device === right.device
    && left.inode === right.inode
    && left.modifiedAtMs === right.modifiedAtMs
    && left.sha256 === right.sha256
    && left.size === right.size;
}

export function buildEasSubmitArgs({ ipaPath, track }) {
  if (!["store", "testflight"].includes(track)) {
    throw new Error("Submission track must be testflight or store.");
  }
  return [
    "--yes",
    PINNED_EAS_CLI_PACKAGE,
    "submit",
    "--profile",
    track,
    "--platform",
    "ios",
    "--path",
    ipaPath,
    "--non-interactive",
    "--wait",
  ];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? projectDir,
    encoding: "utf8",
    env: process.env,
    stdio: options.stdio ?? "inherit",
  });
}

export function validateCandidateIpaHash(ipaPath, candidateArtifact) {
  const actualSha256 = hashFile(ipaPath);
  if (candidateArtifact?.ipa?.sha256 !== actualSha256) {
    throw new Error(
      "Exact IPA SHA-256 does not match candidate-build.latest.json.",
    );
  }
  return actualSha256;
}

export function runValidatedSubmission({
  appStoreConnectAppId = launchInputs.ascAppId,
  archivePath,
  attemptEvidencePath = path.resolve(
    projectDir,
    DEFAULT_IOS_SUBMISSION_ARTIFACT_PATH,
  ),
  candidateArtifactPath = path.resolve(
    projectDir,
    DEFAULT_RELEASE_CANDIDATE_PATH,
  ),
  commandRunner = run,
  ipaPath,
  now = () => new Date(),
  temporaryRoot = os.tmpdir(),
  track,
  validationIpaPath,
}) {
  if (typeof validationIpaPath !== "string" || !validationIpaPath.trim()) {
    throw new Error(
      "A separately exported installable validation twin IPA is required.",
    );
  }
  const resolvedArchivePath = path.resolve(archivePath);
  const resolvedIpaPath = path.resolve(ipaPath);
  const resolvedValidationIpaPath = path.resolve(validationIpaPath);
  if (!fs.statSync(resolvedValidationIpaPath).isFile()) {
    throw new Error("Validation twin IPA path is not a file.");
  }
  const candidateArtifact = JSON.parse(
    fs.readFileSync(candidateArtifactPath, "utf8"),
  );
  validateCandidateIpaHash(resolvedIpaPath, candidateArtifact);
  const originalBeforeCopy = snapshotIpa(resolvedIpaPath);
  const privateDirectory = fs.mkdtempSync(
    path.join(path.resolve(temporaryRoot), "guidepup-ios-submit-"),
  );
  fs.chmodSync(privateDirectory, 0o700);
  const privateIpaPath = path.join(
    privateDirectory,
    path.basename(resolvedIpaPath),
  );

  try {
    fs.copyFileSync(
      resolvedIpaPath,
      privateIpaPath,
      fs.constants.COPYFILE_EXCL,
    );
    fs.chmodSync(privateIpaPath, 0o400);
    const originalAfterCopy = snapshotIpa(resolvedIpaPath);
    if (!ipaSnapshotsMatch(originalBeforeCopy, originalAfterCopy)) {
      throw new Error(
        "Validated IPA changed while the private upload copy was created.",
      );
    }
    validateCandidateIpaHash(privateIpaPath, candidateArtifact);
    const beforePreflight = snapshotIpa(privateIpaPath);
    const preflight = commandRunner(
      process.execPath,
      [
        path.resolve(projectDir, "scripts/release-preflight.mjs"),
        "--track",
        track,
        "--archive",
        resolvedArchivePath,
        "--ipa",
        privateIpaPath,
        "--validation-ipa",
        resolvedValidationIpaPath,
      ],
      { cwd: projectDir, stdio: "inherit" },
    );
    if (preflight.status !== 0) {
      throw new Error("Release preflight failed; IPA was not uploaded.");
    }
    const beforeUpload = snapshotIpa(privateIpaPath);
    if (!ipaSnapshotsMatch(beforePreflight, beforeUpload)) {
      throw new Error(
        "Private upload copy changed after preflight; IPA was not uploaded.",
      );
    }

    const attemptStartedAt = now();
    const submission = commandRunner(
      "npx",
      buildEasSubmitArgs({ ipaPath: privateIpaPath, track }),
      { cwd: projectDir, stdio: "inherit" },
    );
    if (submission.status !== 0) {
      throw new Error("EAS submission failed.");
    }
    const attemptCompletedAt = now();
    const afterUpload = snapshotIpa(privateIpaPath);
    if (!ipaSnapshotsMatch(beforeUpload, afterUpload)) {
      throw new Error(
        "Private upload copy changed during the EAS attempt; do not treat the attempt as valid Apple upload evidence.",
      );
    }
    const attemptEvidence = createIosSubmissionEvidence({
      appStoreConnectAppId,
      attemptCompletedAt,
      attemptStartedAt,
      candidateArtifact,
      generatedAt: attemptCompletedAt,
      track,
    });
    writeIosSubmissionEvidence(attemptEvidencePath, attemptEvidence);
    return {
      attemptCompleted: true,
      attemptEvidence,
      ipaSha256: afterUpload.sha256,
      track,
    };
  } finally {
    fs.rmSync(privateDirectory, { force: true, recursive: true });
  }
}

function isCliEntryPoint() {
  return process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  try {
    const values = parseArgs(process.argv.slice(2));
    const result = runValidatedSubmission({
      archivePath: requireValue(values, "archive"),
      ipaPath: requireValue(values, "ipa"),
      track: requireValue(values, "track"),
      validationIpaPath: requireValue(values, "validation-ipa"),
    });
    process.stdout.write(
      `Local ${result.track} IPA upload attempt completed for SHA-256 ${result.ipaSha256}; independent App Store Connect correlation is still required.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Validated iOS submission failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
