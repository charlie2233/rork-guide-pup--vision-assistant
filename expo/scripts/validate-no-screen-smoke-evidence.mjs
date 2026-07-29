import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatNoScreenSmokeEvidenceIssues,
  NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH,
  readNoScreenSmokeEvidenceArtifact,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";
import {
  buildExpectedReleaseRuntimeConfigs,
  DEFAULT_RELEASE_CANDIDATE_PATH,
  validateReleaseCandidateEvidenceSourceBinding,
} from "./release-candidate-evidence.mjs";
import { resolveReleaseSourceState } from "./release-source-state.mjs";
import { validateSmokeArtifactContract } from "../../backend/guidepup-api/eval/smoke-contract.mjs";
import { resolveWorkerProvenance } from "../../backend/guidepup-api/eval/run-live-smoke.mjs";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { isPlaceholderValue, launchInputs } = require("../release/launch-inputs");
const DEFAULT_PRODUCTION_SMOKE_PATH = "../backend/guidepup-api/eval/smoke-results-production.latest.json";
const easJson = JSON.parse(fs.readFileSync(path.join(projectDir, "eas.json"), "utf8"));

function readJsonArtifact(relativePath, label) {
  const artifactPath = path.resolve(projectDir, relativePath);
  if (!fs.existsSync(artifactPath)) {
    console.error(`${label} is missing: ${relativePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  } catch {
    console.error(`${label} is not valid JSON: ${relativePath}`);
    process.exit(1);
  }
}

function parseArgs(argv) {
  const args = {
    artifact: NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH,
    backendSmoke: DEFAULT_PRODUCTION_SMOKE_PATH,
    candidate: DEFAULT_RELEASE_CANDIDATE_PATH,
    installationSource: "ad-hoc",
    participantRole: "internal-tester",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact") {
      args.artifact = argv[index + 1];
      index += 1;
    } else if (arg === "--backend-smoke") {
      args.backendSmoke = argv[index + 1];
      index += 1;
    } else if (arg === "--candidate") {
      args.candidate = argv[index + 1];
      index += 1;
    } else if (arg === "--installation-source") {
      args.installationSource = argv[index + 1];
      index += 1;
    } else if (arg === "--participant-role") {
      args.participantRole = argv[index + 1];
      index += 1;
    }
  }

  if (!new Set(["ad-hoc", "testflight"]).has(args.installationSource)) {
    console.error(
      `No-screen installation source must be ad-hoc or testflight, found: ${args.installationSource}`,
    );
    process.exit(1);
  }
  if (!new Set(["internal-tester", "blind-participant"]).has(args.participantRole)) {
    console.error(
      `No-screen participant role must be internal-tester or blind-participant, found: ${args.participantRole}`,
    );
    process.exit(1);
  }
  if (
    args.installationSource === "testflight"
    && args.participantRole !== "blind-participant"
  ) {
    console.error(
      "TestFlight no-screen evidence requires participant role blind-participant.",
    );
    process.exit(1);
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
let sourceState;
try {
  sourceState = resolveReleaseSourceState({ cwd: path.resolve(projectDir, "..") });
} catch (error) {
  console.error(`Release source validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const candidate = readJsonArtifact(args.candidate, "Release candidate evidence");
const candidateValidation = validateReleaseCandidateEvidenceSourceBinding(candidate, {
  appVersion: launchInputs.iosMarketingVersion,
  buildNumber: launchInputs.iosBuildNumber,
  bundleIdentifier: launchInputs.iosBundleIdentifier,
  releaseRuntimeConfigs: buildExpectedReleaseRuntimeConfigs(easJson),
  sourceRevision: sourceState.sourceRevision,
  teamIdentifier: launchInputs.appleTeamId,
});
if (!candidateValidation.valid) {
  console.error("Release candidate evidence is not structurally source-bound.");
  console.error(candidateValidation.errors.join("\n"));
  process.exit(1);
}
if (
  args.installationSource === "testflight"
  && !new Set(["testflight", "store"]).has(candidate.release.buildProfile)
) {
  console.error(
    `TestFlight installation evidence requires a testflight or store candidate, found build profile: ${candidate.release.buildProfile ?? "missing"}`,
  );
  process.exit(1);
}

const backendSmoke = readJsonArtifact(args.backendSmoke, "Production backend smoke evidence");
const backendSmokeValidation = validateSmokeArtifactContract(backendSmoke, {
  expectedApiUrl: launchInputs.productionApiBaseUrl,
  expectedEnvironment: "production",
  expectedModel: launchInputs.productionVisionModel,
  expectedPromptVersion: launchInputs.productionPromptVersion,
  expectedSourceRevision: sourceState.sourceRevision,
});
if (!backendSmokeValidation.valid) {
  console.error("Production backend smoke evidence is not launch-valid.");
  console.error(`Missing: ${backendSmokeValidation.missing.join(", ") || "none"}`);
  console.error(`Invalid: ${backendSmokeValidation.invalid.join(", ") || "none"}`);
  process.exit(1);
}

let activeWorkerProvenance;
try {
  activeWorkerProvenance = resolveWorkerProvenance("production", sourceState.sourceRevision);
} catch {
  console.error(
    "Production backend smoke evidence cannot be accepted because the active production Worker could not be verified.",
  );
  process.exit(1);
}

const activeWorkerMismatches = [
  ["workerDeploymentId", backendSmoke.provenance?.workerDeploymentId],
  ["workerVersionId", backendSmoke.provenance?.workerVersionId],
  ["workerVersionCreatedAt", backendSmoke.provenance?.workerVersionCreatedAt],
]
  .filter(([field, value]) => value !== activeWorkerProvenance[field])
  .map(([field]) => field);

if (activeWorkerMismatches.length > 0) {
  console.error(
    `Production backend smoke evidence does not match the active production Worker: ${activeWorkerMismatches.join(", ")}.`,
  );
  process.exit(1);
}

const artifact = readNoScreenSmokeEvidenceArtifact(projectDir, args.artifact);

if (!artifact) {
  console.error(`No-screen smoke evidence artifact is missing: ${args.artifact}`);
  console.error("Run the real-iPhone no-screen validation and write sanitized evidence before TestFlight.");
  process.exit(1);
}

const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
  expectedApiBaseUrl: launchInputs.productionApiBaseUrl,
  expectedApiEnvironment: "production",
  expectedAppVersion: launchInputs.iosMarketingVersion,
  expectedBackendSmokeArtifact: backendSmoke,
  expectedBuildNumber: launchInputs.iosBuildNumber,
  expectedBuildProfile: candidate.release.buildProfile,
  expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
    ? undefined
    : launchInputs.iosBundleIdentifier,
  expectedCandidateBinarySha256: candidate.archive.binarySha256,
  expectedCandidateIdentifier: candidate.release.candidateBinding.candidateIdentifier,
  expectedCandidateIpaSha256: candidate.ipa.sha256,
  expectedValidationIpaSha256: candidate.validationIpa.sha256,
  expectedCandidateGeneratedAt: candidate.generatedAt,
  expectedInstallationSource: args.installationSource,
  expectedParticipantRole: args.participantRole,
  expectedPromptVersion: launchInputs.productionPromptVersion,
  expectedReleaseTrack: candidate.release.evidenceTrack,
  expectedSourceRevision: sourceState.sourceRevision,
  expectedVisionModel: launchInputs.productionVisionModel,
  requireCandidateBinding: true,
});

if (!result.valid) {
  console.error("No-screen smoke evidence artifact is not launch-valid.");
  console.error(formatNoScreenSmokeEvidenceIssues(result));
  process.exit(1);
}

console.log(`No-screen smoke evidence passed: ${args.artifact}`);
