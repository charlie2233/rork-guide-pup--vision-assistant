import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  findUnexpectedFields,
  validateEvidencePrivacy,
} from "./evidence-privacy.mjs";

export const IOS_SUBMISSION_ARTIFACT_TYPE =
  "guidepup-ios-local-upload-attempt";
export const IOS_SUBMISSION_ARTIFACT_VERSION = 2;
export const IOS_SUBMISSION_ATTEMPT_METHOD =
  "eas-submit-private-copy-local-attempt";
export const DEFAULT_IOS_SUBMISSION_ARTIFACT_PATH =
  "release/ios-submission.latest.json";
export const IOS_SUBMISSION_CORRELATION_BASIS =
  "app-id-version-build-uploaded-date";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const ALLOWED_TRACKS = new Set(["store", "testflight"]);
const MAX_UPLOAD_DURATION_MS = 2 * 60 * 60 * 1000;
const GENERATED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;
const IOS_SUBMISSION_EVIDENCE_SHAPE = {
  appleIpaDigestAvailable: true,
  appleReceiptProven: true,
  appStoreConnectAppIdSha256: true,
  appVersion: true,
  artifactType: true,
  artifactVersion: true,
  attemptCompletedAt: true,
  attemptMethod: true,
  attemptStartedAt: true,
  buildNumber: true,
  bundleIdentifier: true,
  candidateIdentifier: true,
  correlationBasis: true,
  correlationRequired: true,
  generatedAt: true,
  localAttemptCompleted: true,
  localCandidateIpaSha256: true,
  sourceRevision: true,
  track: true,
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function candidateExpected(candidateArtifact, appStoreConnectAppId, track) {
  const normalizedAppStoreConnectAppId =
    String(appStoreConnectAppId ?? "").trim();
  if (!normalizedAppStoreConnectAppId) {
    throw new Error("App Store Connect app ID is required.");
  }
  return {
    appStoreConnectAppIdSha256: createHash("sha256")
      .update(normalizedAppStoreConnectAppId)
      .digest("hex"),
    appVersion: String(candidateArtifact?.ipa?.appVersion ?? "").trim(),
    buildNumber: String(candidateArtifact?.ipa?.buildNumber ?? "").trim(),
    bundleIdentifier:
      String(candidateArtifact?.ipa?.bundleIdentifier ?? "").trim(),
    candidateIdentifier:
      String(
        candidateArtifact?.release?.candidateBinding?.candidateIdentifier
          ?? "",
      ).trim(),
    localCandidateIpaSha256:
      String(candidateArtifact?.ipa?.sha256 ?? "").trim(),
    sourceRevision:
      String(candidateArtifact?.sourceRevision ?? "").trim(),
    track,
  };
}

export function validateIosSubmissionEvidence(artifact, expected = {}) {
  const errors = [];
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(
    artifact && typeof artifact === "object" && !Array.isArray(artifact),
    "artifact must be an object",
  );
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { errors, valid: false };
  }

  check(
    artifact.artifactType === IOS_SUBMISSION_ARTIFACT_TYPE,
    "artifactType is invalid",
  );
  check(
    artifact.artifactVersion === IOS_SUBMISSION_ARTIFACT_VERSION,
    "artifactVersion is invalid",
  );
  check(isIsoTimestamp(artifact.generatedAt), "generatedAt is invalid");
  check(ALLOWED_TRACKS.has(artifact.track), "track is invalid");
  check(
    artifact.attemptMethod === IOS_SUBMISSION_ATTEMPT_METHOD,
    "attemptMethod is invalid",
  );
  check(
    artifact.localAttemptCompleted === true,
    "localAttemptCompleted must be true",
  );
  check(
    artifact.appleReceiptProven === false,
    "appleReceiptProven must be false",
  );
  check(
    artifact.appleIpaDigestAvailable === false,
    "appleIpaDigestAvailable must be false",
  );
  check(
    artifact.correlationRequired === true,
    "correlationRequired must be true",
  );
  check(
    artifact.correlationBasis === IOS_SUBMISSION_CORRELATION_BASIS,
    "correlationBasis is invalid",
  );
  check(
    SOURCE_REVISION_PATTERN.test(artifact.sourceRevision ?? ""),
    "sourceRevision is invalid",
  );
  check(
    SHA256_PATTERN.test(artifact.candidateIdentifier ?? ""),
    "candidateIdentifier is invalid",
  );
  check(
    SHA256_PATTERN.test(artifact.localCandidateIpaSha256 ?? ""),
    "localCandidateIpaSha256 is invalid",
  );
  for (const field of [
    "appVersion",
    "buildNumber",
    "bundleIdentifier",
  ]) {
    check(isNonEmptyString(artifact[field]), `${field} is required`);
  }
  check(
    SHA256_PATTERN.test(artifact.appStoreConnectAppIdSha256 ?? ""),
    "appStoreConnectAppIdSha256 is invalid",
  );
  check(
    isIsoTimestamp(artifact.attemptStartedAt),
    "attemptStartedAt is invalid",
  );
  check(
    isIsoTimestamp(artifact.attemptCompletedAt),
    "attemptCompletedAt is invalid",
  );

  const uploadStartedAt = Date.parse(artifact.attemptStartedAt);
  const uploadCompletedAt = Date.parse(artifact.attemptCompletedAt);
  const generatedAt = Date.parse(artifact.generatedAt);
  if (
    Number.isFinite(uploadStartedAt)
    && Number.isFinite(uploadCompletedAt)
  ) {
    check(
      uploadCompletedAt >= uploadStartedAt,
      "attemptCompletedAt must not precede attemptStartedAt",
    );
    check(
      uploadCompletedAt - uploadStartedAt <= MAX_UPLOAD_DURATION_MS,
      "local upload-attempt duration exceeds the allowed evidence window",
    );
  }
  if (
    Number.isFinite(generatedAt)
    && Number.isFinite(uploadCompletedAt)
  ) {
    check(
      generatedAt >= uploadCompletedAt - GENERATED_AT_CLOCK_SKEW_MS
        && generatedAt <= uploadCompletedAt + GENERATED_AT_CLOCK_SKEW_MS,
      "generatedAt must be near attemptCompletedAt",
    );
  }

  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined) {
      check(
        artifact[field] === value,
        `${field} does not match the local candidate upload attempt`,
      );
    }
  }

  const unexpectedFields = findUnexpectedFields(
    artifact,
    IOS_SUBMISSION_EVIDENCE_SHAPE,
  );
  if (unexpectedFields.length > 0) {
    errors.push(
      `artifact contains unexpected fields: ${unexpectedFields.join(", ")}`,
    );
  }
  const privacy = validateEvidencePrivacy(artifact);
  if (privacy.disallowedKeys.length > 0) {
    errors.push(
      `artifact contains disallowed keys: ${privacy.disallowedKeys.join(", ")}`,
    );
  }
  if (privacy.sensitivePatterns.length > 0) {
    errors.push(
      `artifact contains sensitive patterns: ${privacy.sensitivePatterns.join(", ")}`,
    );
  }
  return { errors, valid: errors.length === 0 };
}

export function createIosSubmissionEvidence({
  appStoreConnectAppId,
  candidateArtifact,
  generatedAt,
  track,
  attemptCompletedAt,
  attemptStartedAt,
  uploadCompletedAt,
  uploadStartedAt,
}) {
  const expected = candidateExpected(
    candidateArtifact,
    appStoreConnectAppId,
    track,
  );
  const artifact = {
    appleIpaDigestAvailable: false,
    appleReceiptProven: false,
    appStoreConnectAppIdSha256:
      expected.appStoreConnectAppIdSha256,
    appVersion: expected.appVersion,
    artifactType: IOS_SUBMISSION_ARTIFACT_TYPE,
    artifactVersion: IOS_SUBMISSION_ARTIFACT_VERSION,
    attemptCompletedAt: new Date(
      attemptCompletedAt ?? uploadCompletedAt,
    ).toISOString(),
    attemptMethod: IOS_SUBMISSION_ATTEMPT_METHOD,
    attemptStartedAt: new Date(
      attemptStartedAt ?? uploadStartedAt,
    ).toISOString(),
    buildNumber: expected.buildNumber,
    bundleIdentifier: expected.bundleIdentifier,
    candidateIdentifier: expected.candidateIdentifier,
    correlationBasis: IOS_SUBMISSION_CORRELATION_BASIS,
    correlationRequired: true,
    generatedAt: new Date(generatedAt).toISOString(),
    localAttemptCompleted: true,
    localCandidateIpaSha256: expected.localCandidateIpaSha256,
    sourceRevision: expected.sourceRevision,
    track,
  };
  const validation = validateIosSubmissionEvidence(artifact, expected);
  if (!validation.valid) {
    throw new Error(
      `iOS submission evidence is invalid: ${validation.errors.join("; ")}`,
    );
  }
  return artifact;
}

export function writeIosSubmissionEvidence(
  outputPath,
  artifact,
  expected = {},
) {
  const validation = validateIosSubmissionEvidence(artifact, expected);
  if (!validation.valid) {
    throw new Error(
      `iOS submission evidence is invalid: ${validation.errors.join("; ")}`,
    );
  }
  const resolvedOutputPath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  const temporaryPath =
    `${resolvedOutputPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify(artifact, null, 2)}\n`,
      { flag: "wx", mode: 0o600 },
    );
    fs.renameSync(temporaryPath, resolvedOutputPath);
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
  return resolvedOutputPath;
}

export function expectedIosSubmissionEvidence(
  candidateArtifact,
  appStoreConnectAppId,
  track,
) {
  return candidateExpected(candidateArtifact, appStoreConnectAppId, track);
}

export function assessIosSubmissionEvidence({
  appStoreConnectBuildEvidence,
  artifact,
  expected = {},
  clockSkewMs = 5 * 60 * 1000,
  processingLagMs = 15 * 60 * 1000,
}) {
  const validation = validateIosSubmissionEvidence(artifact, expected);
  const errors = [...validation.errors];
  if (
    !appStoreConnectBuildEvidence
    || typeof appStoreConnectBuildEvidence !== "object"
    || Array.isArray(appStoreConnectBuildEvidence)
  ) {
    errors.push(
      "independent authenticated App Store Connect build correlation is required",
    );
    return {
      correlated: false,
      errors,
      exactCandidateReceiptProven: false,
      submissionCorrelationReady: false,
    };
  }
  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(
    appStoreConnectBuildEvidence.source === "app-store-connect-api",
    "App Store Connect build evidence source is invalid",
  );
  check(
    appStoreConnectBuildEvidence.processingState === "VALID"
      && appStoreConnectBuildEvidence.expired === false,
    "App Store Connect build must be unexpired and VALID",
  );
  check(
    appStoreConnectBuildEvidence.correlationBasis
      === IOS_SUBMISSION_CORRELATION_BASIS,
    "App Store Connect correlation basis is invalid",
  );
  check(
    appStoreConnectBuildEvidence.ipaDigestAvailable === false,
    "App Store Connect evidence must not claim an Apple IPA digest",
  );
  check(
    isNonEmptyString(appStoreConnectBuildEvidence.buildRecordIdentifier),
    "App Store Connect build record identifier is required",
  );
  const correlatedAppIdSha256 = createHash("sha256")
    .update(String(appStoreConnectBuildEvidence.appId ?? ""))
    .digest("hex");
  check(
    correlatedAppIdSha256 === artifact?.appStoreConnectAppIdSha256,
    "App Store Connect app ID does not correlate",
  );
  check(
    String(appStoreConnectBuildEvidence.buildNumber ?? "")
      === artifact?.buildNumber,
    "App Store Connect build number does not correlate",
  );
  check(
    String(appStoreConnectBuildEvidence.marketingVersion ?? "")
      === artifact?.appVersion,
    "App Store Connect marketing version does not correlate",
  );
  const uploadedAt = Date.parse(appStoreConnectBuildEvidence.uploadedAt);
  const attemptStartedAt = Date.parse(artifact?.attemptStartedAt);
  const attemptCompletedAt = Date.parse(artifact?.attemptCompletedAt);
  check(
    Number.isFinite(uploadedAt)
      && Number.isFinite(attemptStartedAt)
      && Number.isFinite(attemptCompletedAt)
      && uploadedAt >= attemptStartedAt - clockSkewMs
      && uploadedAt <= attemptCompletedAt + processingLagMs,
    "App Store Connect uploadedAt does not correlate with the local upload-attempt window",
  );
  return {
    correlated: errors.length === 0,
    errors,
    exactCandidateReceiptProven: false,
    submissionCorrelationReady: errors.length === 0,
  };
}
