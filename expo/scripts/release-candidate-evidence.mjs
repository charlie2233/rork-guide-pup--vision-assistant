import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateEvidencePrivacy } from "./evidence-privacy.mjs";
import { resolveReleaseSourceState } from "./release-source-state.mjs";

export const RELEASE_CANDIDATE_ARTIFACT_VERSION = 1;
export const RELEASE_CANDIDATE_ARTIFACT_TYPE = "guidepup-ios-release-candidate";
export const DEFAULT_RELEASE_CANDIDATE_PATH = "release/candidate-build.latest.json";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const SAFE_ARTIFACT_NAME_PATTERN = /^[^/\\\0]+$/;
const REQUIRED_EXPECTED_FIELDS = [
  "appVersion",
  "buildNumber",
  "bundleIdentifier",
  "sourceRevision",
  "teamIdentifier",
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function defaultCommandRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    input: options.input,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function requireCommand(commandRunner, command, args, options = {}) {
  const result = commandRunner(command, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout || "unknown error").trim()}`,
    );
  }
  return result;
}

function parsePlistJson(commandRunner, xml, label) {
  const result = requireCommand(
    commandRunner,
    "plutil",
    ["-convert", "json", "-o", "-", "--", "-"],
    { input: xml },
  );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} did not convert to valid JSON.`);
  }
}

function readPlist(commandRunner, filePath, label) {
  const result = requireCommand(commandRunner, "plutil", ["-convert", "json", "-o", "-", filePath]);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} did not convert to valid JSON.`);
  }
}

function assertInsideDirectory(parentPath, childPath, label) {
  const relative = path.relative(parentPath, childPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must resolve inside the archive.`);
  }
}

function resolveArchivedAppPath(archivePath, applicationPath, fileExists) {
  if (!isNonEmptyString(applicationPath) || path.isAbsolute(applicationPath)) {
    throw new Error("Archive ApplicationPath must be a relative path.");
  }

  const normalized = applicationPath.replaceAll("\\", "/");
  if (normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("Archive ApplicationPath contains an unsafe path segment.");
  }

  const candidates = normalized.startsWith("Products/")
    ? [path.resolve(archivePath, normalized)]
    : [path.resolve(archivePath, "Products", normalized), path.resolve(archivePath, normalized)];
  const appPath = candidates.find((candidate) => fileExists(candidate));
  if (!appPath) {
    throw new Error("Archive ApplicationPath does not identify an existing app bundle.");
  }
  assertInsideDirectory(archivePath, appPath, "Archived app");
  if (path.extname(appPath) !== ".app") {
    throw new Error("Archive ApplicationPath must identify an .app bundle.");
  }
  return appPath;
}

async function defaultHashFile(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function runGrep(commandRunner, pattern, appPath) {
  const result = commandRunner("grep", ["-aERq", "--", pattern, appPath]);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`Sentry marker scan failed: ${(result.stderr || result.stdout || "unknown error").trim()}`);
  }
  return result.status === 0;
}

function defaultInspectSentryMarkers(appPath, commandRunner) {
  const runtimeModeDisabled = runGrep(
    commandRunner,
    "launchSentryMode[^[:alnum:]]{0,16}disabled",
    appPath,
  );
  const configuredDsnFound = runGrep(
    commandRunner,
    "https://[[:alnum:]]{16,}@[[:alnum:]._-]*sentry[^[:space:]\"']*/[[:digit:]]+",
    appPath,
  );
  return {
    configuredDsnFound,
    runtimeModeDisabled,
  };
}

function normalizeExpected(expected) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) {
    throw new Error("Caller-supplied expected release identity is required.");
  }
  for (const field of REQUIRED_EXPECTED_FIELDS) {
    if (!isNonEmptyString(expected[field])) {
      throw new Error(`Expected release identity is missing ${field}.`);
    }
  }
  if (!SOURCE_REVISION_PATTERN.test(expected.sourceRevision)) {
    throw new Error("Expected sourceRevision must be 40-64 hexadecimal characters.");
  }
  return {
    appVersion: String(expected.appVersion),
    buildNumber: String(expected.buildNumber),
    bundleIdentifier: String(expected.bundleIdentifier),
    sourceRevision: expected.sourceRevision.toLowerCase(),
    teamIdentifier: String(expected.teamIdentifier),
  };
}

function expectEqual(actual, expected, label) {
  if (String(actual ?? "") !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, found ${actual ?? "missing"}.`);
  }
}

function requireFalse(value, label) {
  if (value !== false) {
    throw new Error(`${label} must be false for a distribution candidate.`);
  }
}

function findAbsolutePathValues(value, fieldPath = "artifact") {
  if (typeof value === "string") {
    const looksAbsolute =
      path.isAbsolute(value) ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      /^file:\/\//i.test(value) ||
      /(?:^|[\\/])Users[\\/][^\\/]+[\\/]/.test(value);
    return looksAbsolute ? [fieldPath] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findAbsolutePathValues(item, `${fieldPath}[${index}]`));
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    findAbsolutePathValues(child, `${fieldPath}.${key}`),
  );
}

export function validateReleaseCandidateEvidence(artifact, expectedInput) {
  const errors = [];
  let expected;
  try {
    expected = normalizeExpected(expectedInput);
  } catch (error) {
    return { errors: [error instanceof Error ? error.message : String(error)], valid: false };
  }

  const check = (condition, message) => {
    if (!condition) errors.push(message);
  };
  check(artifact && typeof artifact === "object" && !Array.isArray(artifact), "artifact must be an object");
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { errors, valid: false };
  }

  check(artifact.artifactVersion === RELEASE_CANDIDATE_ARTIFACT_VERSION, "artifactVersion is invalid");
  check(artifact.artifactType === RELEASE_CANDIDATE_ARTIFACT_TYPE, "artifactType is invalid");
  check(isNonEmptyString(artifact.generatedAt) && !Number.isNaN(Date.parse(artifact.generatedAt)), "generatedAt is invalid");
  check(SOURCE_REVISION_PATTERN.test(artifact.sourceRevision ?? ""), "sourceRevision is invalid");
  check(artifact.sourceRevision === expected.sourceRevision, "sourceRevision does not match expected");

  const archive = artifact.archive ?? {};
  check(SAFE_ARTIFACT_NAME_PATTERN.test(archive.name ?? "") && archive.name.endsWith(".xcarchive"), "archive.name must be an artifact name only");
  check(SAFE_ARTIFACT_NAME_PATTERN.test(archive.appName ?? "") && archive.appName.endsWith(".app"), "archive.appName must be an artifact name only");
  check(SAFE_ARTIFACT_NAME_PATTERN.test(archive.binaryName ?? ""), "archive.binaryName must be a file name only");
  check(SHA256_PATTERN.test(archive.binarySha256 ?? ""), "archive.binarySha256 must be 64 lowercase hexadecimal characters");
  check(archive.bundleIdentifier === expected.bundleIdentifier, "archive.bundleIdentifier does not match expected");
  check(archive.appVersion === expected.appVersion, "archive.appVersion does not match expected");
  check(archive.buildNumber === expected.buildNumber, "archive.buildNumber does not match expected");
  check(archive.teamIdentifier === expected.teamIdentifier, "archive.teamIdentifier does not match expected");
  check(archive.applicationIdentifier === `${expected.teamIdentifier}.${expected.bundleIdentifier}`, "archive.applicationIdentifier does not match expected");
  check(archive.getTaskAllow === false, "archive.getTaskAllow must be false");
  check(archive.signing?.codesignVerified === true, "archive signing must be verified");
  check(archive.signing?.certificateClass === "Apple Distribution", "archive signing class must be Apple Distribution");
  check(archive.signing?.teamIdentifier === expected.teamIdentifier, "archive signing team does not match expected");
  check(archive.sentry?.runtimeModeDisabled === true, "archive Sentry runtime-disabled marker is missing");
  check(archive.sentry?.configuredDsnFound === false, "archive contains a configured Sentry DSN marker");

  if (artifact.ipa !== undefined) {
    check(SAFE_ARTIFACT_NAME_PATTERN.test(artifact.ipa?.name ?? "") && artifact.ipa.name.endsWith(".ipa"), "ipa.name must be an artifact name only");
    check(SHA256_PATTERN.test(artifact.ipa?.sha256 ?? ""), "ipa.sha256 must be 64 lowercase hexadecimal characters");
  }

  check(artifact.privacy?.containsAbsolutePaths === false, "privacy.containsAbsolutePaths must be false");
  check(artifact.privacy?.containsAppContent === false, "privacy.containsAppContent must be false");
  check(artifact.privacy?.containsCredentials === false, "privacy.containsCredentials must be false");
  check(artifact.privacy?.containsDeviceIdentifiers === false, "privacy.containsDeviceIdentifiers must be false");
  check(artifact.privacy?.containsProfiles === false, "privacy.containsProfiles must be false");
  check(artifact.privacy?.containsSignedUrls === false, "privacy.containsSignedUrls must be false");

  const pathLeaks = findAbsolutePathValues(artifact);
  if (pathLeaks.length > 0) {
    errors.push(`artifact contains absolute path values: ${pathLeaks.join(", ")}`);
  }
  const privacy = validateEvidencePrivacy(artifact);
  if (privacy.disallowedKeys.length > 0) {
    errors.push(`artifact contains disallowed keys: ${privacy.disallowedKeys.join(", ")}`);
  }
  if (privacy.sensitivePatterns.length > 0) {
    errors.push(`artifact contains sensitive patterns: ${privacy.sensitivePatterns.join(", ")}`);
  }

  return { errors, valid: errors.length === 0 };
}

export async function inspectReleaseCandidate(options) {
  const expected = normalizeExpected(options.expected);
  const archivePath = path.resolve(options.archivePath);
  const ipaPath = options.ipaPath ? path.resolve(options.ipaPath) : undefined;
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const fileExists = options.fileExists ?? fs.existsSync;
  const hashFile = options.hashFile ?? defaultHashFile;
  const inspectSentryMarkers = options.inspectSentryMarkers ?? defaultInspectSentryMarkers;

  if (!fileExists(archivePath)) {
    throw new Error("Candidate .xcarchive does not exist.");
  }
  if (ipaPath && !fileExists(ipaPath)) {
    throw new Error("Candidate IPA does not exist.");
  }

  const archiveInfo = readPlist(commandRunner, path.join(archivePath, "Info.plist"), "Archive Info.plist");
  const archiveProperties = archiveInfo.ApplicationProperties ?? {};
  const appPath = resolveArchivedAppPath(
    archivePath,
    archiveProperties.ApplicationPath,
    fileExists,
  );
  const appInfo = readPlist(commandRunner, path.join(appPath, "Info.plist"), "App Info.plist");
  const binaryName = appInfo.CFBundleExecutable;
  if (!isNonEmptyString(binaryName) || !SAFE_ARTIFACT_NAME_PATTERN.test(binaryName)) {
    throw new Error("App CFBundleExecutable must be a file name only.");
  }
  const binaryPath = path.resolve(appPath, binaryName);
  assertInsideDirectory(appPath, binaryPath, "App executable");
  if (!fileExists(binaryPath)) {
    throw new Error("App executable does not exist in the archive.");
  }

  expectEqual(appInfo.CFBundleIdentifier, expected.bundleIdentifier, "App bundle identifier");
  expectEqual(appInfo.CFBundleShortVersionString, expected.appVersion, "App version");
  expectEqual(appInfo.CFBundleVersion, expected.buildNumber, "App build number");
  for (const [label, actual, expectedValue] of [
    ["Archive bundle identifier", archiveProperties.CFBundleIdentifier, expected.bundleIdentifier],
    ["Archive app version", archiveProperties.CFBundleShortVersionString, expected.appVersion],
    ["Archive build number", archiveProperties.CFBundleVersion, expected.buildNumber],
  ]) {
    if (actual !== undefined) expectEqual(actual, expectedValue, label);
  }
  if (archiveProperties.Team !== undefined) {
    expectEqual(archiveProperties.Team, expected.teamIdentifier, "Archive team identifier");
  }

  const profileXml = requireCommand(
    commandRunner,
    "security",
    ["cms", "-D", "-i", path.join(appPath, "embedded.mobileprovision")],
  ).stdout;
  const profile = parsePlistJson(commandRunner, profileXml, "Embedded provisioning profile");
  const profileTeam = Array.isArray(profile.TeamIdentifier) ? profile.TeamIdentifier[0] : undefined;
  expectEqual(profileTeam, expected.teamIdentifier, "Provisioning profile team identifier");

  requireCommand(commandRunner, "codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const entitlementXml = requireCommand(
    commandRunner,
    "codesign",
    ["-d", "--entitlements", ":-", appPath],
  ).stdout;
  const entitlements = parsePlistJson(commandRunner, entitlementXml, "Codesign entitlements");
  const signingDetails = requireCommand(commandRunner, "codesign", ["-dvv", "--verbose=4", appPath]);
  const signingText = `${signingDetails.stdout}\n${signingDetails.stderr}`;

  const applicationIdentifier = `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  expectEqual(profile.Entitlements?.["application-identifier"], applicationIdentifier, "Profile application identifier");
  expectEqual(entitlements["application-identifier"], applicationIdentifier, "Codesign application identifier");
  expectEqual(entitlements["com.apple.developer.team-identifier"], expected.teamIdentifier, "Codesign team identifier");
  requireFalse(profile.Entitlements?.["get-task-allow"], "Profile get-task-allow");
  requireFalse(entitlements["get-task-allow"], "Codesign get-task-allow");
  if (!/Authority=Apple Distribution(?::|\n|$)/.test(signingText) && !String(archiveProperties.SigningIdentity ?? "").startsWith("Apple Distribution")) {
    throw new Error("Codesign identity is not an Apple Distribution identity.");
  }
  const signingTeamMatch = signingText.match(/(?:^|\n)TeamIdentifier=([A-Z0-9]+)/);
  if (signingTeamMatch) {
    expectEqual(signingTeamMatch[1], expected.teamIdentifier, "Codesign detail team identifier");
  }

  const sentry = inspectSentryMarkers(appPath, commandRunner);
  if (sentry.runtimeModeDisabled !== true || sentry.configuredDsnFound !== false) {
    throw new Error("Archived app does not prove disabled Sentry runtime markers.");
  }

  const artifact = {
    artifactType: RELEASE_CANDIDATE_ARTIFACT_TYPE,
    artifactVersion: RELEASE_CANDIDATE_ARTIFACT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    sourceRevision: expected.sourceRevision,
    archive: {
      appName: path.basename(appPath),
      applicationIdentifier,
      appVersion: expected.appVersion,
      binaryName,
      binarySha256: (await hashFile(binaryPath)).toLowerCase(),
      buildNumber: expected.buildNumber,
      bundleIdentifier: expected.bundleIdentifier,
      getTaskAllow: false,
      name: path.basename(archivePath),
      sentry: {
        configuredDsnFound: false,
        runtimeModeDisabled: true,
      },
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        teamIdentifier: expected.teamIdentifier,
      },
      teamIdentifier: expected.teamIdentifier,
    },
    ...(ipaPath
      ? {
          ipa: {
            name: path.basename(ipaPath),
            sha256: (await hashFile(ipaPath)).toLowerCase(),
          },
        }
      : {}),
    privacy: {
      containsAbsolutePaths: false,
      containsAppContent: false,
      containsCredentials: false,
      containsDeviceIdentifiers: false,
      containsProfiles: false,
      containsSignedUrls: false,
    },
  };

  const validation = validateReleaseCandidateEvidence(artifact, expected);
  if (!validation.valid) {
    throw new Error(`Candidate evidence validation failed: ${validation.errors.join("; ")}`);
  }
  return artifact;
}

export async function generateReleaseCandidateEvidence(options) {
  const expected = normalizeExpected(options.expected);
  const resolveSourceState = options.resolveSourceState ?? resolveReleaseSourceState;
  const sourceState = resolveSourceState({
    commandRunner: options.gitCommandRunner,
    cwd: options.repositoryRoot ?? process.cwd(),
  });
  if (sourceState.sourceRevision !== expected.sourceRevision) {
    throw new Error(
      `Clean source revision mismatch: expected ${expected.sourceRevision}, found ${sourceState.sourceRevision}.`,
    );
  }

  const artifact = await inspectReleaseCandidate({
    ...options,
    expected,
  });
  const validation = validateReleaseCandidateEvidence(artifact, expected);
  if (!validation.valid) {
    throw new Error(`Candidate evidence validation failed: ${validation.errors.join("; ")}`);
  }

  const outputPath = path.resolve(options.outputPath);
  const outputDirectory = path.dirname(outputPath);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const temporaryPath = path.join(
    outputDirectory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(artifact, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporaryPath, outputPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
  return artifact;
}

function parseCliArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }
    const [inlineKey, inlineValue] = argument.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[inlineKey] = inlineValue;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${inlineKey}.`);
    }
    values[inlineKey] = value;
    index += 1;
  }
  return values;
}

function requireCliValue(values, key) {
  if (!isNonEmptyString(values[key])) {
    throw new Error(`Missing required --${key}.`);
  }
  return values[key];
}

function isCliEntryPoint() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntryPoint()) {
  try {
    const values = parseCliArgs(process.argv.slice(2));
    const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const artifact = await generateReleaseCandidateEvidence({
      archivePath: requireCliValue(values, "archive"),
      expected: {
        appVersion: requireCliValue(values, "expected-app-version"),
        buildNumber: requireCliValue(values, "expected-build-number"),
        bundleIdentifier: requireCliValue(values, "expected-bundle-identifier"),
        sourceRevision: requireCliValue(values, "expected-source-revision"),
        teamIdentifier: requireCliValue(values, "expected-team-identifier"),
      },
      ipaPath: values.ipa,
      outputPath: values.output ?? path.join(projectDir, DEFAULT_RELEASE_CANDIDATE_PATH),
      repositoryRoot: path.resolve(projectDir, ".."),
    });
    process.stdout.write(
      `Release candidate evidence written for ${artifact.archive.name} (${artifact.archive.binarySha256}).\n`,
    );
  } catch (error) {
    process.stderr.write(
      `Release candidate evidence failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
