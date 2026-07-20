import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const evalDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(evalDir, "..");
const repoDir = path.resolve(backendDir, "../..");
const validEnvironments = new Set(["staging", "production"]);
const gitRevisionPattern = /^[0-9a-f]{40,64}$/;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function parseDeployArgs(argv) {
  const envIndex = argv.indexOf("--env");
  return { env: envIndex >= 0 ? argv[envIndex + 1] : undefined };
}

export function buildWranglerDeployArgs(env, sourceRevision) {
  return [
    "wrangler",
    "deploy",
    "--env",
    env,
    "--strict",
    "--message",
    `source-revision:${sourceRevision}`,
    "--var",
    `SOURCE_REVISION:${sourceRevision}`,
  ];
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd || backendDir,
    encoding: options.encoding,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: options.stdio,
  });
}

function resolveGitRevision(commandRunner = run) {
  const result = commandRunner(
    "git",
    ["rev-parse", "--verify", "HEAD"],
    { cwd: repoDir, encoding: "utf8" },
  );
  const revision = result.status === 0 ? result.stdout.trim().toLowerCase() : undefined;
  assert(gitRevisionPattern.test(revision || ""), "The current Git source revision could not be resolved.");
  return revision;
}

export function assertBackendSourceIsClean(commandRunner = run) {
  const status = commandRunner(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", "backend/guidepup-api"],
    { cwd: repoDir, encoding: "utf8" },
  );
  assert(status.status === 0, "Could not verify the backend Git working tree before deployment.");
  assert(
    status.stdout.trim() === "",
    "Backend source has uncommitted changes. Commit the exact Worker source before a provenanced deployment.",
  );
}

function runChecked(command, args, description) {
  const result = run(command, args, { stdio: "inherit" });
  assert(result.status === 0, `${description} failed.`);
}

async function main() {
  const { env } = parseDeployArgs(process.argv.slice(2));
  assert(validEnvironments.has(env), "Use --env staging or --env production.");
  const sourceRevision = resolveGitRevision();
  assertBackendSourceIsClean();

  runChecked(
    process.execPath,
    ["scripts/verify-required-secrets.mjs", "--env", env],
    `${env} secret-name preflight`,
  );
  runChecked(
    process.platform === "win32" ? "npx.cmd" : "npx",
    buildWranglerDeployArgs(env, sourceRevision),
    `${env} Worker deployment`,
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
