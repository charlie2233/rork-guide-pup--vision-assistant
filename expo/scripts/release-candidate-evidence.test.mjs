import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  generateReleaseCandidateEvidence,
  inspectReleaseCandidate,
  validateReleaseCandidateEvidence,
} from "./release-candidate-evidence.mjs";

const EXPECTED = {
  appVersion: "1.0.0",
  buildNumber: "4",
  bundleIdentifier: "app.rork.guide-pup-vision-assist",
  sourceRevision: "a".repeat(40),
  teamIdentifier: "K99RADPB9G",
};

function makeFakeCandidate(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "guidepup-candidate-"));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  const archivePath = path.join(root, "GuidePup-1.0.0-4.xcarchive");
  const appPath = path.join(archivePath, "Products", "Applications", "GuidePup.app");
  const binaryPath = path.join(appPath, "GuidePup");
  const ipaPath = path.join(root, "GuidePup-1.0.0-4.ipa");
  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(archivePath, "Info.plist"), "archive plist placeholder");
  fs.writeFileSync(path.join(appPath, "Info.plist"), "app plist placeholder");
  fs.writeFileSync(path.join(appPath, "embedded.mobileprovision"), "profile placeholder");
  fs.writeFileSync(binaryPath, "signed app binary");
  fs.writeFileSync(ipaPath, "exported ipa");

  return { appPath, archivePath, binaryPath, ipaPath, root };
}

const PROFILE_PLIST_MARKER = "profile plist marker";
const ENTITLEMENTS_PLIST_MARKER = "entitlements plist marker";

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

function fakeCommandRunner(candidate, overrides = {}) {
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
  const appInfo = {
    CFBundleExecutable: "GuidePup",
    CFBundleIdentifier: EXPECTED.bundleIdentifier,
    CFBundleShortVersionString: EXPECTED.appVersion,
    CFBundleVersion: EXPECTED.buildNumber,
    ...overrides.appInfo,
  };
  const profile = {
    Entitlements: {
      "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      "get-task-allow": false,
      ...overrides.profileEntitlements,
    },
    TeamIdentifier: [EXPECTED.teamIdentifier],
    ...overrides.profile,
  };
  const entitlements = {
    "application-identifier": `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
    "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
    "get-task-allow": false,
    ...overrides.entitlements,
  };

  return (command, args, options = {}) => {
    if (command === "plutil") {
      const sourcePath = args.at(-1);
      let source;
      if (sourcePath === path.join(candidate.archivePath, "Info.plist")) source = archiveInfo;
      else if (sourcePath === path.join(candidate.appPath, "Info.plist")) source = appInfo;
      else if (sourcePath === "-" && options.input === PROFILE_PLIST_MARKER) source = profile;
      else if (sourcePath === "-" && options.input === ENTITLEMENTS_PLIST_MARKER) source = entitlements;
      else throw new Error(`Unexpected plist source: ${sourcePath}`);
      return fakePlutilExtract(source, args);
    }
    if (command === "security") {
      return { status: 0, stdout: PROFILE_PLIST_MARKER, stderr: "" };
    }
    if (command === "codesign" && args[0] === "--verify") {
      return { status: overrides.codesignStatus ?? 0, stdout: "", stderr: "" };
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      return { status: 0, stdout: ENTITLEMENTS_PLIST_MARKER, stderr: "" };
    }
    if (command === "codesign") {
      return {
        status: 0,
        stdout: "",
        stderr: `Authority=Apple Distribution: Release Builder (K99RADPB9G)\nTeamIdentifier=${EXPECTED.teamIdentifier}\n`,
      };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")} for ${candidate.archivePath}`);
  };
}

function candidateOptions(t, overrides = {}) {
  const candidate = makeFakeCandidate(t);
  return {
    candidate,
    options: {
      archivePath: candidate.archivePath,
      commandRunner: fakeCommandRunner(candidate, overrides),
      expected: EXPECTED,
      inspectSentryMarkers: () => ({ configuredDsnFound: false, runtimeModeDisabled: true }),
      ipaPath: candidate.ipaPath,
      now: new Date("2026-07-19T22:00:00.000Z"),
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
    CFBundleExecutable: "GuidePup",
    CFBundleIdentifier: EXPECTED.bundleIdentifier,
    CFBundleShortVersionString: EXPECTED.appVersion,
    CFBundleVersion: EXPECTED.buildNumber,
  });
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
      "com.apple.developer.team-identifier": EXPECTED.teamIdentifier,
      "get-task-allow": false,
    }),
  });
  const commandRunner = (command, args, commandOptions = {}) => {
    if (command === "plutil") return runMacPlutil(args, commandOptions);
    if (command === "security") {
      return { status: 0, stdout: profileXml, stderr: "" };
    }
    if (command === "codesign" && args[0] === "--verify") {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      return { status: 0, stdout: entitlementXml, stderr: "" };
    }
    if (command === "codesign") {
      return {
        status: 0,
        stdout: "",
        stderr: `Authority=Apple Distribution: Release Builder (K99RADPB9G)\nTeamIdentifier=${EXPECTED.teamIdentifier}\n`,
      };
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
  };

  return {
    archiveInfoPath,
    candidate,
    options: {
      archivePath: candidate.archivePath,
      commandRunner,
      expected: EXPECTED,
      inspectSentryMarkers: () => ({ configuredDsnFound: false, runtimeModeDisabled: true }),
      ipaPath: candidate.ipaPath,
      now: new Date("2026-07-20T00:00:00.000Z"),
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

test("generates a valid privacy-safe candidate artifact atomically", async (t) => {
  const { candidate, options } = candidateOptions(t);
  const outputPath = path.join(candidate.root, "candidate-build.latest.json");
  const artifact = await generateReleaseCandidateEvidence({
    ...options,
    outputPath,
    resolveSourceState: () => ({ sourceRevision: EXPECTED.sourceRevision }),
  });

  assert.equal(validateReleaseCandidateEvidence(artifact, EXPECTED).valid, true);
  assert.match(artifact.archive.binarySha256, /^[0-9a-f]{64}$/);
  assert.match(artifact.ipa.sha256, /^[0-9a-f]{64}$/);
  assert.equal(artifact.archive.name, path.basename(candidate.archivePath));
  assert.equal(JSON.stringify(artifact).includes(candidate.root), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), artifact);
  assert.deepEqual(
    fs.readdirSync(candidate.root).filter((name) => name.endsWith(".tmp")),
    [],
  );
});

test("inspects an archive plist containing a date value", async (t) => {
  const fixture = makeStructuredPlistCandidate(t, { dateBearingArchive: true });
  assertWholePlistJsonConversionFails({ filePath: fixture.archiveInfoPath });

  const artifact = await inspectReleaseCandidate(fixture.options);

  assert.equal(validateReleaseCandidateEvidence(artifact, EXPECTED).valid, true);
  assert.equal(artifact.archive.applicationIdentifier, `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`);
  assert.equal(artifact.archive.getTaskAllow, false);
  assert.equal(artifact.archive.signing.codesignVerified, true);
});

test("inspects a decoded provisioning profile containing date and data values", async (t) => {
  const fixture = makeStructuredPlistCandidate(t, { dateBearingProfile: true });
  assertWholePlistJsonConversionFails({ input: fixture.profileXml });

  const artifact = await inspectReleaseCandidate(fixture.options);

  assert.equal(validateReleaseCandidateEvidence(artifact, EXPECTED).valid, true);
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
    /Codesign get-task-allow must be false/,
  );
});

test("rejects artifact paths and sensitive values", () => {
  const artifact = {
    artifactType: "guidepup-ios-release-candidate",
    artifactVersion: 1,
    generatedAt: "2026-07-19T22:00:00.000Z",
    sourceRevision: EXPECTED.sourceRevision,
    archive: {
      appName: "GuidePup.app",
      applicationIdentifier: `${EXPECTED.teamIdentifier}.${EXPECTED.bundleIdentifier}`,
      appVersion: EXPECTED.appVersion,
      binaryName: "GuidePup",
      binarySha256: "b".repeat(64),
      buildNumber: EXPECTED.buildNumber,
      bundleIdentifier: EXPECTED.bundleIdentifier,
      getTaskAllow: false,
      name: "/private/tmp/GuidePup.xcarchive",
      sentry: { configuredDsnFound: false, runtimeModeDisabled: true },
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        teamIdentifier: EXPECTED.teamIdentifier,
      },
      teamIdentifier: EXPECTED.teamIdentifier,
    },
    privacy: {
      containsAbsolutePaths: false,
      containsAppContent: false,
      containsCredentials: false,
      containsDeviceIdentifiers: false,
      containsProfiles: false,
      containsSignedUrls: false,
    },
  };

  const validation = validateReleaseCandidateEvidence(artifact, EXPECTED);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(" "), /artifact name only|absolute path/);

  artifact.archive.name = "GuidePup.xcarchive";
  artifact.authorization = `Bearer ${"x".repeat(30)}`;
  const sensitive = validateReleaseCandidateEvidence(artifact, EXPECTED);
  assert.equal(sensitive.valid, false);
  assert.match(sensitive.errors.join(" "), /disallowed keys|sensitive patterns/);
});

test("rejects invalid hashes and source revisions", () => {
  const invalidExpected = { ...EXPECTED, sourceRevision: "not-a-revision" };
  const result = validateReleaseCandidateEvidence({}, invalidExpected);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /sourceRevision/);
});
