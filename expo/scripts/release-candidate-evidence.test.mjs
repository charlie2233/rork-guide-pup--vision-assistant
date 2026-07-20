import assert from "node:assert/strict";
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
  const plistQueue = [archiveInfo, appInfo, profile, entitlements];

  return (command, args) => {
    if (command === "plutil") {
      return { status: 0, stdout: JSON.stringify(plistQueue.shift()), stderr: "" };
    }
    if (command === "security") {
      return { status: 0, stdout: "<plist>profile</plist>", stderr: "" };
    }
    if (command === "codesign" && args[0] === "--verify") {
      return { status: overrides.codesignStatus ?? 0, stdout: "", stderr: "" };
    }
    if (command === "codesign" && args.includes("--entitlements")) {
      return { status: 0, stdout: "<plist>entitlements</plist>", stderr: "" };
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
