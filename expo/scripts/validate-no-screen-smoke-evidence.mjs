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
  DEFAULT_RELEASE_CANDIDATE_PATH,
  validateReleaseCandidateEvidence,
} from "./release-candidate-evidence.mjs";
import { resolveReleaseSourceState } from "./release-source-state.mjs";
import { validateSmokeArtifactContract } from "../../backend/guidepup-api/eval/smoke-contract.mjs";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { isPlaceholderValue, launchInputs } = require("../release/launch-inputs");
const DEFAULT_PRODUCTION_SMOKE_PATH = "../backend/guidepup-api/eval/smoke-results-production.latest.json";

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
    track: "testflight",
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
    } else if (arg === "--track") {
      args.track = argv[index + 1];
      index += 1;
    }
  }

  if (!new Set(["store", "testflight"]).has(args.track)) {
    console.error(`No-screen validation track must be testflight or store, found: ${args.track}`);
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
const candidateValidation = validateReleaseCandidateEvidence(candidate, {
  appVersion: launchInputs.iosMarketingVersion,
  buildNumber: launchInputs.iosBuildNumber,
  bundleIdentifier: launchInputs.iosBundleIdentifier,
  sourceRevision: sourceState.sourceRevision,
  teamIdentifier: launchInputs.appleTeamId,
});
if (!candidateValidation.valid) {
  console.error("Release candidate evidence is not launch-valid.");
  console.error(candidateValidation.errors.join("\n"));
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
  expectedBuildProfile: args.track,
  expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
    ? undefined
    : launchInputs.iosBundleIdentifier,
  expectedCandidateBinarySha256: candidate.archive.binarySha256,
  expectedPromptVersion: launchInputs.productionPromptVersion,
  expectedReleaseTrack: args.track,
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
