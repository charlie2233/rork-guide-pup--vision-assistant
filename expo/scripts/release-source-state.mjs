import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALLOWED_GENERATED_EVIDENCE_PATHS = new Set([
  "backend/guidepup-api/eval/smoke-results-staging.latest.json",
  "backend/guidepup-api/eval/smoke-results-staging.latest.md",
  "backend/guidepup-api/eval/smoke-results-production.latest.json",
  "backend/guidepup-api/eval/smoke-results-production.latest.md",
  "expo/release/no-screen-smoke.internal.latest.json",
  "expo/release/no-screen-smoke.blind-participant.latest.json",
  "expo/release/no-screen-smoke.testflight.latest.json",
  "expo/release/candidate-build.latest.json",
  "expo/release/ios-submission.latest.json",
]);

const SCREENSHOT_PATH_PATTERN =
  /^expo\/store-assets\/screenshots\/(?!\.)(?!.*\/\.)(?!.*(?:^|\/)\.\.?(?:\/|$)).+\.(?:png|jpe?g)$/i;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40,64}$/i;

function normalizeGitPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isAllowedGeneratedEvidencePath(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || path.isAbsolute(filePath)) {
    return false;
  }

  const normalized = normalizeGitPath(filePath);
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    return false;
  }

  return ALLOWED_GENERATED_EVIDENCE_PATHS.has(normalized) || SCREENSHOT_PATH_PATTERN.test(normalized);
}

function parseNulSeparatedPorcelain(output) {
  const chunks = output.split("\0");
  if (chunks.at(-1) === "") {
    chunks.pop();
  }

  const entries = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const record = chunks[index];
    if (record.length < 4 || record[2] !== " ") {
      throw new Error(`Invalid git status porcelain record at index ${index}.`);
    }

    const status = record.slice(0, 2);
    const entry = {
      path: normalizeGitPath(record.slice(3)),
      status,
    };
    if (/[RC]/.test(status)) {
      index += 1;
      if (index >= chunks.length) {
        throw new Error("Git status rename/copy record is missing its original path.");
      }
      entry.originalPath = normalizeGitPath(chunks[index]);
    }
    entries.push(entry);
  }
  return entries;
}

function unquotePorcelainPath(filePath) {
  if (!filePath.startsWith('"')) {
    return filePath;
  }

  try {
    return JSON.parse(filePath);
  } catch {
    throw new Error(`Invalid quoted git status path: ${filePath}`);
  }
}

function parseLineSeparatedPorcelain(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((record, index) => {
      if (record.length < 4 || record[2] !== " ") {
        throw new Error(`Invalid git status porcelain record at line ${index + 1}.`);
      }

      const status = record.slice(0, 2);
      const rawPath = record.slice(3);
      const renameSeparator = " -> ";
      if (/[RC]/.test(status) && rawPath.includes(renameSeparator)) {
        const [originalPath, currentPath] = rawPath.split(renameSeparator);
        return {
          originalPath: normalizeGitPath(unquotePorcelainPath(originalPath)),
          path: normalizeGitPath(unquotePorcelainPath(currentPath)),
          status,
        };
      }

      return {
        path: normalizeGitPath(unquotePorcelainPath(rawPath)),
        status,
      };
    });
}

export function parseGitStatusPorcelain(output) {
  if (typeof output !== "string") {
    throw new TypeError("Git status porcelain output must be a string.");
  }
  if (output.length === 0) {
    return [];
  }
  return output.includes("\0")
    ? parseNulSeparatedPorcelain(output)
    : parseLineSeparatedPorcelain(output);
}

export function validateReleaseSourceEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("Release source entries must be an array.");
  }

  const allowed = [];
  const disallowed = [];
  for (const entry of entries) {
    const paths = [entry?.path, entry?.originalPath].filter(Boolean);
    const entryAllowed =
      paths.length > 0 &&
      paths.every((filePath) => isAllowedGeneratedEvidencePath(filePath));
    (entryAllowed ? allowed : disallowed).push(entry);
  }

  return {
    allowed,
    disallowed,
    valid: disallowed.length === 0,
  };
}

function defaultCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function runGit(commandRunner, cwd, args) {
  const result = commandRunner("git", args, { cwd });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.stdout;
}

export function resolveReleaseSourceState(options = {}) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const repositoryRoot = runGit(commandRunner, cwd, ["rev-parse", "--show-toplevel"]).trim();
  if (!repositoryRoot || !path.isAbsolute(repositoryRoot)) {
    throw new Error("Git did not return an absolute repository root.");
  }

  const sourceRevision = runGit(commandRunner, repositoryRoot, ["rev-parse", "--verify", "HEAD"])
    .trim()
    .toLowerCase();
  if (!GIT_REVISION_PATTERN.test(sourceRevision)) {
    throw new Error(`Git HEAD is not a 40-64 character hexadecimal revision: ${sourceRevision || "empty"}.`);
  }

  const statusOutput = runGit(commandRunner, repositoryRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "-z",
  ]);
  const entries = parseGitStatusPorcelain(statusOutput);
  const validation = validateReleaseSourceEntries(entries);
  if (!validation.valid) {
    const dirtyPaths = validation.disallowed
      .flatMap((entry) => [entry.path, entry.originalPath].filter(Boolean))
      .join(", ");
    throw new Error(`Release source is dirty outside the generated-evidence allowlist: ${dirtyPaths}.`);
  }

  return {
    allowedGeneratedChanges: validation.allowed,
    repositoryRoot,
    sourceRevision,
  };
}

function isCliEntryPoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  try {
    const state = resolveReleaseSourceState();
    process.stdout.write(`${JSON.stringify({
      allowedGeneratedChanges: state.allowedGeneratedChanges,
      cleanReleaseSource: true,
      sourceRevision: state.sourceRevision,
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Release source validation failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
