import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveReleaseSourceState } from "./release-source-state.mjs";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(projectDir, "..");
const ALLOWED_PROFILES = new Set([
  "preview",
  "store",
  "store-validation",
  "testflight",
]);
export const PINNED_EAS_CLI_PACKAGE = "eas-cli@21.2.0";

function parseProfile(argv) {
  const profileIndex = argv.indexOf("--profile");
  if (profileIndex !== -1) {
    return argv[profileIndex + 1];
  }
  const inlineProfile = argv.find((arg) => arg.startsWith("--profile="));
  return inlineProfile?.slice("--profile=".length);
}

export function buildEasBuildArgs(profile) {
  if (!ALLOWED_PROFILES.has(profile)) {
    throw new Error(
      "iOS build profile must be preview, testflight, store, or store-validation.",
    );
  }
  return [
    "--yes",
    PINNED_EAS_CLI_PACKAGE,
    "build",
    "--profile",
    profile,
    "--platform",
    "ios",
    "--non-interactive",
    "--wait",
  ];
}

function defaultCommandRunner(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd ?? projectDir,
    encoding: "utf8",
    env: process.env,
    stdio: options.stdio ?? "inherit",
  });
}

function requireStrictlyCleanSource(resolveSourceState) {
  const state = resolveSourceState({ cwd: repositoryRoot });
  if (state.allowedGeneratedChanges.length > 0) {
    throw new Error(
      "Validated EAS builds require a completely clean committed source snapshot, including generated evidence.",
    );
  }
  return state;
}

export function runValidatedIosBuild({
  commandRunner = defaultCommandRunner,
  profile,
  resolveSourceState = resolveReleaseSourceState,
}) {
  const before = requireStrictlyCleanSource(resolveSourceState);
  const result = commandRunner(
    "npx",
    buildEasBuildArgs(profile),
    { cwd: projectDir, stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error("EAS iOS build failed.");
  }
  const after = requireStrictlyCleanSource(resolveSourceState);
  if (
    after.sourceRevision !== before.sourceRevision
    || after.repositoryRoot !== before.repositoryRoot
  ) {
    throw new Error(
      "Source revision changed while the EAS iOS build was running; do not use that build.",
    );
  }
  return {
    buildCompleted: true,
    profile,
    sourceRevision: after.sourceRevision,
  };
}

function isCliEntryPoint() {
  return process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  try {
    const result = runValidatedIosBuild({
      profile: parseProfile(process.argv.slice(2)),
    });
    process.stdout.write(
      `Validated ${result.profile} EAS iOS build completed for source ${result.sourceRevision}.\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Validated iOS build failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
