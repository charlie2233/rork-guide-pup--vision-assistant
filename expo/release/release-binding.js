const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const CANDIDATE_BINDING_SCHEMA_VERSION = 1;
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;

function requireString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
}

function normalizeSourceRevision(value) {
  const normalized = requireString(value, "GuidePup source revision").toLowerCase();
  if (!SOURCE_REVISION_PATTERN.test(normalized)) {
    throw new Error("GuidePup source revision must be 40-64 hexadecimal characters.");
  }
  return normalized;
}

function normalizeReleaseBinding(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("GuidePup release binding is required.");
  }

  return {
    apiBaseUrl: requireString(value.apiBaseUrl, "GuidePup release API base URL"),
    appEnv: requireString(value.appEnv, "GuidePup release app environment"),
    experimentalTabsEnabled: value.experimentalTabsEnabled === true,
    privacyPolicyUrl: requireString(
      value.privacyPolicyUrl,
      "GuidePup release privacy policy URL",
    ),
    releaseTrack: requireString(value.releaseTrack, "GuidePup release track"),
    schemaVersion: Number(value.schemaVersion),
    supportUrl: requireString(value.supportUrl, "GuidePup release support URL"),
    websiteUrl: requireString(value.websiteUrl, "GuidePup release website URL"),
  };
}

function candidateIdentifierPayload(input) {
  return {
    appVersion: requireString(input.appVersion, "GuidePup app version"),
    buildNumber: requireString(input.buildNumber, "GuidePup build number"),
    bundleIdentifier: requireString(
      input.bundleIdentifier,
      "GuidePup bundle identifier",
    ),
    releaseBinding: normalizeReleaseBinding(input.releaseBinding),
    schemaVersion: CANDIDATE_BINDING_SCHEMA_VERSION,
    sourceRevision: normalizeSourceRevision(input.sourceRevision),
    teamIdentifier: requireString(input.teamIdentifier, "GuidePup team identifier"),
  };
}

function computeGuidePupCandidateIdentifier(input) {
  const payload = candidateIdentifierPayload(input);
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function createGuidePupCandidateBinding(input) {
  const payload = candidateIdentifierPayload(input);
  return {
    appVersion: payload.appVersion,
    buildNumber: payload.buildNumber,
    bundleIdentifier: payload.bundleIdentifier,
    candidateIdentifier: computeGuidePupCandidateIdentifier(input),
    schemaVersion: CANDIDATE_BINDING_SCHEMA_VERSION,
    sourceRevision: payload.sourceRevision,
    teamIdentifier: payload.teamIdentifier,
  };
}

function hasLocalGitMetadata(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return true;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function resolveGuidePupSourceRevision(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  let insideLocalRepository = false;
  try {
    insideLocalRepository =
      execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() === "true";
  } catch {
    if (hasLocalGitMetadata(cwd)) {
      throw new Error(
        "GuidePup local release builds require readable Git metadata.",
      );
    }
  }

  if (!insideLocalRepository) {
    const easRevision = process.env.EAS_BUILD_GIT_COMMIT_HASH;
    if (
      process.env.EAS_BUILD === "true"
      && easRevision
      && String(easRevision).trim()
    ) {
      return normalizeSourceRevision(easRevision);
    }
    throw new Error(
      "GuidePup release builds require a readable local Git repository or EAS_BUILD=true with EAS_BUILD_GIT_COMMIT_HASH in a Git-free remote build context.",
    );
  }

  let sourceRevision;
  try {
    sourceRevision = normalizeSourceRevision(
      execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error(
      "GuidePup local release builds require a readable Git HEAD.",
    );
  }

  let status;
  try {
    status = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
  } catch {
    throw new Error(
      "GuidePup local release builds require a readable Git working tree.",
    );
  }
  if (status.trim().length > 0) {
    throw new Error(
      "GuidePup local release builds require a clean Git working tree.",
    );
  }
  return sourceRevision;
}

module.exports = {
  CANDIDATE_BINDING_SCHEMA_VERSION,
  computeGuidePupCandidateIdentifier,
  createGuidePupCandidateBinding,
  resolveGuidePupSourceRevision,
};
