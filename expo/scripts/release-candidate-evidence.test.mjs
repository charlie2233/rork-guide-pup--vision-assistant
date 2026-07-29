import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildExpectedReleaseRuntimeConfigs,
  buildGuidePupCandidateBinding,
  canonicalizeReleaseManifestPaths,
  compareReleaseCandidateEvidenceToInspection,
  generateReleaseCandidateEvidence,
  inspectReleaseCandidate,
  validateReleaseCandidateEvidenceForLaunch,
  validateReleaseCandidateEvidenceSourceBinding,
  validateReleaseCandidateEvidenceStructure,
} from "./release-candidate-evidence.mjs";

const EAS_JSON = {
  build: {
    preview: {
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://staging.example.test",
        EXPO_PUBLIC_APP_ENV: "preview",
        EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS: "false",
        EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://guidepup.example/privacy",
        EXPO_PUBLIC_RELEASE_TRACK: "internal-preview",
        EXPO_PUBLIC_SUPPORT_URL: "https://guidepup.example/support",
        EXPO_PUBLIC_WEBSITE_URL: "https://guidepup.example",
      },
    },
    store: {
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://production.example.test",
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS: "false",
        EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://guidepup.example/privacy",
        EXPO_PUBLIC_RELEASE_TRACK: "app-store",
        EXPO_PUBLIC_SUPPORT_URL: "https://guidepup.example/support",
        EXPO_PUBLIC_WEBSITE_URL: "https://guidepup.example",
      },
    },
    testflight: {
      env: {
        EXPO_PUBLIC_API_BASE_URL: "https://production.example.test",
        EXPO_PUBLIC_APP_ENV: "production",
        EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS: "false",
        EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://guidepup.example/privacy",
        EXPO_PUBLIC_RELEASE_TRACK: "testflight",
        EXPO_PUBLIC_SUPPORT_URL: "https://guidepup.example/support",
        EXPO_PUBLIC_WEBSITE_URL: "https://guidepup.example",
      },
    },
  },
};
const RELEASE_RUNTIME_CONFIGS = buildExpectedReleaseRuntimeConfigs(EAS_JSON);
const RELEASE_CANDIDATE_SCRIPT_PATH = fileURLToPath(
  new URL("./release-candidate-evidence.mjs", import.meta.url),
);
const SOURCE_INFO_PLIST_REPOSITORY_PATH =
  "expo/ios/GuidePupVisionAssistant/Info.plist";
const EXPECTED = {
  appVersion: "1.0.0",
  buildNumber: "4",
  bundleIdentifier: "app.rork.guide-pup-vision-assist",
  releaseRuntimeConfigs: RELEASE_RUNTIME_CONFIGS,
  sourceRevision: "a".repeat(40),
  teamIdentifier: "K99RADPB9G",
};
const BUNDLE_DECLARATIONS = {
  ITSAppUsesNonExemptEncryption: false,
  NSCameraUsageDescription:
    "Guide Pup uses the camera for assistive scene analysis.",
  NSMicrophoneUsageDescription:
    "Guide Pup uses the microphone for optional voice commands.",
  NSSpeechRecognitionUsageDescription:
    "Guide Pup uses speech recognition for optional voice commands.",
};

function bundleDeclarations(overrides = {}) {
  return {
    ...BUNDLE_DECLARATIONS,
    ...overrides,
  };
}

function sourceInfoForOverrides(overrides = {}) {
  return bundleDeclarations(overrides.sourceInfo);
}

function sourceInfoPlistBytes(sourceInfo) {
  return JSON.stringify(sourceInfo);
}

function boundedGitCommandRunner(
  repositoryRoot,
  sourceRevision,
  plistBytes,
  response = {},
) {
  return (command, args, options = {}) => {
    assert.equal(command, "git");
    assert.deepEqual(args, [
      "show",
      `${sourceRevision}:${SOURCE_INFO_PLIST_REPOSITORY_PATH}`,
    ]);
    assert.equal(options.cwd, repositoryRoot);
    return {
      status: response.status ?? 0,
      stderr: response.stderr ?? "",
      stdout: response.stdout ?? plistBytes,
    };
  };
}

function trustedValidationOptions(options) {
  return {
    commandRunner: options.commandRunner,
    gitCommandRunner: options.gitCommandRunner,
    repositoryRoot: options.repositoryRoot,
  };
}

function launchValidationOptions(options) {
  return {
    ...options,
    now: new Date("2026-07-19T22:30:00.000Z"),
  };
}

function runtimeConfigForTrack(runtimeTrack) {
  const profile = runtimeTrack === "app-store"
    ? "store"
    : runtimeTrack === "testflight"
      ? "testflight"
      : "preview";
  return {
    ...RELEASE_RUNTIME_CONFIGS[profile],
    releaseTrack: runtimeTrack,
  };
}

function candidateBindingForTrack(runtimeTrack) {
  return buildGuidePupCandidateBinding({
    appVersion: EXPECTED.appVersion,
    buildNumber: EXPECTED.buildNumber,
    bundleIdentifier: EXPECTED.bundleIdentifier,
    releaseBinding: runtimeConfigForTrack(runtimeTrack),
    sourceRevision: EXPECTED.sourceRevision,
    teamIdentifier: EXPECTED.teamIdentifier,
  });
}

function embeddedAppConfig(runtimeTrack = "app-store", extra = {}) {
  return {
    extra: {
      guidePupCandidateBinding: candidateBindingForTrack(runtimeTrack),
      guidePupReleaseBinding: runtimeConfigForTrack(runtimeTrack),
      guidePupReleaseTrackMarker: `guidepup-release-track:${runtimeTrack}`,
      ...extra,
    },
  };
}

function expectedReleaseEvidence(runtimeTrack = "app-store") {
  const normalizedTrack = runtimeTrack === "app-store"
    ? "store"
    : runtimeTrack === "testflight"
      ? "testflight"
      : "preview";
  return {
    buildProfile: normalizedTrack,
    candidateBinding: candidateBindingForTrack(runtimeTrack),
    evidenceTrack: normalizedTrack,
    markerCount: 1,
    markerSource: "expo-constants-app-config",
    runtimeConfig: runtimeConfigForTrack(runtimeTrack),
    runtimeTrack,
  };
}

function writeIpaFromApp(root, appPath, ipaPath) {
  const packageRoot = fs.mkdtempSync(path.join(root, "ipa-package-"));
  try {
    const payloadPath = path.join(packageRoot, "Payload");
    fs.mkdirSync(payloadPath, { recursive: true });
    fs.cpSync(appPath, path.join(payloadPath, path.basename(appPath)), {
      recursive: true,
    });
    fs.rmSync(ipaPath, { force: true });
    const result = spawnSync(
      "zip",
      ["-qry", ipaPath, "Payload"],
      { cwd: packageRoot, encoding: "utf8" },
    );
    assert.equal(
      result.status,
      0,
      `zip failed: ${result.stderr || result.stdout}`,
    );
  } finally {
    fs.rmSync(packageRoot, { force: true, recursive: true });
  }
}

function makeFakeCandidate(t, rootPrefix = "guidepup-candidate-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), rootPrefix));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const archivePath = path.join(root, "GuidePup-1.0.0-4.xcarchive");
  const appPath = path.join(archivePath, "Products", "Applications", "GuidePup.app");
  const binaryPath = path.join(appPath, "GuidePup");
  const ipaPath = path.join(root, "GuidePup-1.0.0-4.ipa");
  const validationAppPath = path.join(root, "GuidePupValidation.app");
  const validationIpaPath = path.join(
    root,
    "GuidePup-1.0.0-4-validation.ipa",
  );
  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(archivePath, "Info.plist"), "archive plist placeholder");
  fs.writeFileSync(path.join(appPath, "Info.plist"), "app plist placeholder");
  fs.writeFileSync(path.join(appPath, "embedded.mobileprovision"), "profile placeholder");
  fs.mkdirSync(path.join(appPath, "_CodeSignature"));
  fs.writeFileSync(
    path.join(appPath, "_CodeSignature", "CodeResources"),
    "archive signature placeholder",
  );
  fs.mkdirSync(path.join(appPath, "EXConstants.bundle"), { recursive: true });
  fs.writeFileSync(
    path.join(appPath, "EXConstants.bundle", "app.config"),
    JSON.stringify(embeddedAppConfig()),
  );
  fs.writeFileSync(binaryPath, "signed app binary");
  writeIpaFromApp(root, appPath, ipaPath);
  fs.cpSync(appPath, validationAppPath, { recursive: true });
  fs.writeFileSync(
    path.join(validationAppPath, "embedded.mobileprovision"),
    "validation profile placeholder",
  );
  fs.mkdirSync(path.join(validationAppPath, "_CodeSignature"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(validationAppPath, "_CodeSignature", "CodeResources"),
    "validation signature only",
  );
  writeIpaFromApp(root, validationAppPath, validationIpaPath);

  return {
    appPath,
    archivePath,
    binaryPath,
    ipaPath,
    root,
    validationAppPath,
    validationIpaPath,
  };
}

function writeMatchingStoreAndValidationIpas(candidate) {
  for (const relativePath of [
    "Info.plist",
    "GuidePup",
    path.join("EXConstants.bundle", "app.config"),
  ]) {
    fs.copyFileSync(
      path.join(candidate.appPath, relativePath),
      path.join(candidate.validationAppPath, relativePath),
    );
  }
  writeIpaFromApp(candidate.root, candidate.appPath, candidate.ipaPath);
  writeIpaFromApp(
    candidate.root,
    candidate.validationAppPath,
    candidate.validationIpaPath,
  );
}

const PROFILE_PLIST_MARKER = "profile plist marker";
const ENTITLEMENTS_PLIST_MARKER = "entitlements plist marker";
const IPA_ENTITLEMENTS_PLIST_MARKER = "ipa entitlements plist marker";
const VALIDATION_PROFILE_PLIST_MARKER = "validation profile plist marker";
const VALIDATION_ENTITLEMENTS_PLIST_MARKER =
  "validation entitlements plist marker";

function splitPlistKeyPath(keyPath) {
  const components = [];
  let component = "";
  let escaped = false;
  for (const character of keyPath) {
    if (escaped) {
      component += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === ".") {
      components.push(component);
      component = "";
    } else {
      component += character;
    }
  }
  components.push(component);
  return components;
}

function plistValueAt(root, keyPath) {
  return splitPlistKeyPath(keyPath).reduce((value, component) => {
    if (Array.isArray(value) && /^\d+$/u.test(component)) {
      return value[Number(component)];
    }
    return value?.[component];
  }, root);
}

function plistValueType(value) {
  if (Array.isArray(value)) return "array";
  if (Buffer.isBuffer(value)) return "data";
  if (value instanceof Date) return "date";
  if (value !== null && typeof value === "object") return "dictionary";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";
  if (typeof value === "string") return "string";
  return undefined;
}

function fakePlutilExtract(root, args) {
  assert.equal(args[0], "-extract");
  assert.equal(args[2], "raw");
  const value = plistValueAt(root, args[1]);
  const actualType = plistValueType(value);
  const expectIndex = args.indexOf("-expect");
  const expectedType = expectIndex >= 0 ? args[expectIndex + 1] : undefined;
  if (!actualType || (expectedType && actualType !== expectedType)) {
    return {
      status: 1,
      stdout: `Could not extract ${args[1]}.`,
      stderr: "",
    };
  }
  let stdout;
  if (actualType === "dictionary") stdout = Object.keys(value).join("\n");
  else if (actualType === "array") stdout = String(value.length);
  else if (actualType === "bool") stdout = String(value);
  else if (actualType === "data") stdout = value.toString("base64");
  else if (actualType === "date") stdout = value.toISOString();
  else stdout = String(value);
  return { status: 0, stdout, stderr: "" };
}

function fakeCommandRunner(
  candidate,
  overrides = {},
  exactRevisionPlistBytes = sourceInfoPlistBytes(
    sourceInfoForOverrides(overrides),
  ),
) {
  const archiveInfo = {
    ApplicationProperties: {
      ApplicationPath: "Applications/GuidePup.app",
      CFBundleIdentifier: EXPECTED.bundleIdentifier,
      CFBundleShortVersionString: EXPECTED.appVersion,
      CFBundleVersion: EXPECTED.buildNumber,
      SigningIdentity: "Apple Distribution: Release Builder (K99RADPB9G)",
      Team: EXPECTED.teamIdentifier,
      ...overrides.archiveProperties,
    },
  };
  const appIdentity = {
    CFBundleExecutable: "GuidePup",
    CFBundleIdentifier: EXPECTED.bundleIdentifier,
    CFBundleShortVersionString: EXPECTED.appVersion,
    CFBundleVersion: EXPECTED.buildNumber,
  };
  const appInfo = {
    ...bundleDeclarations(),
    ...appIdentity,
    ...overrides.appInfo,
  };
  const ipaAppInfo = {
    ...bundleDeclarations(),
    ...appIdentity,
    ...overrides.ipaAppInfo,
  };
  const validationIpaAppInfo = {
    ...bundleDeclarations(),
    ...appIdentity,
    ...overrides.validationIpaAppInfo,
  };
  const sourceInfo = sourceInfoForOverrides(overrides);
  const profile = {
    Entitlements: {
      "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      "get-task-allow": false,
      ...overrides.profileEntitlements,
    },
    TeamIdentifier: [EXPECTED.teamIdentifier],
    ...overrides.profile,
  };
  const validationProfile = {
    Entitlements: {
      "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      "get-task-allow": true,
      ...overrides.validationProfileEntitlements,
    },
    ProvisionedDevices: ["device-fixture"],
    TeamIdentifier: [EXPECTED.teamIdentifier],
    ...overrides.validationProfile,
  };
  const entitlements = {
    "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
    "beta-reports-active": true,
    "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
    "get-task-allow": false,
    ...overrides.entitlements,
  };
  const ipaEntitlements = {
    ...entitlements,
    ...overrides.ipaEntitlements,
  };
  const validationEntitlements = {
    "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
    "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
    "get-task-allow": true,
    ...overrides.validationEntitlements,
  };

  return (command, args, options = {}) => {
    if (command === "plutil") {
      const sourcePath = args.at(-1);
      let source;
      if (sourcePath === path.join(candidate.archivePath, "Info.plist")) source = archiveInfo;
      else if (
        sourcePath === path.join(candidate.appPath, "Info.plist")
      ) source = appInfo;
      else if (
        path.basename(sourcePath) === "Info.plist"
        && path.extname(path.dirname(sourcePath)) === ".app"
      ) {
        source =
          path.basename(path.dirname(sourcePath))
            === path.basename(candidate.validationAppPath)
            ? validationIpaAppInfo
            : ipaAppInfo;
      }
      else if (
        sourcePath === "-"
        && options.input === exactRevisionPlistBytes
      ) source = sourceInfo;
      else if (sourcePath === "-" && options.input === PROFILE_PLIST_MARKER) source = profile;
      else if (sourcePath === "-" && options.input === ENTITLEMENTS_PLIST_MARKER) source = entitlements;
      else if (
        sourcePath === "-"
        && options.input === IPA_ENTITLEMENTS_PLIST_MARKER
      ) source = ipaEntitlements;
      else if (
        sourcePath === "-"
        && options.input === VALIDATION_PROFILE_PLIST_MARKER
      ) source = validationProfile;
      else if (
        sourcePath === "-"
        && options.input === VALIDATION_ENTITLEMENTS_PLIST_MARKER
      ) source = validationEntitlements;
      else throw new Error(`Unexpected plist source: ${sourcePath}`);
      if (args[0] === "-convert") {
        return {
          status: 0,
          stdout: JSON.stringify(source),
          stderr: "",
        };
      }
      return fakePlutilExtract(source, args);
    }
    if (command === "security") {
      const isValidation = fs.readFileSync(args.at(-1), "utf8")
        === "validation profile placeholder";
      return {
        status: 0,
        stdout: isValidation
          ? VALIDATION_PROFILE_PLIST_MARKER
          : PROFILE_PLIST_MARKER,
        stderr: "",
      };
    }
    if (command === "codesign" && args[0] === "--verify") {
      return { status: overrides.codesignStatus ?? 0, stdout: "", stderr: "" };
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      const targetPath = args.at(-1);
      const isValidation =
        path.basename(targetPath) === "GuidePupValidation.app";
      return {
        status: 0,
        stdout: targetPath === candidate.appPath
          ? ENTITLEMENTS_PLIST_MARKER
          : isValidation
            ? VALIDATION_ENTITLEMENTS_PLIST_MARKER
            : IPA_ENTITLEMENTS_PLIST_MARKER,
        stderr: "",
      };
    }
    if (command === "codesign") {
      const isValidation =
        path.basename(args.at(-1)) === "GuidePupValidation.app";
      return {
        status: 0,
        stdout: "",
        stderr: `Authority=${isValidation ? "Apple Development" : "Apple Distribution"}: Release Builder (K99RADPB9G)\nTeamIdentifier=${EXPECTED.teamIdentifier}\n`,
      };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")} for ${candidate.archivePath}`);
  };
}

function candidateOptions(t, overrides = {}) {
  const candidate = makeFakeCandidate(
    t,
    overrides.rootPrefix,
  );
  const sourceInfo = sourceInfoForOverrides(overrides);
  const exactRevisionPlistBytes = sourceInfoPlistBytes(sourceInfo);
  const commandRunner = fakeCommandRunner(
    candidate,
    overrides,
    exactRevisionPlistBytes,
  );
  return {
    candidate,
    options: {
      archivePath: candidate.archivePath,
      commandRunner,
      expected: EXPECTED,
      gitCommandRunner: boundedGitCommandRunner(
        candidate.root,
        EXPECTED.sourceRevision,
        exactRevisionPlistBytes,
      ),
      inspectSentryMarkers: () => ({
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      }),
      ipaPath: candidate.ipaPath,
      now: new Date("2026-07-19T22:00:00.000Z"),
      repositoryRoot: candidate.root,
      validationIpaPath: candidate.validationIpaPath,
    },
  };
}

function runMacPlutil(args, options = {}) {
  const result = spawnSync("plutil", args, {
    encoding: "utf8",
    input: options.input,
  });
  return {
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function requireMacPlutil(args, options = {}) {
  const result = runMacPlutil(args, options);
  assert.equal(
    result.status,
    0,
    `plutil ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
  );
  return result.stdout;
}

function writeXmlPlist(filePath, value) {
  const xml = requireMacPlutil(["-convert", "xml1", "-o", "-", "--", "-"], {
    input: JSON.stringify(value),
  });
  fs.writeFileSync(filePath, xml);
}

function insertDate(filePath, dateKey) {
  requireMacPlutil(["-insert", dateKey, "-date", "2026-07-20T00:00:00Z", "--", filePath]);
}

function insertDataArray(filePath, dataKey) {
  requireMacPlutil(["-insert", dataKey, "-array", "--", filePath]);
  requireMacPlutil(["-insert", `${dataKey}.0`, "-data", "R3VpZGVQdXA=", "--", filePath]);
}

function makeStructuredPlistCandidate(t, options = {}) {
  const candidate = makeFakeCandidate(t);
  const archiveInfoPath = path.join(candidate.archivePath, "Info.plist");
  const appInfoPath = path.join(candidate.appPath, "Info.plist");
  const profilePath = path.join(candidate.root, "decoded-profile.plist");

  writeXmlPlist(archiveInfoPath, {
    ApplicationProperties: {
      ApplicationPath: "Applications/GuidePup.app",
      CFBundleIdentifier: EXPECTED.bundleIdentifier,
      CFBundleShortVersionString: EXPECTED.appVersion,
      CFBundleVersion: EXPECTED.buildNumber,
      SigningIdentity: "Apple Distribution: Release Builder (K99RADPB9G)",
      Team: EXPECTED.teamIdentifier,
    },
  });
  if (options.dateBearingArchive) {
    insertDate(archiveInfoPath, "CreationDate");
  }

  writeXmlPlist(appInfoPath, {
    ...BUNDLE_DECLARATIONS,
    CFBundleExecutable: "GuidePup",
    CFBundleIdentifier: EXPECTED.bundleIdentifier,
    CFBundleShortVersionString: EXPECTED.appVersion,
    CFBundleVersion: EXPECTED.buildNumber,
  });
  const sourceInfoPlistXml = requireMacPlutil(
    ["-convert", "xml1", "-o", "-", "--", "-"],
    { input: JSON.stringify(BUNDLE_DECLARATIONS) },
  );
  writeXmlPlist(profilePath, {
    Entitlements: {
      "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      "get-task-allow": false,
    },
    TeamIdentifier: [EXPECTED.teamIdentifier],
  });
  if (options.dateBearingProfile) {
    insertDate(profilePath, "ExpirationDate");
    insertDataArray(profilePath, "DeveloperCertificates");
  }

  const profileXml = fs.readFileSync(profilePath, "utf8");
  const entitlementXml = requireMacPlutil(["-convert", "xml1", "-o", "-", "--", "-"], {
    input: JSON.stringify({
      "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      "beta-reports-active": true,
      "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
      "get-task-allow": false,
    }),
  });
  const validationProfileXml = requireMacPlutil(
    ["-convert", "xml1", "-o", "-", "--", "-"],
    {
      input: JSON.stringify({
        Entitlements: {
          "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
          "get-task-allow": true,
        },
        ProvisionedDevices: ["device-fixture"],
        TeamIdentifier: [EXPECTED.teamIdentifier],
      }),
    },
  );
  const validationEntitlementXml = requireMacPlutil(
    ["-convert", "xml1", "-o", "-", "--", "-"],
    {
      input: JSON.stringify({
        "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
        "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
        "get-task-allow": true,
      }),
    },
  );
  const commandRunner = (command, args, commandOptions = {}) => {
    if (command === "plutil") return runMacPlutil(args, commandOptions);
    if (command === "security") {
      const isValidation = fs.readFileSync(args.at(-1), "utf8")
        === "validation profile placeholder";
      return {
        status: 0,
        stdout: isValidation ? validationProfileXml : profileXml,
        stderr: "",
      };
    }
    if (command === "codesign" && args[0] === "--verify") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      return {
        status: 0,
        stdout: path.basename(args.at(-1)) === "GuidePupValidation.app"
          ? validationEntitlementXml
          : entitlementXml,
        stderr: "",
      };
    }
    if (command === "codesign") {
      const isValidation =
        path.basename(args.at(-1)) === "GuidePupValidation.app";
      return {
        status: 0,
        stdout: "",
        stderr: `Authority=${isValidation ? "Apple Development" : "Apple Distribution"}: Release Builder (K99RADPB9G)\nTeamIdentifier=${EXPECTED.teamIdentifier}\n`,
      };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };
  writeMatchingStoreAndValidationIpas(candidate);

  return {
    archiveInfoPath,
    candidate,
    options: {
      archivePath: candidate.archivePath,
      commandRunner,
      expected: EXPECTED,
      gitCommandRunner: boundedGitCommandRunner(
        candidate.root,
        EXPECTED.sourceRevision,
        sourceInfoPlistXml,
      ),
      inspectSentryMarkers: () => ({
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      }),
      ipaPath: candidate.ipaPath,
      now: new Date("2026-07-20T00:00:00.000Z"),
      repositoryRoot: candidate.root,
      validationIpaPath: candidate.validationIpaPath,
    },
    profileXml,
  };
}

function assertWholePlistJsonConversionFails(source) {
  const args = ["-convert", "json", "-o", "-", "--", source.filePath ?? "-"];
  const result = runMacPlutil(args, { input: source.input });
  assert.equal(result.status, 1);
  assert.match(`${result.stderr}\n${result.stdout}`, /invalid object in plist for destination format/u);
}

test("canonical manifest paths use UTF-8 byte order and reject duplicates", () => {
  assert.deepEqual(
    canonicalizeReleaseManifestPaths([
      "é.txt",
      "a.txt",
      "中.txt",
      "A.txt",
      "e\u0301.txt",
      "😀.txt",
    ]),
    [
      "A.txt",
      "a.txt",
      "e\u0301.txt",
      "é.txt",
      "中.txt",
      "😀.txt",
    ],
  );
  assert.throws(
    () => canonicalizeReleaseManifestPaths([
      "Payload/GuidePup.app/Resources/",
      "Payload/GuidePup.app/Resources",
    ]),
    /duplicate normalized paths/,
  );
});

test("generates a valid privacy-safe candidate artifact atomically", async (t) => {
  const { candidate, options } = candidateOptions(t);
  const outputPath = path.join(candidate.root, "candidate-build.latest.json");
  const artifact = await generateReleaseCandidateEvidence({
    ...options,
    outputPath,
    resolveSourceState: () => ({ sourceRevision: EXPECTED.sourceRevision }),
  });

  assert.equal(
    validateReleaseCandidateEvidenceSourceBinding(
      artifact,
      EXPECTED,
      trustedValidationOptions(options),
    ).valid,
    true,
  );
  assert.equal(artifact.artifactVersion, 5);
  assert.match(artifact.archive.binarySha256, /^[0-9a-f]{64}$/);
  assert.equal(artifact.archive.betaReportsActive, true);
  assert.match(artifact.archive.entitlementsSha256, /^[0-9a-f]{64}$/);
  assert.match(artifact.ipa.sha256, /^[0-9a-f]{64}$/);
  assert.match(artifact.ipa.binarySha256, /^[0-9a-f]{64}$/);
  assert.match(artifact.validationIpa.sha256, /^[0-9a-f]{64}$/);
  assert.notEqual(artifact.validationIpa.sha256, artifact.ipa.sha256);
  assert.equal(
    artifact.validationIpa.signing.certificateClass,
    "Apple Development",
  );
  assert.equal(
    artifact.validationIpa.signing.distributionMethod,
    "development",
  );
  assert.equal(artifact.validationIpa.provisionedDeviceCount, 1);
  assert.equal(
    artifact.payloadBinding.normalizedPayloadSha256,
    artifact.archive.normalizedPayloadSha256,
  );
  assert.equal(
    artifact.validationIpa.normalizedPayloadSha256,
    artifact.ipa.normalizedPayloadSha256,
  );
  assert.equal(
    artifact.ipa.entitlementsSha256,
    artifact.archive.entitlementsSha256,
  );
  assert.equal(artifact.ipa.payloadInspected, true);
  assert.equal(
    artifact.ipa.candidateIdentifier,
    artifact.release.candidateBinding.candidateIdentifier,
  );
  assert.equal(artifact.archive.name, path.basename(candidate.archivePath));
  assert.deepEqual(
    artifact.archive.bundleDeclarations,
    artifact.sourceInfoPlistDeclarations,
  );
  assert.deepEqual(
    artifact.ipa.bundleDeclarations,
    artifact.sourceInfoPlistDeclarations,
  );
  assert.deepEqual(
    artifact.validationIpa.bundleDeclarations,
    artifact.sourceInfoPlistDeclarations,
  );
  assert.notStrictEqual(
    artifact.archive.bundleDeclarations,
    artifact.sourceInfoPlistDeclarations,
  );
  assert.notStrictEqual(
    artifact.ipa.bundleDeclarations,
    artifact.archive.bundleDeclarations,
  );
  assert.notStrictEqual(
    artifact.validationIpa.bundleDeclarations,
    artifact.ipa.bundleDeclarations,
  );
  assert.equal(
    Object.values(BUNDLE_DECLARATIONS).some(
      (value) => typeof value === "string" && JSON.stringify(artifact).includes(value),
    ),
    false,
  );
  assert.deepEqual(artifact.release, expectedReleaseEvidence());
  assert.equal(JSON.stringify(artifact).includes(candidate.root), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), artifact);
  assert.deepEqual(
    fs.readdirSync(candidate.root).filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("enforces false encryption declarations across every inspected plist", async (t) => {
  const cases = [
    {
      expected: /Exact-revision source Info\.plist\.ITSAppUsesNonExemptEncryption extraction failed/,
      overrides: {
        sourceInfo: { ITSAppUsesNonExemptEncryption: undefined },
      },
    },
    {
      expected: /Archived app Info\.plist\.ITSAppUsesNonExemptEncryption must be false/,
      overrides: {
        appInfo: { ITSAppUsesNonExemptEncryption: true },
      },
    },
    {
      expected: /Store IPA app Info\.plist\.ITSAppUsesNonExemptEncryption extraction failed/,
      overrides: {
        ipaAppInfo: { ITSAppUsesNonExemptEncryption: "false" },
      },
    },
    {
      expected: /Validation IPA app Info\.plist\.ITSAppUsesNonExemptEncryption must be false/,
      overrides: {
        validationIpaAppInfo: { ITSAppUsesNonExemptEncryption: true },
      },
    },
  ];

  for (const testCase of cases) {
    const { options } = candidateOptions(t, testCase.overrides);
    await assert.rejects(
      inspectReleaseCandidate(options),
      testCase.expected,
    );
  }
});

test("enforces every permission declaration across source, archive, and both IPA twins", async (t) => {
  const changed = "Changed permission declaration fixture.";
  const cases = [
    {
      expected: /Exact-revision source Info\.plist\.NSCameraUsageDescription extraction failed/,
      overrides: { sourceInfo: { NSCameraUsageDescription: undefined } },
    },
    {
      expected: /Archived app Info\.plist\.NSCameraUsageDescription must be a nonempty string/,
      overrides: { appInfo: { NSCameraUsageDescription: "" } },
    },
    {
      expected: /Store IPA app Info\.plist\.NSCameraUsageDescription extraction failed/,
      overrides: { ipaAppInfo: { NSCameraUsageDescription: 42 } },
    },
    {
      expected: /Validation IPA app final-bundle declarations do not match/,
      overrides: { validationIpaAppInfo: { NSCameraUsageDescription: changed } },
    },
    {
      expected: /Exact-revision source Info\.plist\.NSMicrophoneUsageDescription must be a nonempty string/,
      overrides: { sourceInfo: { NSMicrophoneUsageDescription: "" } },
    },
    {
      expected: /Archived app Info\.plist\.NSMicrophoneUsageDescription extraction failed/,
      overrides: { appInfo: { NSMicrophoneUsageDescription: false } },
    },
    {
      expected: /Store IPA app final-bundle declarations do not match/,
      overrides: { ipaAppInfo: { NSMicrophoneUsageDescription: changed } },
    },
    {
      expected: /Validation IPA app Info\.plist\.NSMicrophoneUsageDescription extraction failed/,
      overrides: {
        validationIpaAppInfo: { NSMicrophoneUsageDescription: undefined },
      },
    },
    {
      expected: /Exact-revision source Info\.plist\.NSSpeechRecognitionUsageDescription extraction failed/,
      overrides: { sourceInfo: { NSSpeechRecognitionUsageDescription: 7 } },
    },
    {
      expected: /Archived app final-bundle declarations do not match/,
      overrides: { appInfo: { NSSpeechRecognitionUsageDescription: changed } },
    },
    {
      expected: /Store IPA app Info\.plist\.NSSpeechRecognitionUsageDescription extraction failed/,
      overrides: {
        ipaAppInfo: { NSSpeechRecognitionUsageDescription: undefined },
      },
    },
    {
      expected: /Validation IPA app Info\.plist\.NSSpeechRecognitionUsageDescription must be a nonempty string/,
      overrides: {
        validationIpaAppInfo: { NSSpeechRecognitionUsageDescription: "" },
      },
    },
    {
      expected: /Archived app final-bundle declarations do not match/,
      overrides: {
        sourceInfo: { NSSpeechRecognitionUsageDescription: changed },
      },
    },
  ];

  for (const testCase of cases) {
    const { options } = candidateOptions(t, testCase.overrides);
    await assert.rejects(
      inspectReleaseCandidate(options),
      testCase.expected,
    );
  }
});

test("validator rejects declaration digest and presence-proof mutation", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);
  artifact.ipa.bundleDeclarations.canonicalSha256 = "f".repeat(64);
  artifact.validationIpa.bundleDeclarations.cameraUsageDescriptionPresent =
    false;

  const result = validateReleaseCandidateEvidenceSourceBinding(
    artifact,
    EXPECTED,
    trustedValidationOptions(options),
  );

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(" "),
    /ipa\.bundleDeclarations\.canonicalSha256 does not match sourceInfoPlistDeclarations\.canonicalSha256/,
  );
  assert.match(
    result.errors.join(" "),
    /validationIpa\.bundleDeclarations\.cameraUsageDescriptionPresent must be true/,
  );
});

test("source-bound validation rejects coordinated mutation of all declaration digests", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);
  const replacementDigest = "f".repeat(64);
  artifact.sourceInfoPlistDeclarations.canonicalSha256 = replacementDigest;
  artifact.archive.bundleDeclarations.canonicalSha256 = replacementDigest;
  artifact.ipa.bundleDeclarations.canonicalSha256 = replacementDigest;
  artifact.validationIpa.bundleDeclarations.canonicalSha256 =
    replacementDigest;

  assert.equal(
    validateReleaseCandidateEvidenceStructure(artifact, EXPECTED).valid,
    true,
  );
  const launchValidation = validateReleaseCandidateEvidenceSourceBinding(
    artifact,
    EXPECTED,
    trustedValidationOptions(options),
  );

  assert.equal(launchValidation.valid, false);
  assert.match(
    launchValidation.errors.join(" "),
    /Persisted candidate evidence final-bundle declarations do not match the exact-revision source Info\.plist/,
  );
});

test("launch-grade validation requires all artifacts and rejects every coordinated digest family", async (t) => {
  {
    const { options } = candidateOptions(t);
    const artifact = await inspectReleaseCandidate(options);
    const missingArtifacts = await validateReleaseCandidateEvidenceForLaunch(
      artifact,
      EXPECTED,
      trustedValidationOptions(options),
    );
    assert.equal(missingArtifacts.valid, false);
    assert.match(
      missingArtifacts.errors.join(" "),
      /Signed archive path is required for launch-grade candidate validation/,
    );
  }

  const cases = [
    {
      expectedDifference: /artifact\.(?:archive|ipa|payloadBinding|validationIpa)\.normalizedPayloadSha256/,
      mutate(artifact) {
        const replacement = "1".repeat(64);
        artifact.archive.normalizedPayloadSha256 = replacement;
        artifact.ipa.normalizedPayloadSha256 = replacement;
        artifact.validationIpa.normalizedPayloadSha256 = replacement;
        artifact.payloadBinding.normalizedPayloadSha256 = replacement;
      },
      name: "normalized payload",
    },
    {
      expectedDifference: /artifact\.(?:archive|ipa|validationIpa)\.entitlementsSha256/,
      mutate(artifact) {
        const replacement = "2".repeat(64);
        artifact.archive.entitlementsSha256 = replacement;
        artifact.ipa.entitlementsSha256 = replacement;
        artifact.validationIpa.entitlementsSha256 = replacement;
      },
      name: "signed entitlements",
    },
    {
      expectedDifference: /artifact\.(?:archive|ipa|validationIpa)\.binarySha256/,
      mutate(artifact) {
        const replacement = "3".repeat(64);
        artifact.archive.binarySha256 = replacement;
        artifact.ipa.binarySha256 = replacement;
        artifact.validationIpa.binarySha256 = replacement;
      },
      name: "app binaries",
    },
    {
      expectedDifference: /artifact\.(?:archive\.name|ipa\.(?:name|sha256)|validationIpa\.(?:name|sha256))/,
      mutate(artifact) {
        artifact.archive.name = "Alternate.xcarchive";
        artifact.ipa.name = "Alternate.ipa";
        artifact.ipa.sha256 = "4".repeat(64);
        artifact.validationIpa.name = "Alternate-validation.ipa";
        artifact.validationIpa.sha256 = "4".repeat(64);
      },
      name: "artifact identities",
    },
  ];

  for (const testCase of cases) {
    const { options } = candidateOptions(t);
    const artifact = await inspectReleaseCandidate(options);
    testCase.mutate(artifact);
    assert.equal(
      validateReleaseCandidateEvidenceSourceBinding(
        artifact,
        EXPECTED,
        trustedValidationOptions(options),
      ).valid,
      true,
      `${testCase.name} coordinated mutation must remain structurally source-bound`,
    );

    const launchValidation =
      await validateReleaseCandidateEvidenceForLaunch(
        artifact,
        EXPECTED,
        launchValidationOptions(options),
      );
    assert.equal(
      launchValidation.valid,
      false,
      `${testCase.name} coordinated mutation must fail fresh launch inspection`,
    );
    assert.match(
      launchValidation.errors.join(" "),
      testCase.expectedDifference,
    );
  }
});

test("prior candidate versions fail before trusted source lookup", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);
  artifact.artifactVersion = 4;
  let gitCalled = false;

  const result = validateReleaseCandidateEvidenceSourceBinding(
    artifact,
    EXPECTED,
    {
      ...trustedValidationOptions(options),
      gitCommandRunner() {
        gitCalled = true;
        throw new Error("must not run");
      },
    },
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /artifactVersion is invalid/);
  assert.equal(gitCalled, false);
});

test("command failures expose only bounded operation labels", async (t) => {
  const { candidate, options } = candidateOptions(t, {
    rootPrefix: "guidepup-private-Bearer-signing-material-",
  });
  const maliciousOutput = [
    candidate.root,
    BUNDLE_DECLARATIONS.NSCameraUsageDescription,
    "Bearer launch-secret-material",
    "https://example.invalid/private?signed=credential",
    "Apple Distribution: Private Signing Material",
    "<plist><dict><key>ProvisionedDevices</key></dict></plist>",
  ].join("\n");
  const assertBoundedFailure = async (candidateOptionsValue, expectedMessage) => {
    await assert.rejects(
      inspectReleaseCandidate(candidateOptionsValue),
      (error) => {
        assert.equal(error.message, expectedMessage);
        assert.equal(error.message.includes(candidate.root), false);
        for (const forbidden of maliciousOutput.split("\n").slice(1)) {
          assert.equal(error.message.includes(forbidden), false);
        }
        return true;
      },
    );
  };

  await assertBoundedFailure(
    {
      ...options,
      gitCommandRunner: boundedGitCommandRunner(
        candidate.root,
        EXPECTED.sourceRevision,
        sourceInfoPlistBytes(BUNDLE_DECLARATIONS),
        {
          status: 1,
          stderr: maliciousOutput,
          stdout: maliciousOutput,
        },
      ),
    },
    "Exact-revision source Info.plist lookup failed.",
  );

  const baseCommandRunner = options.commandRunner;
  await assertBoundedFailure(
    {
      ...options,
      commandRunner(command, args, commandOptions) {
        if (
          command === "plutil"
          && args.at(-1) === path.join(candidate.archivePath, "Info.plist")
        ) {
          return {
            status: 1,
            stderr: maliciousOutput,
            stdout: maliciousOutput,
          };
        }
        return baseCommandRunner(command, args, commandOptions);
      },
    },
    "Archive ApplicationProperties extraction failed.",
  );

  await assertBoundedFailure(
    {
      ...options,
      commandRunner(command, args, commandOptions) {
        if (command === "codesign" && args[0] === "--verify") {
          return {
            status: 1,
            stderr: maliciousOutput,
            stdout: maliciousOutput,
          };
        }
        return baseCommandRunner(command, args, commandOptions);
      },
    },
    "Archive signature verification failed.",
  );

  await assertBoundedFailure(
    {
      ...options,
      async hashFile() {
        throw new Error(maliciousOutput);
      },
    },
    "Candidate archive immutable manifest capture failed.",
  );
});

test("rejects unapproved signed entitlements and archive/IPA digest mismatch", async (t) => {
  {
    const { options } = candidateOptions(t, {
      entitlements: {
        "com.apple.developer.associated-domains": [
          "applinks:unexpected.example",
        ],
      },
    });
    await assert.rejects(
      inspectReleaseCandidate(options),
      /exactly the approved GuidePup distribution entitlement keys/,
    );
  }

  {
    const { options } = candidateOptions(t);
    const artifact = await inspectReleaseCandidate(options);
    artifact.ipa.entitlementsSha256 = "f".repeat(64);
    const result = validateReleaseCandidateEvidenceSourceBinding(
      artifact,
      EXPECTED,
      trustedValidationOptions(options),
    );
    assert.equal(result.valid, false);
    assert.match(
      result.errors.join(" "),
      /archive and IPA signed entitlement digests must match/,
    );
  }
});

test("candidate evidence rejects unexpected fields recursively", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);
  artifact.archive.bundleDeclarations.rawCameraUsageDescription =
    "must never be persisted";

  const result = validateReleaseCandidateEvidenceSourceBinding(
    artifact,
    EXPECTED,
    trustedValidationOptions(options),
  );

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join(" "),
    /unexpected fields: archive\.bundleDeclarations\.rawCameraUsageDescription/,
  );
});

test("fresh inspection detects every persisted candidate mutation except generation time", async (t) => {
  const { options } = candidateOptions(t);
  const inspected = await inspectReleaseCandidate(options);
  const persisted = structuredClone(inspected);
  persisted.generatedAt = "2026-07-19T21:59:00.000Z";

  assert.deepEqual(
    compareReleaseCandidateEvidenceToInspection(persisted, inspected),
    { differences: [], matches: true },
  );

  persisted.ipa.sha256 = "f".repeat(64);
  persisted.archive.signing.codesignVerified = false;
  persisted.validationIpa.bundleDeclarations.canonicalSha256 = "e".repeat(64);
  persisted.sourceInfoPlistDeclarations.cameraUsageDescriptionPresent = false;
  const comparison = compareReleaseCandidateEvidenceToInspection(
    persisted,
    inspected,
  );
  assert.equal(comparison.matches, false);
  assert.deepEqual(
    comparison.differences.sort(),
    [
      "artifact.archive.signing.codesignVerified",
      "artifact.ipa.sha256",
      "artifact.sourceInfoPlistDeclarations.cameraUsageDescriptionPresent",
      "artifact.validationIpa.bundleDeclarations.canonicalSha256",
    ],
  );
});

test("requires Store and validation IPA paths and validates their names and hashes", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);

  const missingIpa = structuredClone(artifact);
  delete missingIpa.ipa;
  const missingValidation = validateReleaseCandidateEvidenceStructure(
    missingIpa,
    EXPECTED,
  );
  assert.equal(missingValidation.valid, false);
  assert.match(missingValidation.errors.join(" "), /ipa\.name/);
  assert.match(missingValidation.errors.join(" "), /ipa\.sha256/);

  const invalidIpa = structuredClone(artifact);
  invalidIpa.ipa = {
    name: "/private/tmp/GuidePup.ipa",
    sha256: "ABC",
  };
  const invalidValidation = validateReleaseCandidateEvidenceStructure(
    invalidIpa,
    EXPECTED,
  );
  assert.equal(invalidValidation.valid, false);
  assert.match(invalidValidation.errors.join(" "), /ipa\.name/);
  assert.match(invalidValidation.errors.join(" "), /ipa\.sha256/);

  const missingIpaPathOptions = { ...options };
  delete missingIpaPathOptions.ipaPath;
  await assert.rejects(
    inspectReleaseCandidate(missingIpaPathOptions),
    /Store candidate IPA path is required/,
  );

  const missingValidationIpaPathOptions = { ...options };
  delete missingValidationIpaPathOptions.validationIpaPath;
  await assert.rejects(
    inspectReleaseCandidate(missingValidationIpaPathOptions),
    /Installable validation IPA path is required/,
  );
});

test("rejects a non-IPA file and an IPA with a different signed binding", async (t) => {
  {
    const { candidate, options } = candidateOptions(t);
    fs.writeFileSync(candidate.ipaPath, "not a zip archive");
    await assert.rejects(
      inspectReleaseCandidate(options),
      /Candidate IPA listing failed|invalid entry count/i,
    );
  }

  {
    const { candidate, options } = candidateOptions(t);
    const alteredAppPath = path.join(candidate.root, "AlteredGuidePup.app");
    fs.cpSync(candidate.appPath, alteredAppPath, { recursive: true });
    const alteredRuntimeConfig = runtimeConfigForTrack("app-store");
    fs.writeFileSync(
      path.join(alteredAppPath, "EXConstants.bundle", "app.config"),
      JSON.stringify({
        extra: {
          guidePupCandidateBinding: buildGuidePupCandidateBinding({
            appVersion: EXPECTED.appVersion,
            buildNumber: EXPECTED.buildNumber,
            bundleIdentifier: EXPECTED.bundleIdentifier,
            releaseBinding: alteredRuntimeConfig,
            sourceRevision: "b".repeat(40),
            teamIdentifier: EXPECTED.teamIdentifier,
          }),
          guidePupReleaseBinding: alteredRuntimeConfig,
          guidePupReleaseTrackMarker: "guidepup-release-track:app-store",
        },
      }),
    );
    writeIpaFromApp(candidate.root, alteredAppPath, candidate.ipaPath);
    await assert.rejects(
      inspectReleaseCandidate(options),
      /different normalized app payloads|IPA signed binding does not match the inspected archive binding/,
    );
  }

  {
    const { candidate, options } = candidateOptions(t);
    const alteredAppPath = path.join(candidate.root, "AlteredBinary.app");
    fs.cpSync(candidate.appPath, alteredAppPath, { recursive: true });
    fs.writeFileSync(
      path.join(alteredAppPath, "GuidePup"),
      "different signed app binary with identical release metadata",
    );
    writeIpaFromApp(candidate.root, alteredAppPath, candidate.ipaPath);

    await assert.rejects(
      inspectReleaseCandidate(options),
      /archive and IPA contain different normalized app payloads/,
    );
  }

  for (const mutation of [
    (candidate) => {
      fs.writeFileSync(
        path.join(candidate.validationAppPath, "validation-resource.json"),
        "{\"changed\":true}\n",
      );
    },
    (candidate) => {
      fs.writeFileSync(
        path.join(candidate.validationAppPath, "GuidePup"),
        "different validation executable",
      );
    },
  ]) {
    const { candidate, options } = candidateOptions(t);
    mutation(candidate);
    writeIpaFromApp(
      candidate.root,
      candidate.validationAppPath,
      candidate.validationIpaPath,
    );
    await assert.rejects(
      inspectReleaseCandidate(options),
      /archive and installable validation IPA contain different normalized app payloads/,
    );
  }
});

test("rejects mutation races across the archive and both IPA observations", async (t) => {
  const cases = [
    {
      expected: /Candidate archive changed while it was being inspected/,
      mutate(candidate, options) {
        const commandRunner = options.commandRunner;
        return {
          commandRunner(command, args, commandOptions = {}) {
            const result = commandRunner(command, args, commandOptions);
            if (
              command === "codesign"
              && args[0] === "-dvv"
              && args.at(-1) === candidate.appPath
            ) {
              fs.appendFileSync(
                path.join(
                  candidate.appPath,
                  "_CodeSignature",
                  "CodeResources",
                ),
                "\npost-signature-check mutation",
              );
            }
            return result;
          },
        };
      },
      name: "archive",
    },
    {
      expected: /Candidate IPA changed while it was being inspected/,
      mutate(candidate) {
        return {
          ipaArchiveCommandRunner(command, args, commandOptions = {}) {
            const result = spawnSync(command, args, {
              encoding: "utf8",
              input: commandOptions.input,
            });
            if (
              command === "unzip"
              && args.includes("-qq")
              && args.includes(candidate.ipaPath)
              && result.status === 0
            ) {
              fs.appendFileSync(
                candidate.ipaPath,
                "\npost-extraction mutation",
              );
            }
            return {
              status: result.status,
              stderr: result.stderr ?? "",
              stdout: result.stdout ?? "",
            };
          },
        };
      },
      name: "Store IPA",
    },
    {
      expected: /Installable validation IPA changed while it was being inspected/,
      mutate(candidate) {
        return {
          ipaArchiveCommandRunner(command, args, commandOptions = {}) {
            const result = spawnSync(command, args, {
              encoding: "utf8",
              input: commandOptions.input,
            });
            if (
              command === "unzip"
              && args.includes("-qq")
              && args.includes(candidate.validationIpaPath)
              && result.status === 0
            ) {
              fs.appendFileSync(
                candidate.validationIpaPath,
                "\npost-extraction mutation",
              );
            }
            return {
              status: result.status,
              stderr: result.stderr ?? "",
              stdout: result.stdout ?? "",
            };
          },
        };
      },
      name: "validation IPA",
    },
  ];

  for (const testCase of cases) {
    const { candidate, options } = candidateOptions(t);
    await assert.rejects(
      inspectReleaseCandidate({
        ...options,
        ...testCase.mutate(candidate, options),
      }),
      testCase.expected,
      testCase.name,
    );
  }
});

test("rejects atomic archive root replacement and restoration", async (t) => {
  const { candidate, options } = candidateOptions(t);
  const originalAsidePath = path.join(candidate.root, "archive-original");
  const replacementPath = path.join(candidate.root, "archive-replacement");
  const replacementAsidePath = path.join(
    candidate.root,
    "archive-replacement-inspected",
  );
  fs.cpSync(candidate.archivePath, replacementPath, {
    preserveTimestamps: true,
    recursive: true,
  });

  let archiveSwapped = false;
  let archiveRootStatCount = 0;
  const lstatSync = fs.lstatSync;
  fs.lstatSync = function guardedArchiveRootStat(filePath, ...args) {
    if (filePath === candidate.archivePath) {
      archiveRootStatCount += 1;
      if (archiveRootStatCount === 4) {
        fs.renameSync(candidate.archivePath, replacementAsidePath);
        fs.renameSync(originalAsidePath, candidate.archivePath);
      }
    }
    return lstatSync.call(this, filePath, ...args);
  };
  const hashFile = async (filePath) => {
    const sha256 = createHash("sha256")
      .update(fs.readFileSync(filePath))
      .digest("hex");
    if (filePath === candidate.ipaPath && !archiveSwapped) {
      fs.renameSync(candidate.archivePath, originalAsidePath);
      fs.renameSync(replacementPath, candidate.archivePath);
      archiveSwapped = true;
    }
    return sha256;
  };

  try {
    await assert.rejects(
      inspectReleaseCandidate({
        ...options,
        hashFile,
      }),
      /Candidate archive root changed while its immutable manifest was captured/,
    );
  } finally {
    fs.lstatSync = lstatSync;
  }
  assert.equal(archiveSwapped, true);
  assert.equal(archiveRootStatCount, 4);
  assert.equal(fs.existsSync(candidate.archivePath), true);
});

test("candidate CLI requires --ipa before inspecting release inputs", () => {
  const result = spawnSync(
    process.execPath,
    [
      RELEASE_CANDIDATE_SCRIPT_PATH,
      "--archive",
      "missing.xcarchive",
      "--expected-app-version",
      EXPECTED.appVersion,
      "--expected-build-number",
      EXPECTED.buildNumber,
      "--expected-bundle-identifier",
      EXPECTED.bundleIdentifier,
      "--expected-source-revision",
      EXPECTED.sourceRevision,
      "--expected-team-identifier",
      EXPECTED.teamIdentifier,
    ],
    {
      encoding: "utf8",
      cwd: path.dirname(RELEASE_CANDIDATE_SCRIPT_PATH),
    },
  );

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Missing required --ipa/);
});

test("candidate CLI requires --validation-ipa before inspecting release inputs", () => {
  const result = spawnSync(
    process.execPath,
    [
      RELEASE_CANDIDATE_SCRIPT_PATH,
      "--archive",
      "missing.xcarchive",
      "--ipa",
      "missing.ipa",
      "--expected-app-version",
      EXPECTED.appVersion,
      "--expected-build-number",
      EXPECTED.buildNumber,
      "--expected-bundle-identifier",
      EXPECTED.bundleIdentifier,
      "--expected-source-revision",
      EXPECTED.sourceRevision,
      "--expected-team-identifier",
      EXPECTED.teamIdentifier,
    ],
    {
      encoding: "utf8",
      cwd: path.dirname(RELEASE_CANDIDATE_SCRIPT_PATH),
    },
  );

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /Missing required --validation-ipa/);
});

test("inspects an archive plist containing a date value", async (t) => {
  const fixture = makeStructuredPlistCandidate(t, { dateBearingArchive: true });
  assertWholePlistJsonConversionFails({ filePath: fixture.archiveInfoPath });

  const artifact = await inspectReleaseCandidate(fixture.options);

  assert.equal(
    validateReleaseCandidateEvidenceSourceBinding(
      artifact,
      EXPECTED,
      trustedValidationOptions(fixture.options),
    ).valid,
    true,
  );
  assert.equal(artifact.archive.applicationIdentifier, `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`);
  assert.equal(artifact.archive.getTaskAllow, false);
  assert.equal(artifact.archive.signing.codesignVerified, true);
});

test("inspects a decoded provisioning profile containing date and data values", async (t) => {
  const fixture = makeStructuredPlistCandidate(t, { dateBearingProfile: true });
  assertWholePlistJsonConversionFails({ input: fixture.profileXml });

  const artifact = await inspectReleaseCandidate(fixture.options);

  assert.equal(
    validateReleaseCandidateEvidenceSourceBinding(
      artifact,
      EXPECTED,
      trustedValidationOptions(fixture.options),
    ).valid,
    true,
  );
  assert.equal(artifact.archive.applicationIdentifier, `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`);
  assert.equal(artifact.archive.getTaskAllow, false);
  assert.equal(artifact.archive.signing.certificateClass, "Apple Distribution");
});

test("checks clean source before inspecting or writing", async (t) => {
  const { candidate, options } = candidateOptions(t);
  const outputPath = path.join(candidate.root, "candidate-build.latest.json");
  let inspected = false;

  await assert.rejects(
    generateReleaseCandidateEvidence({
      ...options,
      commandRunner: () => {
        inspected = true;
        throw new Error("archive should not be inspected");
      },
      outputPath,
      resolveSourceState: () => {
        throw new Error("Release source is dirty outside the generated-evidence allowlist: expo/app.json.");
      },
    }),
    /Release source is dirty/,
  );
  assert.equal(inspected, false);
  assert.equal(fs.existsSync(outputPath), false);
});

test("rejects mismatched identity and distribution entitlements", async (t) => {
  const identityMismatch = candidateOptions(t, {
    appInfo: { CFBundleIdentifier: "app.example.wrong" },
  });
  await assert.rejects(
    inspectReleaseCandidate(identityMismatch.options),
    /App bundle identifier mismatch/,
  );

  const entitlementMismatch = candidateOptions(t, {
    entitlements: { "get-task-allow": true },
  });
  await assert.rejects(
    inspectReleaseCandidate(entitlementMismatch.options),
    /signed entitlements get-task-allow must be false/,
  );
});

test("rejects embedded crash SDK, DSN, and Crash Data manifest markers", async (t) => {
  for (const markers of [
    { configuredDsnFound: true, crashDataManifestFound: false, sdkEmbedded: false },
    { configuredDsnFound: false, crashDataManifestFound: true, sdkEmbedded: false },
    { configuredDsnFound: false, crashDataManifestFound: false, sdkEmbedded: true },
  ]) {
    const { options } = candidateOptions(t);
    await assert.rejects(
      inspectReleaseCandidate({
        ...options,
        inspectSentryMarkers: () => markers,
      }),
      /contains Sentry SDK, DSN, or Crash Data manifest markers/,
    );
  }
});

test("infers each supported candidate profile from the embedded app payload", async (t) => {
  for (const [runtimeTrack, normalizedTrack] of [
    ["internal-preview", "preview"],
    ["testflight", "testflight"],
    ["app-store", "store"],
  ]) {
    const { candidate, options } = candidateOptions(t);
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify(embeddedAppConfig(runtimeTrack)),
    );
    writeMatchingStoreAndValidationIpas(candidate);

    const artifact = await inspectReleaseCandidate(options);

    assert.equal(artifact.release.runtimeTrack, runtimeTrack);
    assert.equal(artifact.release.buildProfile, normalizedTrack);
    assert.equal(artifact.release.evidenceTrack, normalizedTrack);
    assert.equal(
      validateReleaseCandidateEvidenceSourceBinding(
        artifact,
        EXPECTED,
        trustedValidationOptions(options),
      ).valid,
      true,
    );
  }
});

test("requires and recomputes the signed candidate binding", async (t) => {
  {
    const { candidate, options } = candidateOptions(t);
    const appConfig = embeddedAppConfig("app-store");
    delete appConfig.extra.guidePupCandidateBinding;
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify(appConfig),
    );
    writeMatchingStoreAndValidationIpas(candidate);
    await assert.rejects(
      inspectReleaseCandidate(options),
      /Archived GuidePup candidate binding is required/,
    );
  }

  {
    const { candidate, options } = candidateOptions(t);
    const appConfig = embeddedAppConfig("app-store");
    appConfig.extra.guidePupCandidateBinding.candidateIdentifier = "f".repeat(64);
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify(appConfig),
    );
    await assert.rejects(
      inspectReleaseCandidate(options),
      /candidateIdentifier does not match the signed binding/,
    );
  }

  {
    const { candidate, options } = candidateOptions(t);
    const runtimeConfig = runtimeConfigForTrack("app-store");
    const appConfig = embeddedAppConfig("app-store");
    appConfig.extra.guidePupCandidateBinding = buildGuidePupCandidateBinding({
      appVersion: EXPECTED.appVersion,
      buildNumber: EXPECTED.buildNumber,
      bundleIdentifier: EXPECTED.bundleIdentifier,
      releaseBinding: runtimeConfig,
      sourceRevision: "b".repeat(40),
      teamIdentifier: EXPECTED.teamIdentifier,
    });
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify(appConfig),
    );
    writeMatchingStoreAndValidationIpas(candidate);
    await assert.rejects(
      inspectReleaseCandidate(options),
      /release\.candidateBinding\.sourceRevision does not match expected/,
    );
  }
});

test("rejects a shipping marker whose structured runtime binding uses staging or experimental flags", async (t) => {
  for (const runtimeConfigOverride of [
    {
      apiBaseUrl: RELEASE_RUNTIME_CONFIGS.preview.apiBaseUrl,
      appEnv: "preview",
    },
    {
      experimentalTabsEnabled: true,
    },
  ]) {
    const { candidate, options } = candidateOptions(t);
    const embeddedRuntimeConfig = {
      ...runtimeConfigForTrack("app-store"),
      ...runtimeConfigOverride,
    };
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify({
        extra: {
          guidePupCandidateBinding: buildGuidePupCandidateBinding({
            appVersion: EXPECTED.appVersion,
            buildNumber: EXPECTED.buildNumber,
            bundleIdentifier: EXPECTED.bundleIdentifier,
            releaseBinding: embeddedRuntimeConfig,
            sourceRevision: EXPECTED.sourceRevision,
            teamIdentifier: EXPECTED.teamIdentifier,
          }),
          guidePupReleaseBinding: embeddedRuntimeConfig,
          guidePupReleaseTrackMarker: "guidepup-release-track:app-store",
        },
      }),
    );
    writeMatchingStoreAndValidationIpas(candidate);

    await assert.rejects(
      inspectReleaseCandidate(options),
      /release\.runtimeConfig\.(?:apiBaseUrl|appEnv|experimentalTabsEnabled) does not match expected store config/,
    );
  }
});

test("rejects malformed and marker-contradicting structured release bindings", async (t) => {
  for (const testCase of [
    {
      expected: /Archived GuidePup release binding\.supportUrl is required/,
      runtimeConfig: {
        ...runtimeConfigForTrack("app-store"),
        supportUrl: "",
      },
    },
    {
      expected: /release binding track "testflight" contradicts marker track "app-store"/,
      runtimeConfig: runtimeConfigForTrack("testflight"),
    },
    {
      expected: /unexpected or missing fields/,
      runtimeConfig: {
        ...runtimeConfigForTrack("app-store"),
        unexpected: "value",
      },
    },
  ]) {
    const { candidate, options } = candidateOptions(t);
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify({
        extra: {
          guidePupReleaseBinding: testCase.runtimeConfig,
          guidePupReleaseTrackMarker: "guidepup-release-track:app-store",
        },
      }),
    );
    await assert.rejects(inspectReleaseCandidate(options), testCase.expected);
  }
});

test("rejects symlinked or out-of-bundle structured release config files", async (t) => {
  {
    const { candidate, options } = candidateOptions(t);
    const configPath = path.join(
      candidate.appPath,
      "EXConstants.bundle",
      "app.config",
    );
    const externalConfigPath = path.join(candidate.root, "external-app.config");
    fs.writeFileSync(externalConfigPath, JSON.stringify(embeddedAppConfig()));
    fs.rmSync(configPath);
    fs.symlinkSync(externalConfigPath, configPath);
    await assert.rejects(
      inspectReleaseCandidate(options),
      /archive must not contain symbolic links|payload must not contain symbolic links|EXConstants app config must be a real file/,
    );
  }

  {
    const { candidate, options } = candidateOptions(t);
    const bundlePath = path.join(candidate.appPath, "EXConstants.bundle");
    const externalBundlePath = path.join(candidate.root, "external-bundle");
    fs.mkdirSync(externalBundlePath);
    fs.writeFileSync(
      path.join(externalBundlePath, "app.config"),
      JSON.stringify(embeddedAppConfig()),
    );
    fs.rmSync(bundlePath, { recursive: true });
    fs.symlinkSync(externalBundlePath, bundlePath);
    await assert.rejects(
      inspectReleaseCandidate(options),
      /archive must not contain symbolic links|payload must not contain symbolic links|EXConstants app config must resolve inside the archive/,
    );
  }
});

test("rejects missing, duplicate, contradictory, and unsupported embedded release markers", async (t) => {
  const cases = [
    {
      expected: /missing the embedded GuidePup release-track marker/,
      appConfig: {
        extra: {
          guidePupReleaseBinding: runtimeConfigForTrack("app-store"),
        },
      },
    },
    {
      expected: /duplicate release-track marker/,
      appConfig: embeddedAppConfig("app-store", {
        duplicateMarker: "guidepup-release-track:app-store",
      }),
    },
    {
      expected: /contradictory release-track markers/,
      appConfig: embeddedAppConfig("app-store", {
        contradictoryMarker: "guidepup-release-track:testflight",
      }),
    },
    {
      expected: /unsupported release-track marker "development-client"/,
      appConfig: embeddedAppConfig("development-client"),
    },
  ];

  for (const testCase of cases) {
    const { candidate, options } = candidateOptions(t);
    fs.writeFileSync(
      path.join(candidate.appPath, "EXConstants.bundle", "app.config"),
      JSON.stringify(testCase.appConfig),
    );

    await assert.rejects(inspectReleaseCandidate(options), testCase.expected);
  }
});

test("rejects artifact paths and sensitive values", async (t) => {
  const { options } = candidateOptions(t);
  const validArtifact = await inspectReleaseCandidate(options);

  const pathMutation = structuredClone(validArtifact);
  pathMutation.archive.name = "/private/tmp/GuidePup.xcarchive";
  const pathValidation = validateReleaseCandidateEvidenceStructure(
    pathMutation,
    EXPECTED,
  );
  assert.equal(pathValidation.valid, false);
  assert.match(
    pathValidation.errors.join(" "),
    /artifact name only|absolute path/,
  );

  const sensitiveMutation = structuredClone(validArtifact);
  sensitiveMutation.authorization = `Bearer ${"x".repeat(30)}`;
  const sensitiveValidation = validateReleaseCandidateEvidenceStructure(
    sensitiveMutation,
    EXPECTED,
  );
  assert.equal(sensitiveValidation.valid, false);
  assert.match(
    sensitiveValidation.errors.join(" "),
    /disallowed keys|sensitive patterns/,
  );
});

test("rejects candidate evidence whose normalized profile contradicts its runtime marker", async (t) => {
  const { options } = candidateOptions(t);
  const artifact = await inspectReleaseCandidate(options);
  artifact.release.buildProfile = "testflight";
  const { valid, errors } = validateReleaseCandidateEvidenceStructure(
    artifact,
    EXPECTED,
  );

  assert.equal(valid, false);
  assert.match(errors.join(" "), /release\.buildProfile contradicts/);
});

test("rejects invalid hashes and source revisions", () => {
  const invalidExpected = { ...EXPECTED, sourceRevision: "not-a-revision" };
  const result = validateReleaseCandidateEvidenceStructure(
    {},
    invalidExpected,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sourceRevision/);
});
