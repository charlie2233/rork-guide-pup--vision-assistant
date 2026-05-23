import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatNoScreenSmokeEvidenceIssues,
  NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH,
  readNoScreenSmokeEvidenceArtifact,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { isPlaceholderValue, launchInputs } = require("../release/launch-inputs");

function parseArgs(argv) {
  const args = {
    artifact: NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact") {
      args.artifact = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const artifact = readNoScreenSmokeEvidenceArtifact(projectDir, args.artifact);

if (!artifact) {
  console.error(`No-screen smoke evidence artifact is missing: ${args.artifact}`);
  console.error("Run the real-iPhone no-screen validation and write sanitized evidence before TestFlight.");
  process.exit(1);
}

const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
  expectedApiBaseUrl: launchInputs.productionApiBaseUrl,
  expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
    ? undefined
    : launchInputs.iosBundleIdentifier,
  expectedPromptVersion: launchInputs.productionPromptVersion,
  expectedVisionModel: launchInputs.productionVisionModel,
});

if (!result.valid) {
  console.error("No-screen smoke evidence artifact is not launch-valid.");
  console.error(formatNoScreenSmokeEvidenceIssues(result));
  process.exit(1);
}

console.log(`No-screen smoke evidence passed: ${args.artifact}`);
