import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  findUnexpectedFields,
  validateEvidencePrivacy,
} from "./evidence-privacy.mjs";
import { resolveReleaseSourceState } from "./release-source-state.mjs";

const require = createRequire(import.meta.url);
const {
  CANDIDATE_BINDING_SCHEMA_VERSION,
  computeGuidePupCandidateIdentifier,
  createGuidePupCandidateBinding,
} = require("../release/release-binding.js");

export const RELEASE_CANDIDATE_ARTIFACT_VERSION = 6;
export const RELEASE_CANDIDATE_ARTIFACT_TYPE = "guidepup-ios-release-candidate";
export const DEFAULT_RELEASE_CANDIDATE_PATH = "release/candidate-build.latest.json";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const SAFE_ARTIFACT_NAME_PATTERN = /^[^/\\\0]+$/;
const SOURCE_INFO_PLIST_REPOSITORY_PATH =
  "expo/ios/GuidePupVisionAssistant/Info.plist";
const DEFAULT_REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const RELEASE_BINDING_SCHEMA_VERSION = 1;
const RELEASE_TRACK_MARKER_PATTERN = /^guidepup-release-track:([A-Za-z0-9-]+)$/;
const RELEASE_TRACK_NORMALIZATION = new Map([
  ["internal-preview", "preview"],
  ["preview", "preview"],
  ["testflight", "testflight"],
  ["app-store", "store"],
]);
const RELEASE_RUNTIME_CONFIG_FIELDS = [
  "apiBaseUrl",
  "appEnv",
  "experimentalTabsEnabled",
  "privacyPolicyUrl",
  "releaseTrack",
  "schemaVersion",
  "supportUrl",
  "websiteUrl",
];
const CANDIDATE_BINDING_FIELDS = [
  "appVersion",
  "buildNumber",
  "bundleIdentifier",
  "candidateIdentifier",
  "schemaVersion",
  "sourceRevision",
  "teamIdentifier",
];
const RELEASE_PROFILE_NAMES = ["preview", "testflight", "store"];
const REQUIRED_EXPECTED_FIELDS = [
  "appVersion",
  "buildNumber",
  "bundleIdentifier",
  "sourceRevision",
  "teamIdentifier",
];
const REQUIRED_SIGNED_ENTITLEMENT_KEYS = [
  "application-identifier",
  "beta-reports-active",
  "com.apple.developer.team-identifier",
  "get-task-allow",
];
const SENTRY_EVIDENCE_SHAPE = {
  configuredDsnFound: true,
  crashDataManifestFound: true,
  sdkEmbedded: true,
};
const SIGNING_EVIDENCE_SHAPE = {
  certificateClass: true,
  codesignVerified: true,
  distributionMethod: true,
  teamIdentifier: true,
};
const BUNDLE_DECLARATION_EVIDENCE_SHAPE = {
  cameraUsageDescriptionPresent: true,
  canonicalSha256: true,
  itsAppUsesNonExemptEncryption: true,
  microphoneUsageDescriptionPresent: true,
  speechRecognitionUsageDescriptionPresent: true,
};
const APP_PAYLOAD_EVIDENCE_SHAPE = {
  appName: true,
  applicationIdentifier: true,
  appVersion: true,
  betaReportsActive: true,
  binaryName: true,
  binarySha256: true,
  bundleDeclarations: BUNDLE_DECLARATION_EVIDENCE_SHAPE,
  buildNumber: true,
  bundleIdentifier: true,
  entitlementsSha256: true,
  getTaskAllow: true,
  normalizedPayloadSha256: true,
  sentry: SENTRY_EVIDENCE_SHAPE,
  signing: SIGNING_EVIDENCE_SHAPE,
  teamIdentifier: true,
};
const RELEASE_CANDIDATE_EVIDENCE_SHAPE = {
  archive: {
    ...APP_PAYLOAD_EVIDENCE_SHAPE,
    name: true,
  },
  artifactType: true,
  artifactVersion: true,
  generatedAt: true,
  ipa: {
    ...APP_PAYLOAD_EVIDENCE_SHAPE,
    candidateIdentifier: true,
    name: true,
    payloadInspected: true,
    sha256: true,
  },
  payloadBinding: {
    archiveMatches: true,
    normalizedPayloadSha256: true,
    storeIpaMatches: true,
    validationIpaMatches: true,
  },
  privacy: {
    containsAbsolutePaths: true,
    containsAppContent: true,
    containsCredentials: true,
    containsDeviceIdentifiers: true,
    containsProfiles: true,
    containsSignedUrls: true,
  },
  release: {
    buildProfile: true,
    candidateBinding: Object.fromEntries(
      CANDIDATE_BINDING_FIELDS.map((field) => [field, true]),
    ),
    evidenceTrack: true,
    markerCount: true,
    markerSource: true,
    runtimeConfig: Object.fromEntries(
      RELEASE_RUNTIME_CONFIG_FIELDS.map((field) => [field, true]),
    ),
    runtimeTrack: true,
  },
  sourceInfoPlistDeclarations: BUNDLE_DECLARATION_EVIDENCE_SHAPE,
  sourceRevision: true,
  validationIpa: {
    ...APP_PAYLOAD_EVIDENCE_SHAPE,
    candidateIdentifier: true,
    name: true,
    payloadInspected: true,
    provisionedDeviceCount: true,
    sha256: true,
  },
};

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

function parseExpectedBoolean(value, label) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label} must be true or false.`);
}

function normalizeExpectedReleaseRuntimeConfig(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is required.`);
  }

  const normalized = {
    apiBaseUrl: String(value.apiBaseUrl ?? "").trim(),
    appEnv: String(value.appEnv ?? "").trim(),
    experimentalTabsEnabled: parseExpectedBoolean(
      value.experimentalTabsEnabled,
      `${label}.experimentalTabsEnabled`,
    ),
    privacyPolicyUrl: String(value.privacyPolicyUrl ?? "").trim(),
    releaseTrack: String(value.releaseTrack ?? "").trim(),
    schemaVersion: Number(value.schemaVersion),
    supportUrl: String(value.supportUrl ?? "").trim(),
    websiteUrl: String(value.websiteUrl ?? "").trim(),
  };

  for (const field of RELEASE_RUNTIME_CONFIG_FIELDS) {
    if (field === "experimentalTabsEnabled" || field === "schemaVersion") continue;
    if (!isNonEmptyString(normalized[field])) {
      throw new Error(`${label}.${field} is required.`);
    }
  }
  if (normalized.schemaVersion !== RELEASE_BINDING_SCHEMA_VERSION) {
    throw new Error(
      `${label}.schemaVersion must be ${RELEASE_BINDING_SCHEMA_VERSION}.`,
    );
  }
  return normalized;
}

export const buildGuidePupCandidateBinding = createGuidePupCandidateBinding;

function normalizeEmbeddedCandidateBinding(value, runtimeConfig, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is required.`);
  }

  const bindingKeys = Object.keys(value).sort();
  const expectedBindingKeys = [...CANDIDATE_BINDING_FIELDS].sort();
  if (
    bindingKeys.length !== expectedBindingKeys.length
    || bindingKeys.some((key, index) => key !== expectedBindingKeys[index])
  ) {
    throw new Error(`${label} has unexpected or missing fields.`);
  }

  const normalized = {
    appVersion: String(value.appVersion ?? "").trim(),
    buildNumber: String(value.buildNumber ?? "").trim(),
    bundleIdentifier: String(value.bundleIdentifier ?? "").trim(),
    candidateIdentifier: String(value.candidateIdentifier ?? "").trim().toLowerCase(),
    schemaVersion: Number(value.schemaVersion),
    sourceRevision: String(value.sourceRevision ?? "").trim().toLowerCase(),
    teamIdentifier: String(value.teamIdentifier ?? "").trim(),
  };
  for (const field of [
    "appVersion",
    "buildNumber",
    "bundleIdentifier",
    "teamIdentifier",
  ]) {
    if (!isNonEmptyString(normalized[field])) {
      throw new Error(`${label}.${field} is required.`);
    }
  }
  if (normalized.schemaVersion !== CANDIDATE_BINDING_SCHEMA_VERSION) {
    throw new Error(
      `${label}.schemaVersion must be ${CANDIDATE_BINDING_SCHEMA_VERSION}.`,
    );
  }
  if (!SOURCE_REVISION_PATTERN.test(normalized.sourceRevision)) {
    throw new Error(`${label}.sourceRevision is invalid.`);
  }
  if (!SHA256_PATTERN.test(normalized.candidateIdentifier)) {
    throw new Error(`${label}.candidateIdentifier is invalid.`);
  }

  const computedIdentifier = computeGuidePupCandidateIdentifier({
    ...normalized,
    releaseBinding: runtimeConfig,
  });
  if (computedIdentifier !== normalized.candidateIdentifier) {
    throw new Error(`${label}.candidateIdentifier does not match the signed binding.`);
  }
  return normalized;
}

export function buildExpectedReleaseRuntimeConfigs(easJson) {
  const profiles = {};
  for (const profileName of RELEASE_PROFILE_NAMES) {
    const env = easJson?.build?.[profileName]?.env;
    profiles[profileName] = normalizeExpectedReleaseRuntimeConfig(
      {
        apiBaseUrl: env?.EXPO_PUBLIC_API_BASE_URL,
        appEnv: env?.EXPO_PUBLIC_APP_ENV,
        experimentalTabsEnabled: env?.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS,
        privacyPolicyUrl: env?.EXPO_PUBLIC_PRIVACY_POLICY_URL,
        releaseTrack: env?.EXPO_PUBLIC_RELEASE_TRACK,
        schemaVersion: RELEASE_BINDING_SCHEMA_VERSION,
        supportUrl: env?.EXPO_PUBLIC_SUPPORT_URL,
        websiteUrl: env?.EXPO_PUBLIC_WEBSITE_URL,
      },
      `EAS ${profileName} release runtime config`,
    );
  }
  return profiles;
}

function requireCommand(
  commandRunner,
  command,
  args,
  options = {},
  operationLabel = command,
) {
  let result;
  try {
    result = commandRunner(command, args, options);
  } catch {
    throw new Error(`${operationLabel} failed.`);
  }
  if (!result || result.status !== 0) {
    throw new Error(`${operationLabel} failed.`);
  }
  return result;
}

function plistKeyPath(components) {
  return components
    .map((component) => String(component).replaceAll("\\", "\\\\").replaceAll(".", "\\."))
    .join(".");
}

function extractPlistRaw(commandRunner, source, components, label, expectedType) {
  const args = ["-extract", plistKeyPath(components), "raw"];
  if (expectedType) {
    args.push("-expect", expectedType);
  }
  args.push("-n", "-o", "-", "--", source.filePath ?? "-");
  const result = requireCommand(commandRunner, "plutil", args, {
    input: source.input,
  }, `${label} extraction`);
  if (typeof result.stdout !== "string") {
    throw new Error(`${label} did not produce a plist value.`);
  }
  return result.stdout;
}

function extractPlistBoolean(commandRunner, source, components, label) {
  const value = extractPlistRaw(commandRunner, source, components, label, "bool");
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${label} did not produce a valid boolean.`);
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]),
  );
}

function inspectBundleDeclarations(commandRunner, source, label) {
  const exactValues = {
    ITSAppUsesNonExemptEncryption: extractPlistBoolean(
      commandRunner,
      source,
      ["ITSAppUsesNonExemptEncryption"],
      `${label}.ITSAppUsesNonExemptEncryption`,
    ),
    NSCameraUsageDescription: extractPlistRaw(
      commandRunner,
      source,
      ["NSCameraUsageDescription"],
      `${label}.NSCameraUsageDescription`,
      "string",
    ),
    NSMicrophoneUsageDescription: extractPlistRaw(
      commandRunner,
      source,
      ["NSMicrophoneUsageDescription"],
      `${label}.NSMicrophoneUsageDescription`,
      "string",
    ),
    NSSpeechRecognitionUsageDescription: extractPlistRaw(
      commandRunner,
      source,
      ["NSSpeechRecognitionUsageDescription"],
      `${label}.NSSpeechRecognitionUsageDescription`,
      "string",
    ),
  };

  if (exactValues.ITSAppUsesNonExemptEncryption !== false) {
    throw new Error(
      `${label}.ITSAppUsesNonExemptEncryption must be false.`,
    );
  }
  for (const key of [
    "NSCameraUsageDescription",
    "NSMicrophoneUsageDescription",
    "NSSpeechRecognitionUsageDescription",
  ]) {
    if (!isNonEmptyString(exactValues[key])) {
      throw new Error(`${label}.${key} must be a nonempty string.`);
    }
  }

  return {
    cameraUsageDescriptionPresent: true,
    canonicalSha256: createHash("sha256")
      .update(JSON.stringify(canonicalizeJson(exactValues)), "utf8")
      .digest("hex"),
    itsAppUsesNonExemptEncryption: false,
    microphoneUsageDescriptionPresent: true,
    speechRecognitionUsageDescriptionPresent: true,
  };
}

function requireMatchingBundleDeclarations(reference, actual, label) {
  for (const field of Object.keys(BUNDLE_DECLARATION_EVIDENCE_SHAPE)) {
    if (actual?.[field] !== reference?.[field]) {
      throw new Error(
        `${label} final-bundle declarations do not match the exact-revision source Info.plist.`,
      );
    }
  }
}

function resolveSourceInfoPlistSource(options, expected) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT,
  );
  const gitCommandRunner =
    options.gitCommandRunner ?? defaultCommandRunner;
  const result = requireCommand(
    gitCommandRunner,
    "git",
    [
      "show",
      `${expected.sourceRevision}:${SOURCE_INFO_PLIST_REPOSITORY_PATH}`,
    ],
    { cwd: repositoryRoot },
    "Exact-revision source Info.plist lookup",
  );
  return { input: result.stdout };
}

function parseSignedEntitlements(
  commandRunner,
  entitlementXml,
  label,
) {
  const result = requireCommand(
    commandRunner,
    "plutil",
    ["-convert", "json", "-o", "-", "--", "-"],
    { input: entitlementXml },
    `${label} parsing`,
  );
  let entitlements;
  try {
    entitlements = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${label} could not be converted to JSON.`);
  }
  if (
    !entitlements
    || typeof entitlements !== "object"
    || Array.isArray(entitlements)
  ) {
    throw new Error(`${label} must be a dictionary.`);
  }
  return entitlements;
}

function normalizedEntitlementEvidence(entitlements, expected) {
  const applicationIdentifier =
    `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  const canonicalEntitlements = canonicalizeJson(entitlements);
  return {
    applicationIdentifier,
    betaReportsActive: entitlements["beta-reports-active"] === true,
    entitlementsSha256: createHash("sha256")
      .update(JSON.stringify(canonicalEntitlements))
      .digest("hex"),
    getTaskAllow: entitlements["get-task-allow"],
    teamIdentifier: expected.teamIdentifier,
  };
}

function inspectStoreSignedEntitlements(
  commandRunner,
  entitlementXml,
  expected,
  label,
) {
  const entitlements = parseSignedEntitlements(
    commandRunner,
    entitlementXml,
    label,
  );
  const actualKeys = Object.keys(entitlements).sort();
  if (
    actualKeys.length !== REQUIRED_SIGNED_ENTITLEMENT_KEYS.length
    || actualKeys.some(
      (key, index) => key !== REQUIRED_SIGNED_ENTITLEMENT_KEYS[index],
    )
  ) {
    throw new Error(
      `${label} must contain exactly the approved GuidePup distribution entitlement keys.`,
    );
  }

  const applicationIdentifier =
    `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  expectEqual(
    entitlements["application-identifier"],
    applicationIdentifier,
    `${label} application identifier`,
  );
  expectEqual(
    entitlements["com.apple.developer.team-identifier"],
    expected.teamIdentifier,
    `${label} team identifier`,
  );
  if (entitlements["beta-reports-active"] !== true) {
    throw new Error(`${label} beta-reports-active must be true.`);
  }
  requireFalse(entitlements["get-task-allow"], `${label} get-task-allow`);
  return normalizedEntitlementEvidence(entitlements, expected);
}

function inspectValidationSignedEntitlements(
  commandRunner,
  entitlementXml,
  expected,
  label,
) {
  const entitlements = parseSignedEntitlements(
    commandRunner,
    entitlementXml,
    label,
  );
  const allowedKeys = new Set(REQUIRED_SIGNED_ENTITLEMENT_KEYS);
  const actualKeys = Object.keys(entitlements).sort();
  if (
    actualKeys.some((key) => !allowedKeys.has(key))
    || !actualKeys.includes("application-identifier")
    || !actualKeys.includes("com.apple.developer.team-identifier")
    || !actualKeys.includes("get-task-allow")
  ) {
    throw new Error(
      `${label} contains unsupported or missing GuidePup validation entitlement keys.`,
    );
  }
  const applicationIdentifier =
    `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  expectEqual(
    entitlements["application-identifier"],
    applicationIdentifier,
    `${label} application identifier`,
  );
  expectEqual(
    entitlements["com.apple.developer.team-identifier"],
    expected.teamIdentifier,
    `${label} team identifier`,
  );
  if (
    typeof entitlements["get-task-allow"] !== "boolean"
    || (
      Object.hasOwn(entitlements, "beta-reports-active")
      && typeof entitlements["beta-reports-active"] !== "boolean"
    )
  ) {
    throw new Error(`${label} contains invalid boolean entitlement values.`);
  }
  return normalizedEntitlementEvidence(entitlements, expected);
}

function readPlistDictionaryFields(commandRunner, source, components, fields, label) {
  const keys = new Set(
    extractPlistRaw(commandRunner, source, components, label, "dictionary")
      .split(/\r?\n/u)
      .filter((key) => key.length > 0),
  );
  return Object.fromEntries(
    fields
      .filter((field) => keys.has(field))
      .map((field) => [
        field,
        extractPlistRaw(commandRunner, source, [...components, field], `${label}.${field}`),
      ]),
  );
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
  const appStat = fs.lstatSync(appPath);
  if (appStat.isSymbolicLink() || !appStat.isDirectory()) {
    throw new Error("Archive ApplicationPath must identify a real app directory.");
  }
  assertInsideDirectory(
    fs.realpathSync(archivePath),
    fs.realpathSync(appPath),
    "Archived app",
  );
  if (path.extname(appPath) !== ".app") {
    throw new Error("Archive ApplicationPath must identify an .app bundle.");
  }
  return appPath;
}

function assertNoSymlinks(rootPath) {
  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      throw new Error("Candidate IPA payload must not contain symbolic links.");
    }
    if (!stat.isDirectory()) {
      continue;
    }
    for (const entry of fs.readdirSync(currentPath)) {
      pending.push(path.join(currentPath, entry));
    }
  }
}

function normalizeReleaseManifestPath(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  return normalizedPath.endsWith("/")
    ? normalizedPath.slice(0, -1)
    : normalizedPath;
}

function compareUtf8Bytes(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function canonicalizeReleaseManifestPaths(relativePaths) {
  const normalizedPaths = relativePaths.map(normalizeReleaseManifestPath);
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error("Candidate manifest contains duplicate normalized paths.");
  }
  return normalizedPaths.sort(compareUtf8Bytes);
}

function extractIpaAppBundle(ipaPath, archiveCommandRunner = defaultCommandRunner) {
  const listing = requireCommand(
    archiveCommandRunner,
    "unzip",
    ["-Z1", ipaPath],
    {},
    "Candidate IPA listing",
  ).stdout;
  const entries = listing.split(/\r?\n/u).filter(Boolean);
  if (entries.length === 0 || entries.length > 50_000) {
    throw new Error("Candidate IPA has an invalid entry count.");
  }
  canonicalizeReleaseManifestPaths(entries);

  const appRoots = new Set();
  for (const entry of entries) {
    if (
      entry.includes("\0")
      || entry.includes("\\")
      || entry.startsWith("/")
      || entry
        .replace(/\/$/u, "")
        .split("/")
        .some((part) => part === "" || part === "." || part === "..")
    ) {
      throw new Error("Candidate IPA contains an unsafe archive path.");
    }
    const appMatch = entry.match(/^Payload\/([^/]+\.app)(?:\/|$)/u);
    if (appMatch) {
      appRoots.add(appMatch[1]);
    }
  }
  if (appRoots.size !== 1) {
    throw new Error("Candidate IPA must contain exactly one Payload app bundle.");
  }

  const appName = [...appRoots][0];
  if (!SAFE_ARTIFACT_NAME_PATTERN.test(appName)) {
    throw new Error("Candidate IPA app bundle name is invalid.");
  }
  const extractionRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "guidepup-ipa-inspection-"),
  );
  try {
    requireCommand(
      archiveCommandRunner,
      "unzip",
      ["-qq", "-o", ipaPath, "-d", extractionRoot],
      {},
      "Candidate IPA extraction",
    );
    const appPath = path.resolve(extractionRoot, "Payload", appName);
    assertInsideDirectory(extractionRoot, appPath, "Candidate IPA app");
    if (!fs.existsSync(appPath)) {
      throw new Error("Candidate IPA Payload app bundle was not extracted.");
    }
    assertNoSymlinks(appPath);
    const appStat = fs.lstatSync(appPath);
    if (!appStat.isDirectory()) {
      throw new Error("Candidate IPA Payload app must be a real directory.");
    }
    assertInsideDirectory(
      fs.realpathSync(extractionRoot),
      fs.realpathSync(appPath),
      "Candidate IPA app",
    );
    return {
      appPath,
      cleanup() {
        fs.rmSync(extractionRoot, { force: true, recursive: true });
      },
    };
  } catch (error) {
    fs.rmSync(extractionRoot, { force: true, recursive: true });
    throw error;
  }
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

const MACH_O_MAGICS = new Set([
  "bebafeca",
  "bfbafeca",
  "cafebabe",
  "cafebabf",
  "cefaedfe",
  "cffaedfe",
  "feedface",
  "feedfacf",
]);
const NORMALIZED_PAYLOAD_EXCLUDED_SEGMENTS = new Set([
  "_CodeSignature",
  "SC_Info",
]);

function hasMachOMagic(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  try {
    const magic = Buffer.alloc(4);
    return fs.readSync(descriptor, magic, 0, magic.length, 0) === magic.length
      && MACH_O_MAGICS.has(magic.toString("hex"));
  } finally {
    fs.closeSync(descriptor);
  }
}

function isExcludedPayloadPath(relativePath) {
  const segments = relativePath.split(path.sep);
  return segments.some((segment) =>
    NORMALIZED_PAYLOAD_EXCLUDED_SEGMENTS.has(segment),
  ) || segments.at(-1) === "embedded.mobileprovision";
}

async function hashCodeWithoutSignature(
  filePath,
  commandRunner,
  hashFile,
) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "guidepup-unsigned-code-"),
  );
  const temporaryPath = path.join(temporaryRoot, path.basename(filePath));
  try {
    fs.copyFileSync(filePath, temporaryPath);
    requireCommand(
      commandRunner,
      "codesign",
      ["--remove-signature", temporaryPath],
      {},
      "Normalized app payload signature removal",
    );
    return (await hashFile(temporaryPath)).toLowerCase();
  } finally {
    fs.rmSync(temporaryRoot, { force: true, recursive: true });
  }
}

function hashCanonicalPropertyList(filePath, commandRunner) {
  const result = requireCommand(
    commandRunner,
    "plutil",
    ["-convert", "xml1", "-o", "-", "--", filePath],
    {},
    "Normalized app payload property-list conversion",
  );
  if (typeof result.stdout !== "string" || result.stdout.length === 0) {
    throw new Error(
      "Normalized app payload property-list conversion produced no data.",
    );
  }
  return createHash("sha256").update(result.stdout, "utf8").digest("hex");
}

async function hashNormalizedAppPayload(
  appPath,
  commandRunner,
  hashFile,
) {
  const files = [];
  const pending = [appPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(appPath, entryPath);
      if (isExcludedPayloadPath(relativePath)) {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new Error(
          "Candidate app payload must not contain symbolic links.",
        );
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push({ entryPath, relativePath });
      } else {
        throw new Error(
          "Candidate app payload contains an unsupported file type.",
        );
      }
    }
  }
  if (files.length === 0 || files.length > 50_000) {
    throw new Error("Candidate app payload has an invalid file count.");
  }

  const filesByNormalizedPath = new Map();
  for (const file of files) {
    const normalizedPath = normalizeReleaseManifestPath(file.relativePath);
    if (filesByNormalizedPath.has(normalizedPath)) {
      throw new Error("Candidate manifest contains duplicate normalized paths.");
    }
    filesByNormalizedPath.set(normalizedPath, file);
  }

  const manifestHash = createHash("sha256");
  for (const normalizedPath of canonicalizeReleaseManifestPaths(
    files.map(({ relativePath }) => relativePath),
  )) {
    const { entryPath } = filesByNormalizedPath.get(normalizedPath);
    const fileHash = normalizedPath === "Info.plist"
      ? hashCanonicalPropertyList(entryPath, commandRunner)
      : hasMachOMagic(entryPath)
        ? await hashCodeWithoutSignature(entryPath, commandRunner, hashFile)
        : (await hashFile(entryPath)).toLowerCase();
    const mode = fs.statSync(entryPath).mode & 0o777;
    manifestHash.update(
      `${normalizedPath}\0${mode.toString(8)}\0${fileHash}\n`,
      "utf8",
    );
  }
  return manifestHash.digest("hex");
}

function snapshotIdentityFromStat(stat) {
  return {
    changedAtMs: stat.ctimeMs,
    device: stat.dev,
    inode: stat.ino,
    mode: stat.mode & 0o777,
    modifiedAtMs: stat.mtimeMs,
    size: stat.size,
  };
}

function snapshotFileIdentity(filePath) {
  return snapshotIdentityFromStat(fs.statSync(filePath));
}

function sameFileIdentity(left, right) {
  return left.changedAtMs === right.changedAtMs
    && left.device === right.device
    && left.inode === right.inode
    && left.mode === right.mode
    && left.modifiedAtMs === right.modifiedAtMs
    && left.size === right.size;
}

async function snapshotDirectoryManifestUnsafe(rootPath, hashFile, label) {
  const rootStat = fs.lstatSync(rootPath);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`${label} must be a real directory.`);
  }
  const rootIdentityBefore = snapshotIdentityFromStat(rootStat);

  const entries = [];
  const pending = [rootPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, entryPath);
      const statBefore = fs.lstatSync(entryPath);
      if (statBefore.isSymbolicLink()) {
        entries.push({
          changedAtMs: statBefore.ctimeMs,
          device: statBefore.dev,
          inode: statBefore.ino,
          mode: statBefore.mode & 0o777,
          modifiedAtMs: statBefore.mtimeMs,
          relativePath,
          targetSha256: createHash("sha256")
            .update(fs.readlinkSync(entryPath), "utf8")
            .digest("hex"),
          type: "symbolic-link",
        });
        continue;
      }

      if (statBefore.isDirectory()) {
        entries.push({
          changedAtMs: statBefore.ctimeMs,
          device: statBefore.dev,
          inode: statBefore.ino,
          mode: statBefore.mode & 0o777,
          modifiedAtMs: statBefore.mtimeMs,
          relativePath,
          type: "directory",
        });
        pending.push(entryPath);
        continue;
      }
      if (!statBefore.isFile()) {
        throw new Error(`${label} contains an unsupported file type.`);
      }

      const identityBefore = snapshotFileIdentity(entryPath);
      const sha256 = (await hashFile(entryPath)).toLowerCase();
      const identityAfter = snapshotFileIdentity(entryPath);
      if (!sameFileIdentity(identityBefore, identityAfter)) {
        throw new Error(`${label} changed while its immutable manifest was captured.`);
      }
      entries.push({
        changedAtMs: identityAfter.changedAtMs,
        device: identityAfter.device,
        inode: identityAfter.inode,
        mode: statBefore.mode & 0o777,
        modifiedAtMs: identityAfter.modifiedAtMs,
        relativePath,
        sha256,
        size: identityAfter.size,
        type: "file",
      });
    }
  }
  if (entries.length === 0 || entries.length > 100_000) {
    throw new Error(`${label} has an invalid entry count.`);
  }
  const rootStatAfter = fs.lstatSync(rootPath);
  if (
    rootStatAfter.isSymbolicLink()
    || !rootStatAfter.isDirectory()
    || !sameFileIdentity(
      rootIdentityBefore,
      snapshotIdentityFromStat(rootStatAfter),
    )
  ) {
    throw new Error(
      `${label} root changed while its immutable manifest was captured.`,
    );
  }

  const entriesByNormalizedPath = new Map();
  for (const entry of entries) {
    const normalizedPath = normalizeReleaseManifestPath(entry.relativePath);
    if (entriesByNormalizedPath.has(normalizedPath)) {
      throw new Error("Candidate manifest contains duplicate normalized paths.");
    }
    entriesByNormalizedPath.set(normalizedPath, entry);
  }

  const manifestHash = createHash("sha256");
  manifestHash.update(
    `<root>\0directory\0${rootIdentityBefore.mode.toString(8)}\0${rootIdentityBefore.device}\0${rootIdentityBefore.inode}\0${rootIdentityBefore.modifiedAtMs}\0${rootIdentityBefore.changedAtMs}\0${rootIdentityBefore.size}\n`,
    "utf8",
  );
  for (const normalizedPath of canonicalizeReleaseManifestPaths(
    entries.map(({ relativePath }) => relativePath),
  )) {
    const entry = entriesByNormalizedPath.get(normalizedPath);
    if (entry.type === "file") {
      manifestHash.update(
        `${normalizedPath}\0file\0${entry.mode.toString(8)}\0${entry.device}\0${entry.inode}\0${entry.modifiedAtMs}\0${entry.changedAtMs}\0${entry.size}\0${entry.sha256}\n`,
        "utf8",
      );
    } else if (entry.type === "symbolic-link") {
      manifestHash.update(
        `${normalizedPath}\0symbolic-link\0${entry.mode.toString(8)}\0${entry.device}\0${entry.inode}\0${entry.modifiedAtMs}\0${entry.changedAtMs}\0${entry.targetSha256}\n`,
        "utf8",
      );
    } else {
      manifestHash.update(
        `${normalizedPath}\0directory\0${entry.mode.toString(8)}\0${entry.device}\0${entry.inode}\0${entry.modifiedAtMs}\0${entry.changedAtMs}\n`,
        "utf8",
      );
    }
  }
  return manifestHash.digest("hex");
}

async function snapshotDirectoryManifest(rootPath, hashFile, label) {
  try {
    return await snapshotDirectoryManifestUnsafe(rootPath, hashFile, label);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message.startsWith(`${label} `)
      || message === "Candidate manifest contains duplicate normalized paths."
    ) {
      throw error;
    }
    throw new Error(`${label} immutable manifest capture failed.`);
  }
}

async function inspectIpaAppBundle(options) {
  const {
    appPath,
    commandRunner,
    distributionPurpose = "store",
    expected,
    hashFile,
    inspectReleaseConfig,
    inspectSentryMarkers,
  } = options;
  if (!["store", "validation"].includes(distributionPurpose)) {
    throw new Error("IPA inspection distribution purpose is invalid.");
  }
  const labelPrefix =
    distributionPurpose === "store" ? "Store IPA" : "Validation IPA";
  const appInfoSource = { filePath: path.join(appPath, "Info.plist") };
  const bundleDeclarations = inspectBundleDeclarations(
    commandRunner,
    appInfoSource,
    `${labelPrefix} app Info.plist`,
  );
  const appInfo = {
    binaryName: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleExecutable"],
      `${labelPrefix} app CFBundleExecutable`,
      "string",
    ),
    bundleIdentifier: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleIdentifier"],
      `${labelPrefix} app CFBundleIdentifier`,
    ),
    appVersion: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleShortVersionString"],
      `${labelPrefix} app CFBundleShortVersionString`,
    ),
    buildNumber: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleVersion"],
      `${labelPrefix} app CFBundleVersion`,
    ),
  };
  if (
    !isNonEmptyString(appInfo.binaryName)
    || !SAFE_ARTIFACT_NAME_PATTERN.test(appInfo.binaryName)
  ) {
    throw new Error(`${labelPrefix} app CFBundleExecutable must be a file name only.`);
  }
  expectEqual(
    appInfo.bundleIdentifier,
    expected.bundleIdentifier,
    `${labelPrefix} app bundle identifier`,
  );
  expectEqual(appInfo.appVersion, expected.appVersion, `${labelPrefix} app version`);
  expectEqual(appInfo.buildNumber, expected.buildNumber, `${labelPrefix} app build number`);

  const binaryPath = path.resolve(appPath, appInfo.binaryName);
  assertInsideDirectory(appPath, binaryPath, `${labelPrefix} app executable`);
  if (!fs.existsSync(binaryPath) || fs.lstatSync(binaryPath).isSymbolicLink()) {
    throw new Error(`${labelPrefix} app executable does not exist as a real file.`);
  }

  const profileXml = requireCommand(
    commandRunner,
    "security",
    ["cms", "-D", "-i", path.join(appPath, "embedded.mobileprovision")],
    {},
    `${labelPrefix} provisioning profile decode`,
  ).stdout;
  const profileSource = { input: profileXml };
  const profileTeam = extractPlistRaw(
    commandRunner,
    profileSource,
    ["TeamIdentifier", 0],
    `${labelPrefix} provisioning profile team identifier`,
  );
  const profileApplicationIdentifier = extractPlistRaw(
    commandRunner,
    profileSource,
    ["Entitlements", "application-identifier"],
    `${labelPrefix} profile application identifier`,
  );
  const profileGetTaskAllow = extractPlistBoolean(
    commandRunner,
    profileSource,
    ["Entitlements", "get-task-allow"],
    `${labelPrefix} profile get-task-allow`,
  );
  let provisionedDeviceCount = 0;
  if (distributionPurpose === "validation") {
    const rawCount = extractPlistRaw(
      commandRunner,
      profileSource,
      ["ProvisionedDevices"],
      "Validation IPA provisioning profile ProvisionedDevices",
      "array",
    );
    provisionedDeviceCount = Number(rawCount);
    if (
      !Number.isInteger(provisionedDeviceCount)
      || provisionedDeviceCount < 1
      || provisionedDeviceCount > 10_000
    ) {
      throw new Error(
        "Validation IPA provisioning profile must authorize at least one bounded device.",
      );
    }
  }

  requireCommand(
    commandRunner,
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    {},
    `${labelPrefix} signature verification`,
  );
  const entitlementXml = requireCommand(
    commandRunner,
    "codesign",
    ["-d", "--entitlements", ":-", appPath],
    {},
    `${labelPrefix} signed-entitlement extraction`,
  ).stdout;
  const signedEntitlements = distributionPurpose === "store"
    ? inspectStoreSignedEntitlements(
        commandRunner,
        entitlementXml,
        expected,
        "Store IPA signed entitlements",
      )
    : inspectValidationSignedEntitlements(
        commandRunner,
        entitlementXml,
        expected,
        "Validation IPA signed entitlements",
      );
  const signingDetails = requireCommand(
    commandRunner,
    "codesign",
    ["-dvv", "--verbose=4", appPath],
    {},
    `${labelPrefix} signing-detail inspection`,
  );
  const signingText = `${signingDetails.stdout}\n${signingDetails.stderr}`;
  const applicationIdentifier =
    `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  expectEqual(
    profileTeam,
    expected.teamIdentifier,
    `${labelPrefix} profile team identifier`,
  );
  expectEqual(
    profileApplicationIdentifier,
    applicationIdentifier,
    `${labelPrefix} profile application identifier`,
  );
  expectEqual(
    signedEntitlements.applicationIdentifier,
    applicationIdentifier,
    `${labelPrefix} codesign application identifier`,
  );
  expectEqual(
    signedEntitlements.teamIdentifier,
    expected.teamIdentifier,
    `${labelPrefix} codesign team identifier`,
  );
  if (profileGetTaskAllow !== signedEntitlements.getTaskAllow) {
    throw new Error(
      `${labelPrefix} profile and signed get-task-allow values do not match.`,
    );
  }

  let certificateClass;
  let distributionMethod;
  if (distributionPurpose === "store") {
    requireFalse(profileGetTaskAllow, "Store IPA profile get-task-allow");
    requireFalse(
      signedEntitlements.getTaskAllow,
      "Store IPA codesign get-task-allow",
    );
    if (!/Authority=Apple Distribution(?::|\n|$)/.test(signingText)) {
      throw new Error(
        "Store IPA codesign identity is not an Apple Distribution identity.",
      );
    }
    certificateClass = "Apple Distribution";
    distributionMethod = "app-store";
  } else if (/Authority=Apple Development(?::|\n|$)/.test(signingText)) {
    if (signedEntitlements.getTaskAllow !== true) {
      throw new Error(
        "Development validation IPA must enable get-task-allow.",
      );
    }
    certificateClass = "Apple Development";
    distributionMethod = "development";
  } else if (/Authority=Apple Distribution(?::|\n|$)/.test(signingText)) {
    requireFalse(
      signedEntitlements.getTaskAllow,
      "Ad Hoc validation IPA codesign get-task-allow",
    );
    certificateClass = "Apple Distribution";
    distributionMethod = "ad-hoc";
  } else {
    throw new Error(
      "Validation IPA must use Apple Development or device-authorized Apple Distribution signing.",
    );
  }

  const sentry = inspectSentryMarkers(appPath, commandRunner);
  if (
    sentry.configuredDsnFound !== false
    || sentry.crashDataManifestFound !== false
    || sentry.sdkEmbedded !== false
  ) {
    throw new Error(`${labelPrefix} app contains Sentry SDK, DSN, or Crash Data manifest markers.`);
  }
  const release = inspectReleaseConfig(appPath, commandRunner);

  return {
    appName: path.basename(appPath),
    applicationIdentifier,
    appVersion: appInfo.appVersion,
    betaReportsActive: signedEntitlements.betaReportsActive,
    binaryName: appInfo.binaryName,
    binarySha256: (await hashFile(binaryPath)).toLowerCase(),
    bundleDeclarations,
    buildNumber: appInfo.buildNumber,
    bundleIdentifier: appInfo.bundleIdentifier,
    candidateIdentifier: release.candidateBinding.candidateIdentifier,
    entitlementsSha256: signedEntitlements.entitlementsSha256,
    getTaskAllow: signedEntitlements.getTaskAllow,
    payloadInspected: true,
    release,
    sentry: {
      configuredDsnFound: false,
      crashDataManifestFound: false,
      sdkEmbedded: false,
    },
    signing: {
      certificateClass,
      codesignVerified: true,
      distributionMethod,
      teamIdentifier: expected.teamIdentifier,
    },
    teamIdentifier: expected.teamIdentifier,
    ...(distributionPurpose === "validation"
      ? { provisionedDeviceCount }
      : {}),
  };
}

function runGrep(commandRunner, pattern, appPath) {
  const result = commandRunner("grep", ["-aERq", "--", pattern, appPath]);
  if (result.status !== 0 && result.status !== 1) {
    throw new Error("Sentry marker scan failed.");
  }
  return result.status === 0;
}

function defaultInspectSentryMarkers(appPath, commandRunner) {
  const configuredDsnFound = runGrep(
    commandRunner,
    "https://[[:alnum:]]{16,}@[[:alnum:]._-]*sentry[^[:space:]\"']*/[[:digit:]]+",
    appPath,
  );
  const crashDataManifestFound = runGrep(
    commandRunner,
    "NSPrivacyCollectedDataTypeCrashData",
    appPath,
  );
  const pending = [appPath];
  let sdkEmbedded = false;
  while (pending.length > 0 && !sdkEmbedded) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (/(?:^|[/\\])(?:RNSentry|Sentry)(?:\.framework|\.bundle)?(?:$|[/\\])/i.test(entryPath)) {
        sdkEmbedded = true;
        break;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      }
    }
  }
  return {
    configuredDsnFound,
    crashDataManifestFound,
    sdkEmbedded,
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
  const releaseRuntimeConfigs = {};
  for (const profileName of RELEASE_PROFILE_NAMES) {
    releaseRuntimeConfigs[profileName] = normalizeExpectedReleaseRuntimeConfig(
      expected.releaseRuntimeConfigs?.[profileName],
      `Expected ${profileName} release runtime config`,
    );
  }
  return {
    appVersion: String(expected.appVersion),
    buildNumber: String(expected.buildNumber),
    bundleIdentifier: String(expected.bundleIdentifier),
    releaseRuntimeConfigs,
    sourceRevision: expected.sourceRevision.toLowerCase(),
    teamIdentifier: String(expected.teamIdentifier),
  };
}

function expectEqual(actual, expected, label) {
  if (String(actual ?? "") !== expected) {
    throw new Error(`${label} mismatch.`);
  }
}

function requireFalse(value, label) {
  if (value !== false) {
    throw new Error(`${label} must be false for a distribution candidate.`);
  }
}

export function normalizeEmbeddedReleaseTrack(runtimeTrack) {
  return RELEASE_TRACK_NORMALIZATION.get(runtimeTrack);
}

function collectReleaseTrackMarkers(value, markers = []) {
  if (typeof value === "string") {
    const match = value.match(RELEASE_TRACK_MARKER_PATTERN);
    if (match) markers.push(match[1]);
    return markers;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReleaseTrackMarkers(item, markers);
    return markers;
  }
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectReleaseTrackMarkers(child, markers);
  }
  return markers;
}

function parseEmbeddedAppConfig(appPath, commandRunner) {
  const configPath = path.join(appPath, "EXConstants.bundle", "app.config");
  if (!fs.existsSync(configPath)) {
    throw new Error("Archived app payload is missing EXConstants.bundle/app.config.");
  }
  const configStat = fs.lstatSync(configPath);
  if (configStat.isSymbolicLink() || !configStat.isFile()) {
    throw new Error("Archived EXConstants app config must be a real file.");
  }
  assertInsideDirectory(
    fs.realpathSync(appPath),
    fs.realpathSync(configPath),
    "Archived EXConstants app config",
  );

  const raw = fs.readFileSync(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    const result = requireCommand(
      commandRunner,
      "plutil",
      ["-convert", "json", "-o", "-", "--", configPath],
      {},
      "Archived EXConstants app config parsing",
    );
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error("Archived EXConstants app config is not a readable structured plist.");
    }
  }
}

export function inspectEmbeddedReleaseConfig(appPath, commandRunner = defaultCommandRunner) {
  const appConfig = parseEmbeddedAppConfig(appPath, commandRunner);
  if (!appConfig || typeof appConfig !== "object" || Array.isArray(appConfig)) {
    throw new Error("Archived EXConstants app config must be a dictionary.");
  }

  const markers = collectReleaseTrackMarkers(appConfig);
  if (markers.length === 0) {
    throw new Error("Archived app payload is missing the embedded GuidePup release-track marker.");
  }
  const uniqueMarkers = [...new Set(markers)];
  if (uniqueMarkers.length > 1) {
    throw new Error(
      `Archived app payload contains contradictory release-track markers: ${uniqueMarkers.join(", ")}.`,
    );
  }
  if (markers.length > 1) {
    throw new Error("Archived app payload contains a duplicate release-track marker.");
  }

  const marker = appConfig.extra?.guidePupReleaseTrackMarker;
  const markerMatch = typeof marker === "string"
    ? marker.match(RELEASE_TRACK_MARKER_PATTERN)
    : undefined;
  if (!markerMatch) {
    throw new Error("Archived app payload has a malformed structured release-track marker.");
  }

  const runtimeTrack = markerMatch[1];
  const normalizedTrack = normalizeEmbeddedReleaseTrack(runtimeTrack);
  if (!normalizedTrack) {
    throw new Error(`Archived app payload contains unsupported release-track marker "${runtimeTrack}".`);
  }

  const binding = appConfig.extra?.guidePupReleaseBinding;
  const runtimeConfig = normalizeExpectedReleaseRuntimeConfig(
    binding,
    "Archived GuidePup release binding",
  );
  const bindingKeys = Object.keys(binding).sort();
  const expectedBindingKeys = [...RELEASE_RUNTIME_CONFIG_FIELDS].sort();
  if (
    bindingKeys.length !== expectedBindingKeys.length
    || bindingKeys.some((key, index) => key !== expectedBindingKeys[index])
  ) {
    throw new Error("Archived GuidePup release binding has unexpected or missing fields.");
  }
  if (runtimeConfig.releaseTrack !== runtimeTrack) {
    throw new Error(
      `Archived release binding track "${runtimeConfig.releaseTrack}" contradicts marker track "${runtimeTrack}".`,
    );
  }
  const candidateBinding = normalizeEmbeddedCandidateBinding(
    appConfig.extra?.guidePupCandidateBinding,
    runtimeConfig,
    "Archived GuidePup candidate binding",
  );

  return {
    buildProfile: normalizedTrack,
    candidateBinding,
    evidenceTrack: normalizedTrack,
    markerCount: 1,
    markerSource: "expo-constants-app-config",
    runtimeConfig,
    runtimeTrack,
  };
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

export function validateReleaseCandidateEvidenceStructure(
  artifact,
  expectedInput,
) {
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
  check(
    SHA256_PATTERN.test(archive.normalizedPayloadSha256 ?? ""),
    "archive.normalizedPayloadSha256 must be 64 lowercase hexadecimal characters",
  );
  check(archive.bundleIdentifier === expected.bundleIdentifier, "archive.bundleIdentifier does not match expected");
  check(archive.appVersion === expected.appVersion, "archive.appVersion does not match expected");
  check(archive.buildNumber === expected.buildNumber, "archive.buildNumber does not match expected");
  check(archive.teamIdentifier === expected.teamIdentifier, "archive.teamIdentifier does not match expected");
  check(archive.applicationIdentifier === `${expected.teamIdentifier}.${expected.bundleIdentifier}`, "archive.applicationIdentifier does not match expected");
  check(archive.betaReportsActive === true, "archive.betaReportsActive must be true");
  check(
    SHA256_PATTERN.test(archive.entitlementsSha256 ?? ""),
    "archive.entitlementsSha256 must be 64 lowercase hexadecimal characters",
  );
  check(archive.getTaskAllow === false, "archive.getTaskAllow must be false");
  check(archive.signing?.codesignVerified === true, "archive signing must be verified");
  check(archive.signing?.certificateClass === "Apple Distribution", "archive signing class must be Apple Distribution");
  check(
    archive.signing?.distributionMethod === "app-store",
    "archive signing distribution method must be app-store",
  );
  check(archive.signing?.teamIdentifier === expected.teamIdentifier, "archive signing team does not match expected");
  check(archive.sentry?.configuredDsnFound === false, "archive contains a configured Sentry DSN marker");
  check(archive.sentry?.crashDataManifestFound === false, "archive contains a Crash Data privacy-manifest declaration");
  check(archive.sentry?.sdkEmbedded === false, "archive contains an embedded Sentry SDK payload");

  const declarationEntries = [
    ["sourceInfoPlistDeclarations", artifact.sourceInfoPlistDeclarations ?? {}],
    ["archive.bundleDeclarations", archive.bundleDeclarations ?? {}],
    ["ipa.bundleDeclarations", artifact.ipa?.bundleDeclarations ?? {}],
    [
      "validationIpa.bundleDeclarations",
      artifact.validationIpa?.bundleDeclarations ?? {},
    ],
  ];
  for (const [label, declarations] of declarationEntries) {
    check(
      SHA256_PATTERN.test(declarations.canonicalSha256 ?? ""),
      `${label}.canonicalSha256 must be 64 lowercase hexadecimal characters`,
    );
    check(
      declarations.itsAppUsesNonExemptEncryption === false,
      `${label}.itsAppUsesNonExemptEncryption must be false`,
    );
    check(
      declarations.cameraUsageDescriptionPresent === true,
      `${label}.cameraUsageDescriptionPresent must be true`,
    );
    check(
      declarations.microphoneUsageDescriptionPresent === true,
      `${label}.microphoneUsageDescriptionPresent must be true`,
    );
    check(
      declarations.speechRecognitionUsageDescriptionPresent === true,
      `${label}.speechRecognitionUsageDescriptionPresent must be true`,
    );
  }
  const sourceInfoPlistDeclarations =
    artifact.sourceInfoPlistDeclarations ?? {};
  for (const [label, declarations] of declarationEntries.slice(1)) {
    for (const field of Object.keys(BUNDLE_DECLARATION_EVIDENCE_SHAPE)) {
      check(
        declarations[field] === sourceInfoPlistDeclarations[field],
        `${label}.${field} does not match sourceInfoPlistDeclarations.${field}`,
      );
    }
  }

  const release = artifact.release ?? {};
  const normalizedReleaseTrack = normalizeEmbeddedReleaseTrack(release.runtimeTrack);
  check(
    isNonEmptyString(release.runtimeTrack) && Boolean(normalizedReleaseTrack),
    "release.runtimeTrack is missing or unsupported",
  );
  check(release.markerSource === "expo-constants-app-config", "release.markerSource is invalid");
  check(release.markerCount === 1, "release.markerCount must be exactly 1");
  check(
    release.buildProfile === normalizedReleaseTrack,
    "release.buildProfile contradicts release.runtimeTrack",
  );
  check(
    release.evidenceTrack === normalizedReleaseTrack,
    "release.evidenceTrack contradicts release.runtimeTrack",
  );
  let normalizedRuntimeConfig;
  try {
    normalizedRuntimeConfig = normalizeExpectedReleaseRuntimeConfig(
      release.runtimeConfig,
      "release.runtimeConfig",
    );
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  if (normalizedRuntimeConfig && normalizedReleaseTrack) {
    check(
      normalizedRuntimeConfig.releaseTrack === release.runtimeTrack,
      "release.runtimeConfig.releaseTrack contradicts release.runtimeTrack",
    );
    const expectedRuntimeConfig = expected.releaseRuntimeConfigs[normalizedReleaseTrack];
    for (const field of RELEASE_RUNTIME_CONFIG_FIELDS) {
      check(
        normalizedRuntimeConfig[field] === expectedRuntimeConfig[field],
        `release.runtimeConfig.${field} does not match expected ${normalizedReleaseTrack} config`,
      );
    }
  }
  let normalizedCandidateBinding;
  if (normalizedRuntimeConfig) {
    try {
      normalizedCandidateBinding = normalizeEmbeddedCandidateBinding(
        release.candidateBinding,
        normalizedRuntimeConfig,
        "release.candidateBinding",
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (normalizedCandidateBinding) {
    check(
      normalizedCandidateBinding.appVersion === expected.appVersion,
      "release.candidateBinding.appVersion does not match expected",
    );
    check(
      normalizedCandidateBinding.buildNumber === expected.buildNumber,
      "release.candidateBinding.buildNumber does not match expected",
    );
    check(
      normalizedCandidateBinding.bundleIdentifier === expected.bundleIdentifier,
      "release.candidateBinding.bundleIdentifier does not match expected",
    );
    check(
      normalizedCandidateBinding.sourceRevision === expected.sourceRevision,
      "release.candidateBinding.sourceRevision does not match expected",
    );
    check(
      normalizedCandidateBinding.sourceRevision === artifact.sourceRevision,
      "release.candidateBinding.sourceRevision does not match artifact sourceRevision",
    );
    check(
      normalizedCandidateBinding.teamIdentifier === expected.teamIdentifier,
      "release.candidateBinding.teamIdentifier does not match expected",
    );
  }

  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(artifact.ipa?.name ?? "")
      && artifact.ipa.name.endsWith(".ipa"),
    "ipa.name must be an artifact name only",
  );
  check(
    SHA256_PATTERN.test(artifact.ipa?.sha256 ?? ""),
    "ipa.sha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(artifact.ipa?.appName ?? "")
      && artifact.ipa.appName.endsWith(".app"),
    "ipa.appName must be an artifact name only",
  );
  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(artifact.ipa?.binaryName ?? ""),
    "ipa.binaryName must be a file name only",
  );
  check(
    SHA256_PATTERN.test(artifact.ipa?.binarySha256 ?? ""),
    "ipa.binarySha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    SHA256_PATTERN.test(artifact.ipa?.normalizedPayloadSha256 ?? ""),
    "ipa.normalizedPayloadSha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    artifact.ipa?.normalizedPayloadSha256
      === archive.normalizedPayloadSha256,
    "archive and IPA normalized payload digests must match",
  );
  check(artifact.ipa?.payloadInspected === true, "ipa payload must be inspected");
  check(
    artifact.ipa?.bundleIdentifier === expected.bundleIdentifier,
    "ipa.bundleIdentifier does not match expected",
  );
  check(
    artifact.ipa?.appVersion === expected.appVersion,
    "ipa.appVersion does not match expected",
  );
  check(
    artifact.ipa?.buildNumber === expected.buildNumber,
    "ipa.buildNumber does not match expected",
  );
  check(
    artifact.ipa?.teamIdentifier === expected.teamIdentifier,
    "ipa.teamIdentifier does not match expected",
  );
  check(
    artifact.ipa?.applicationIdentifier
      === `${expected.teamIdentifier}.${expected.bundleIdentifier}`,
    "ipa.applicationIdentifier does not match expected",
  );
  check(
    artifact.ipa?.betaReportsActive === true,
    "ipa.betaReportsActive must be true",
  );
  check(
    SHA256_PATTERN.test(artifact.ipa?.entitlementsSha256 ?? ""),
    "ipa.entitlementsSha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    artifact.ipa?.entitlementsSha256 === archive.entitlementsSha256,
    "archive and IPA signed entitlement digests must match",
  );
  check(artifact.ipa?.getTaskAllow === false, "ipa.getTaskAllow must be false");
  check(
    artifact.ipa?.signing?.codesignVerified === true,
    "ipa signing must be verified",
  );
  check(
    artifact.ipa?.signing?.certificateClass === "Apple Distribution",
    "ipa signing class must be Apple Distribution",
  );
  check(
    artifact.ipa?.signing?.distributionMethod === "app-store",
    "ipa signing distribution method must be app-store",
  );
  check(
    artifact.ipa?.signing?.teamIdentifier === expected.teamIdentifier,
    "ipa signing team does not match expected",
  );
  check(
    artifact.ipa?.sentry?.configuredDsnFound === false,
    "ipa contains a configured Sentry DSN marker",
  );
  check(
    artifact.ipa?.sentry?.crashDataManifestFound === false,
    "ipa contains a Crash Data privacy-manifest declaration",
  );
  check(
    artifact.ipa?.sentry?.sdkEmbedded === false,
    "ipa contains an embedded Sentry SDK payload",
  );
  check(
    artifact.ipa?.candidateIdentifier
      === release.candidateBinding?.candidateIdentifier,
    "ipa.candidateIdentifier does not match the signed archive binding",
  );

  const validationIpa = artifact.validationIpa ?? {};
  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(validationIpa.name ?? "")
      && validationIpa.name.endsWith(".ipa"),
    "validationIpa.name must be an artifact name only",
  );
  check(
    SHA256_PATTERN.test(validationIpa.sha256 ?? ""),
    "validationIpa.sha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(validationIpa.appName ?? "")
      && validationIpa.appName.endsWith(".app"),
    "validationIpa.appName must be an artifact name only",
  );
  check(
    SAFE_ARTIFACT_NAME_PATTERN.test(validationIpa.binaryName ?? ""),
    "validationIpa.binaryName must be a file name only",
  );
  check(
    SHA256_PATTERN.test(validationIpa.binarySha256 ?? ""),
    "validationIpa.binarySha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    SHA256_PATTERN.test(validationIpa.normalizedPayloadSha256 ?? ""),
    "validationIpa.normalizedPayloadSha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    validationIpa.normalizedPayloadSha256
      === archive.normalizedPayloadSha256,
    "archive and validation IPA normalized payload digests must match",
  );
  check(
    validationIpa.payloadInspected === true,
    "validationIpa payload must be inspected",
  );
  check(
    validationIpa.bundleIdentifier === expected.bundleIdentifier,
    "validationIpa.bundleIdentifier does not match expected",
  );
  check(
    validationIpa.appVersion === expected.appVersion,
    "validationIpa.appVersion does not match expected",
  );
  check(
    validationIpa.buildNumber === expected.buildNumber,
    "validationIpa.buildNumber does not match expected",
  );
  check(
    validationIpa.teamIdentifier === expected.teamIdentifier,
    "validationIpa.teamIdentifier does not match expected",
  );
  check(
    validationIpa.applicationIdentifier
      === `${expected.teamIdentifier}.${expected.bundleIdentifier}`,
    "validationIpa.applicationIdentifier does not match expected",
  );
  check(
    validationIpa.betaReportsActive === false,
    "validationIpa.betaReportsActive must be false",
  );
  check(
    SHA256_PATTERN.test(validationIpa.entitlementsSha256 ?? ""),
    "validationIpa.entitlementsSha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    validationIpa.signing?.codesignVerified === true,
    "validationIpa signing must be verified",
  );
  const validationDistributionMethod =
    validationIpa.signing?.distributionMethod;
  check(
    validationDistributionMethod === "development"
      || validationDistributionMethod === "ad-hoc",
    "validationIpa signing distribution method must be development or ad-hoc",
  );
  check(
    (
      validationDistributionMethod === "development"
      && validationIpa.signing?.certificateClass === "Apple Development"
      && validationIpa.getTaskAllow === true
    )
      || (
        validationDistributionMethod === "ad-hoc"
        && validationIpa.signing?.certificateClass === "Apple Distribution"
        && validationIpa.getTaskAllow === false
      ),
    `validationIpa signing class and get-task-allow must match its installable distribution method (found ${validationIpa.signing?.certificateClass ?? "missing"}/${validationDistributionMethod ?? "missing"}/${String(validationIpa.getTaskAllow)})`,
  );
  check(
    validationIpa.signing?.teamIdentifier === expected.teamIdentifier,
    "validationIpa signing team does not match expected",
  );
  check(
    Number.isInteger(validationIpa.provisionedDeviceCount)
      && validationIpa.provisionedDeviceCount >= 1
      && validationIpa.provisionedDeviceCount <= 10_000,
    "validationIpa.provisionedDeviceCount must prove a bounded device-authorized profile",
  );
  check(
    validationIpa.sentry?.configuredDsnFound === false,
    "validationIpa contains a configured Sentry DSN marker",
  );
  check(
    validationIpa.sentry?.crashDataManifestFound === false,
    "validationIpa contains a Crash Data privacy-manifest declaration",
  );
  check(
    validationIpa.sentry?.sdkEmbedded === false,
    "validationIpa contains an embedded Sentry SDK payload",
  );
  check(
    validationIpa.candidateIdentifier
      === release.candidateBinding?.candidateIdentifier,
    "validationIpa.candidateIdentifier does not match the signed archive binding",
  );

  const payloadBinding = artifact.payloadBinding ?? {};
  check(
    SHA256_PATTERN.test(payloadBinding.normalizedPayloadSha256 ?? ""),
    "payloadBinding.normalizedPayloadSha256 must be 64 lowercase hexadecimal characters",
  );
  check(
    payloadBinding.normalizedPayloadSha256
      === archive.normalizedPayloadSha256,
    "payloadBinding normalized payload digest must match the archive",
  );
  check(
    payloadBinding.normalizedPayloadSha256
      === artifact.ipa?.normalizedPayloadSha256,
    "payloadBinding normalized payload digest must match the Store IPA",
  );
  check(
    payloadBinding.normalizedPayloadSha256
      === validationIpa.normalizedPayloadSha256,
    "payloadBinding normalized payload digest must match the validation IPA",
  );
  check(
    payloadBinding.archiveMatches === true
      && payloadBinding.storeIpaMatches === true
      && payloadBinding.validationIpaMatches === true,
    "payloadBinding must affirm all freshly inspected normalized payload matches",
  );

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
  const unexpectedFields = findUnexpectedFields(
    artifact,
    RELEASE_CANDIDATE_EVIDENCE_SHAPE,
  );
  if (unexpectedFields.length > 0) {
    errors.push(`artifact contains unexpected fields: ${unexpectedFields.join(", ")}`);
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

export function validateReleaseCandidateEvidenceSourceBinding(
  artifact,
  expectedInput,
  options = {},
) {
  const structural = validateReleaseCandidateEvidenceStructure(
    artifact,
    expectedInput,
  );
  if (!structural.valid) {
    return structural;
  }

  let expected;
  try {
    expected = normalizeExpected(expectedInput);
    const trustedDeclarations = inspectBundleDeclarations(
      options.commandRunner ?? defaultCommandRunner,
      resolveSourceInfoPlistSource(options, expected),
      "Exact-revision source Info.plist",
    );
    requireMatchingBundleDeclarations(
      trustedDeclarations,
      artifact.sourceInfoPlistDeclarations,
      "Persisted candidate evidence",
    );
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : "Trusted candidate validation failed."],
      valid: false,
    };
  }
  return structural;
}

function collectEvidenceDifferencePaths(expected, actual, fieldPath = "artifact") {
  if (Object.is(expected, actual)) {
    return [];
  }
  if (
    expected === null
    || actual === null
    || typeof expected !== "object"
    || typeof actual !== "object"
    || Array.isArray(expected) !== Array.isArray(actual)
  ) {
    return [fieldPath];
  }
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      return [fieldPath];
    }
    return expected.flatMap((value, index) =>
      collectEvidenceDifferencePaths(value, actual[index], `${fieldPath}[${index}]`),
    );
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].flatMap((key) => {
    if (!(key in expected) || !(key in actual)) {
      return [`${fieldPath}.${key}`];
    }
    return collectEvidenceDifferencePaths(
      expected[key],
      actual[key],
      `${fieldPath}.${key}`,
    );
  });
}

export function compareReleaseCandidateEvidenceToInspection(
  persistedArtifact,
  inspectedArtifact,
) {
  if (
    !persistedArtifact
    || typeof persistedArtifact !== "object"
    || Array.isArray(persistedArtifact)
    || !inspectedArtifact
    || typeof inspectedArtifact !== "object"
    || Array.isArray(inspectedArtifact)
  ) {
    return { differences: ["artifact"], matches: false };
  }

  const persistedComparable = { ...persistedArtifact };
  const inspectedComparable = { ...inspectedArtifact };
  delete persistedComparable.generatedAt;
  delete inspectedComparable.generatedAt;
  const differences = collectEvidenceDifferencePaths(
    persistedComparable,
    inspectedComparable,
  );
  return { differences, matches: differences.length === 0 };
}

export async function validateReleaseCandidateEvidenceForLaunch(
  artifact,
  expectedInput,
  options = {},
) {
  const sourceBinding = validateReleaseCandidateEvidenceSourceBinding(
    artifact,
    expectedInput,
    options,
  );
  if (!sourceBinding.valid) {
    return sourceBinding;
  }
  for (const [field, label] of [
    ["archivePath", "Signed archive path"],
    ["ipaPath", "Store IPA path"],
    ["validationIpaPath", "Validation-twin IPA path"],
  ]) {
    if (!isNonEmptyString(options[field])) {
      return {
        errors: [`${label} is required for launch-grade candidate validation.`],
        valid: false,
      };
    }
  }

  try {
    const inspectedArtifact = await inspectReleaseCandidate({
      ...options,
      expected: expectedInput,
    });
    const comparison = compareReleaseCandidateEvidenceToInspection(
      artifact,
      inspectedArtifact,
    );
    if (!comparison.matches) {
      return {
        errors: [
          `Release candidate evidence does not match fresh archive, Store IPA, and validation IPA inspection at: ${comparison.differences.join(", ")}.`,
        ],
        valid: false,
      };
    }
    return { errors: [], valid: true };
  } catch (error) {
    return {
      errors: [
        error instanceof Error
          ? error.message
          : "Launch-grade candidate inspection failed.",
      ],
      valid: false,
    };
  }
}

export async function inspectReleaseCandidate(options) {
  const expected = normalizeExpected(options.expected);
  const archivePath = path.resolve(options.archivePath);
  if (!isNonEmptyString(options.ipaPath)) {
    throw new Error("Store candidate IPA path is required.");
  }
  const ipaPath = path.resolve(options.ipaPath);
  if (!isNonEmptyString(options.validationIpaPath)) {
    throw new Error(
      "Installable validation IPA path is required for release-candidate evidence.",
    );
  }
  const validationIpaPath = path.resolve(options.validationIpaPath);
  const commandRunner = options.commandRunner ?? defaultCommandRunner;
  const fileExists = options.fileExists ?? fs.existsSync;
  const hashFile = options.hashFile ?? defaultHashFile;
  const inspectSentryMarkers = options.inspectSentryMarkers ?? defaultInspectSentryMarkers;
  const inspectReleaseConfig =
    options.inspectReleaseConfig ?? inspectEmbeddedReleaseConfig;
  const ipaArchiveCommandRunner =
    options.ipaArchiveCommandRunner ?? defaultCommandRunner;

  if (!fileExists(archivePath)) {
    throw new Error("Candidate .xcarchive does not exist.");
  }
  if (!fileExists(ipaPath)) {
    throw new Error("Store candidate IPA does not exist.");
  }
  if (!fileExists(validationIpaPath)) {
    throw new Error("Installable validation IPA does not exist.");
  }
  const archiveManifestBefore = await snapshotDirectoryManifest(
    archivePath,
    hashFile,
    "Candidate archive",
  );
  const ipaIdentityBefore = snapshotFileIdentity(ipaPath);
  const ipaSha256Before = (await hashFile(ipaPath)).toLowerCase();
  const validationIpaIdentityBefore = snapshotFileIdentity(validationIpaPath);
  const validationIpaSha256Before =
    (await hashFile(validationIpaPath)).toLowerCase();
  const sourceInfoPlistDeclarations = inspectBundleDeclarations(
    commandRunner,
    resolveSourceInfoPlistSource(options, expected),
    "Exact-revision source Info.plist",
  );

  const archiveInfoSource = { filePath: path.join(archivePath, "Info.plist") };
  const archiveProperties = readPlistDictionaryFields(
    commandRunner,
    archiveInfoSource,
    ["ApplicationProperties"],
    [
      "ApplicationPath",
      "CFBundleIdentifier",
      "CFBundleShortVersionString",
      "CFBundleVersion",
      "SigningIdentity",
      "Team",
    ],
    "Archive ApplicationProperties",
  );
  const appPath = resolveArchivedAppPath(
    archivePath,
    archiveProperties.ApplicationPath,
    fileExists,
  );
  const appInfoSource = { filePath: path.join(appPath, "Info.plist") };
  const archiveBundleDeclarations = inspectBundleDeclarations(
    commandRunner,
    appInfoSource,
    "Archived app Info.plist",
  );
  const appInfo = {
    CFBundleExecutable: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleExecutable"],
      "App CFBundleExecutable",
      "string",
    ),
    CFBundleIdentifier: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleIdentifier"],
      "App CFBundleIdentifier",
    ),
    CFBundleShortVersionString: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleShortVersionString"],
      "App CFBundleShortVersionString",
    ),
    CFBundleVersion: extractPlistRaw(
      commandRunner,
      appInfoSource,
      ["CFBundleVersion"],
      "App CFBundleVersion",
    ),
  };
  const binaryName = appInfo.CFBundleExecutable;
  if (!isNonEmptyString(binaryName) || !SAFE_ARTIFACT_NAME_PATTERN.test(binaryName)) {
    throw new Error("App CFBundleExecutable must be a file name only.");
  }
  const binaryPath = path.resolve(appPath, binaryName);
  assertInsideDirectory(appPath, binaryPath, "App executable");
  if (!fileExists(binaryPath)) {
    throw new Error("App executable does not exist in the archive.");
  }
  const archivePayloadSha256Before = await hashNormalizedAppPayload(
    appPath,
    commandRunner,
    hashFile,
  );

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
    {},
    "Archive provisioning profile decode",
  ).stdout;
  const profileSource = { input: profileXml };
  extractPlistRaw(
    commandRunner,
    profileSource,
    ["TeamIdentifier"],
    "Provisioning profile TeamIdentifier",
    "array",
  );
  const profileTeam = extractPlistRaw(
    commandRunner,
    profileSource,
    ["TeamIdentifier", 0],
    "Provisioning profile team identifier",
  );
  extractPlistRaw(
    commandRunner,
    profileSource,
    ["Entitlements"],
    "Provisioning profile Entitlements",
    "dictionary",
  );
  const profileApplicationIdentifier = extractPlistRaw(
    commandRunner,
    profileSource,
    ["Entitlements", "application-identifier"],
    "Profile application identifier",
  );
  const profileGetTaskAllow = extractPlistBoolean(
    commandRunner,
    profileSource,
    ["Entitlements", "get-task-allow"],
    "Profile get-task-allow",
  );
  expectEqual(profileTeam, expected.teamIdentifier, "Provisioning profile team identifier");

  requireCommand(
    commandRunner,
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    {},
    "Archive signature verification",
  );
  const entitlementXml = requireCommand(
    commandRunner,
    "codesign",
    ["-d", "--entitlements", ":-", appPath],
    {},
    "Archive signed-entitlement extraction",
  ).stdout;
  const signedEntitlements = inspectStoreSignedEntitlements(
    commandRunner,
    entitlementXml,
    expected,
    "Archive signed entitlements",
  );
  const signingDetails = requireCommand(
    commandRunner,
    "codesign",
    ["-dvv", "--verbose=4", appPath],
    {},
    "Archive signing-detail inspection",
  );
  const signingText = `${signingDetails.stdout}\n${signingDetails.stderr}`;

  const applicationIdentifier = `${expected.teamIdentifier}.${expected.bundleIdentifier}`;
  expectEqual(profileApplicationIdentifier, applicationIdentifier, "Profile application identifier");
  expectEqual(
    signedEntitlements.applicationIdentifier,
    applicationIdentifier,
    "Codesign application identifier",
  );
  expectEqual(
    signedEntitlements.teamIdentifier,
    expected.teamIdentifier,
    "Codesign team identifier",
  );
  requireFalse(profileGetTaskAllow, "Profile get-task-allow");
  requireFalse(
    signedEntitlements.getTaskAllow,
    "Codesign get-task-allow",
  );
  if (!/Authority=Apple Distribution(?::|\n|$)/.test(signingText) && !String(archiveProperties.SigningIdentity ?? "").startsWith("Apple Distribution")) {
    throw new Error("Codesign identity is not an Apple Distribution identity.");
  }
  const signingTeamMatch = signingText.match(/(?:^|\n)TeamIdentifier=([A-Z0-9]+)/);
  if (signingTeamMatch) {
    expectEqual(signingTeamMatch[1], expected.teamIdentifier, "Codesign detail team identifier");
  }

  const sentry = inspectSentryMarkers(appPath, commandRunner);
  if (
    sentry.configuredDsnFound !== false
    || sentry.crashDataManifestFound !== false
    || sentry.sdkEmbedded !== false
  ) {
    throw new Error("Archived app contains Sentry SDK, DSN, or Crash Data manifest markers.");
  }
  const release = inspectReleaseConfig(appPath, commandRunner);
  const ipaExtraction = extractIpaAppBundle(ipaPath, ipaArchiveCommandRunner);
  let ipaInspection;
  let ipaNormalizedPayloadSha256;
  try {
    ipaInspection = await inspectIpaAppBundle({
      appPath: ipaExtraction.appPath,
      commandRunner,
      distributionPurpose: "store",
      expected,
      hashFile,
      inspectReleaseConfig,
      inspectSentryMarkers,
    });
    ipaNormalizedPayloadSha256 = await hashNormalizedAppPayload(
      ipaExtraction.appPath,
      commandRunner,
      hashFile,
    );
  } finally {
    ipaExtraction.cleanup();
  }
  const validationIpaExtraction = extractIpaAppBundle(
    validationIpaPath,
    ipaArchiveCommandRunner,
  );
  let validationIpaInspection;
  let validationIpaNormalizedPayloadSha256;
  try {
    validationIpaInspection = await inspectIpaAppBundle({
      appPath: validationIpaExtraction.appPath,
      commandRunner,
      distributionPurpose: "validation",
      expected,
      hashFile,
      inspectReleaseConfig,
      inspectSentryMarkers,
    });
    validationIpaNormalizedPayloadSha256 = await hashNormalizedAppPayload(
      validationIpaExtraction.appPath,
      commandRunner,
      hashFile,
    );
  } finally {
    validationIpaExtraction.cleanup();
  }
  const archiveNormalizedPayloadSha256 = await hashNormalizedAppPayload(
    appPath,
    commandRunner,
    hashFile,
  );
  const archiveBinarySha256 = (await hashFile(binaryPath)).toLowerCase();
  const archiveManifestAfter = await snapshotDirectoryManifest(
    archivePath,
    hashFile,
    "Candidate archive",
  );
  requireMatchingBundleDeclarations(
    sourceInfoPlistDeclarations,
    archiveBundleDeclarations,
    "Archived app",
  );
  requireMatchingBundleDeclarations(
    sourceInfoPlistDeclarations,
    ipaInspection.bundleDeclarations,
    "Store IPA app",
  );
  requireMatchingBundleDeclarations(
    sourceInfoPlistDeclarations,
    validationIpaInspection.bundleDeclarations,
    "Validation IPA app",
  );
  if (
    archiveNormalizedPayloadSha256 !== archivePayloadSha256Before
    || archiveManifestAfter !== archiveManifestBefore
  ) {
    throw new Error(
      "Candidate archive changed while it was being inspected.",
    );
  }
  if (
    archiveNormalizedPayloadSha256 !== ipaNormalizedPayloadSha256
  ) {
    throw new Error(
      "Candidate archive and IPA contain different normalized app payloads.",
    );
  }
  if (
    archiveNormalizedPayloadSha256
      !== validationIpaNormalizedPayloadSha256
  ) {
    throw new Error(
      "Candidate archive and installable validation IPA contain different normalized app payloads.",
    );
  }
  if (
    signedEntitlements.entitlementsSha256
      !== ipaInspection.entitlementsSha256
  ) {
    throw new Error(
      "Candidate archive and IPA contain different signed entitlements.",
    );
  }
  const ipaIdentityBeforeFinalHash = snapshotFileIdentity(ipaPath);
  const ipaSha256After = (await hashFile(ipaPath)).toLowerCase();
  const ipaIdentityAfter = snapshotFileIdentity(ipaPath);
  if (
    !sameFileIdentity(ipaIdentityBefore, ipaIdentityBeforeFinalHash)
    || !sameFileIdentity(ipaIdentityBefore, ipaIdentityAfter)
    || !sameFileIdentity(ipaIdentityBeforeFinalHash, ipaIdentityAfter)
    || ipaSha256Before !== ipaSha256After
  ) {
    throw new Error(
      "Candidate IPA changed while it was being inspected.",
    );
  }
  const validationIpaIdentityBeforeFinalHash =
    snapshotFileIdentity(validationIpaPath);
  const validationIpaSha256After =
    (await hashFile(validationIpaPath)).toLowerCase();
  const validationIpaIdentityAfter = snapshotFileIdentity(validationIpaPath);
  if (
    !sameFileIdentity(
      validationIpaIdentityBefore,
      validationIpaIdentityBeforeFinalHash,
    )
    || !sameFileIdentity(
      validationIpaIdentityBeforeFinalHash,
      validationIpaIdentityAfter,
    )
    || validationIpaSha256Before !== validationIpaSha256After
  ) {
    throw new Error(
      "Installable validation IPA changed while it was being inspected.",
    );
  }
  const ipaRelease = ipaInspection.release;
  if (
    ipaRelease.candidateBinding.candidateIdentifier
      !== release.candidateBinding.candidateIdentifier
  ) {
    throw new Error(
      "Candidate IPA signed binding does not match the inspected archive binding.",
    );
  }
  if (
    ipaRelease.runtimeTrack !== release.runtimeTrack
    || ipaRelease.buildProfile !== release.buildProfile
    || JSON.stringify(ipaRelease.runtimeConfig)
      !== JSON.stringify(release.runtimeConfig)
  ) {
    throw new Error(
      "Candidate IPA runtime release binding does not match the inspected archive.",
    );
  }
  const validationIpaRelease = validationIpaInspection.release;
  if (
    validationIpaRelease.candidateBinding.candidateIdentifier
      !== release.candidateBinding.candidateIdentifier
  ) {
    throw new Error(
      "Installable validation IPA signed binding does not match the inspected archive binding.",
    );
  }
  if (
    validationIpaRelease.runtimeTrack !== release.runtimeTrack
    || validationIpaRelease.buildProfile !== release.buildProfile
    || JSON.stringify(validationIpaRelease.runtimeConfig)
      !== JSON.stringify(release.runtimeConfig)
  ) {
    throw new Error(
      "Installable validation IPA runtime release binding does not match the inspected archive.",
    );
  }
  const { release: _ipaRelease, ...ipaPayloadEvidence } = ipaInspection;
  const {
    release: _validationIpaRelease,
    ...validationIpaPayloadEvidence
  } = validationIpaInspection;

  const artifact = {
    artifactType: RELEASE_CANDIDATE_ARTIFACT_TYPE,
    artifactVersion: RELEASE_CANDIDATE_ARTIFACT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    sourceRevision: expected.sourceRevision,
    archive: {
      appName: path.basename(appPath),
      applicationIdentifier,
      appVersion: expected.appVersion,
      betaReportsActive: signedEntitlements.betaReportsActive,
      binaryName,
      binarySha256: archiveBinarySha256,
      bundleDeclarations: archiveBundleDeclarations,
      buildNumber: expected.buildNumber,
      bundleIdentifier: expected.bundleIdentifier,
      entitlementsSha256: signedEntitlements.entitlementsSha256,
      getTaskAllow: false,
      name: path.basename(archivePath),
      normalizedPayloadSha256: archiveNormalizedPayloadSha256,
      sentry: {
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      },
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        distributionMethod: "app-store",
        teamIdentifier: expected.teamIdentifier,
      },
      teamIdentifier: expected.teamIdentifier,
    },
    ipa: {
      ...ipaPayloadEvidence,
      name: path.basename(ipaPath),
      normalizedPayloadSha256: ipaNormalizedPayloadSha256,
      sha256: ipaSha256After,
    },
    payloadBinding: {
      archiveMatches: true,
      normalizedPayloadSha256: archiveNormalizedPayloadSha256,
      storeIpaMatches: true,
      validationIpaMatches: true,
    },
    release,
    sourceInfoPlistDeclarations,
    privacy: {
      containsAbsolutePaths: false,
      containsAppContent: false,
      containsCredentials: false,
      containsDeviceIdentifiers: false,
      containsProfiles: false,
      containsSignedUrls: false,
    },
    validationIpa: {
      ...validationIpaPayloadEvidence,
      name: path.basename(validationIpaPath),
      normalizedPayloadSha256: validationIpaNormalizedPayloadSha256,
      sha256: validationIpaSha256After,
    },
  };

  const validation = validateReleaseCandidateEvidenceStructure(
    artifact,
    expected,
  );
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
    repositoryRoot:
      sourceState.repositoryRoot
      ?? options.repositoryRoot
      ?? DEFAULT_REPOSITORY_ROOT,
  });
  const validation = validateReleaseCandidateEvidenceStructure(
    artifact,
    expected,
  );
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
    const easJson = JSON.parse(fs.readFileSync(path.join(projectDir, "eas.json"), "utf8"));
    const artifact = await generateReleaseCandidateEvidence({
      archivePath: requireCliValue(values, "archive"),
      expected: {
        appVersion: requireCliValue(values, "expected-app-version"),
        buildNumber: requireCliValue(values, "expected-build-number"),
        bundleIdentifier: requireCliValue(values, "expected-bundle-identifier"),
        releaseRuntimeConfigs: buildExpectedReleaseRuntimeConfigs(easJson),
        sourceRevision: requireCliValue(values, "expected-source-revision"),
        teamIdentifier: requireCliValue(values, "expected-team-identifier"),
      },
      ipaPath: requireCliValue(values, "ipa"),
      validationIpaPath: requireCliValue(values, "validation-ipa"),
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
