import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  SMOKE_ARTIFACT_VERSION,
  SMOKE_EVIDENCE_MAX_AGE_SECONDS,
  buildLaunchContract,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";
import { NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS } from "./no-screen-smoke-evidence.mjs";
import {
  RELEASE_CANDIDATE_ARTIFACT_VERSION,
  buildExpectedReleaseRuntimeConfigs,
  buildGuidePupCandidateBinding,
  canonicalizeReleaseManifestPaths,
} from "./release-candidate-evidence.mjs";
import {
  createIosSubmissionEvidence,
} from "./ios-submission-evidence.mjs";

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(projectDir, "..");
const require = createRequire(import.meta.url);
const plist = require("@expo/plist").default;
const { launchInputs } = await import("../release/launch-inputs.js");
const CANDIDATE_BINARY_SHA256 = "c".repeat(64);
const CANDIDATE_IPA_SHA256 = "d".repeat(64);
const CANDIDATE_SIGNED_ENTITLEMENTS = {
  "application-identifier":
    `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
  "beta-reports-active": true,
  "com.apple.developer.team-identifier": launchInputs.appleTeamId,
  "get-task-allow": false,
};
const CANDIDATE_ENTITLEMENTS_SHA256 = createHash("sha256")
  .update(JSON.stringify(CANDIDATE_SIGNED_ENTITLEMENTS))
  .digest("hex");
const VALIDATION_SIGNED_ENTITLEMENTS = {
  "application-identifier":
    `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
  "com.apple.developer.team-identifier": launchInputs.appleTeamId,
  "get-task-allow": true,
};
const VALIDATION_ENTITLEMENTS_SHA256 = createHash("sha256")
  .update(JSON.stringify(VALIDATION_SIGNED_ENTITLEMENTS))
  .digest("hex");
const SOURCE_INFO_PLIST = plist.parse(
  readFileSync(
    path.join(
      projectDir,
      "ios/GuidePupVisionAssistant/Info.plist",
    ),
    "utf8",
  ),
);
const BUNDLE_DECLARATION_VALUES = {
  ITSAppUsesNonExemptEncryption:
    SOURCE_INFO_PLIST.ITSAppUsesNonExemptEncryption,
  NSCameraUsageDescription: SOURCE_INFO_PLIST.NSCameraUsageDescription,
  NSMicrophoneUsageDescription:
    SOURCE_INFO_PLIST.NSMicrophoneUsageDescription,
  NSSpeechRecognitionUsageDescription:
    SOURCE_INFO_PLIST.NSSpeechRecognitionUsageDescription,
};
const BUNDLE_DECLARATION_EVIDENCE = {
  cameraUsageDescriptionPresent: true,
  canonicalSha256: createHash("sha256")
    .update(JSON.stringify(BUNDLE_DECLARATION_VALUES))
    .digest("hex"),
  itsAppUsesNonExemptEncryption: false,
  microphoneUsageDescriptionPresent: true,
  speechRecognitionUsageDescriptionPresent: true,
};
function bundleDeclarationEvidence() {
  return { ...BUNDLE_DECLARATION_EVIDENCE };
}
const RELEASE_RUNTIME_CONFIGS = buildExpectedReleaseRuntimeConfigs(
  JSON.parse(readFileSync(path.join(projectDir, "eas.json"), "utf8")),
);

function normalizeRuntimeTrack(runtimeTrack) {
  return runtimeTrack === "app-store"
    ? "store"
    : runtimeTrack === "testflight"
      ? "testflight"
      : "preview";
}

function buildCandidateBinding(sourceRevision, runtimeTrack) {
  const normalizedTrack = normalizeRuntimeTrack(runtimeTrack);
  return buildGuidePupCandidateBinding({
    appVersion: launchInputs.iosMarketingVersion,
    buildNumber: launchInputs.iosBuildNumber,
    bundleIdentifier: launchInputs.iosBundleIdentifier,
    releaseBinding: RELEASE_RUNTIME_CONFIGS[normalizedTrack],
    sourceRevision,
    teamIdentifier: launchInputs.appleTeamId,
  });
}

function buildCandidateEvidence(
  sourceRevision,
  runtimeTrack = "app-store",
  overrides = {},
) {
  const normalizedTrack = normalizeRuntimeTrack(runtimeTrack);
  const archiveBinarySha256 =
    overrides.archiveBinarySha256 ?? CANDIDATE_BINARY_SHA256;
  const ipaBinarySha256 =
    overrides.ipaBinarySha256 ?? archiveBinarySha256;
  return {
    artifactType: "guidepup-ios-release-candidate",
    artifactVersion: RELEASE_CANDIDATE_ARTIFACT_VERSION,
    generatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    sourceRevision,
    archive: {
      appName: overrides.appName ?? "GuidePupVisionAssistant.app",
      applicationIdentifier: `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
      appVersion: launchInputs.iosMarketingVersion,
      betaReportsActive: true,
      binaryName: "GuidePupVisionAssistant",
      binarySha256: archiveBinarySha256,
      bundleDeclarations: bundleDeclarationEvidence(),
      buildNumber: launchInputs.iosBuildNumber,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
      entitlementsSha256: CANDIDATE_ENTITLEMENTS_SHA256,
      getTaskAllow: false,
      name:
        overrides.archiveName
        ?? `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}.xcarchive`,
      normalizedPayloadSha256:
        overrides.normalizedPayloadSha256 ?? "b".repeat(64),
      sentry: {
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      },
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        distributionMethod: "app-store",
        teamIdentifier: launchInputs.appleTeamId,
      },
      teamIdentifier: launchInputs.appleTeamId,
    },
    ipa: {
      appName: overrides.appName ?? "GuidePup.app",
      applicationIdentifier:
        `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
      appVersion: launchInputs.iosMarketingVersion,
      betaReportsActive: true,
      binaryName: overrides.binaryName ?? "GuidePup",
      binarySha256: ipaBinarySha256,
      bundleDeclarations: bundleDeclarationEvidence(),
      buildNumber: launchInputs.iosBuildNumber,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
      candidateIdentifier:
        buildCandidateBinding(sourceRevision, runtimeTrack).candidateIdentifier,
      entitlementsSha256: CANDIDATE_ENTITLEMENTS_SHA256,
      getTaskAllow: false,
      name:
        overrides.ipaName
        ?? `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}.ipa`,
      normalizedPayloadSha256:
        overrides.normalizedPayloadSha256 ?? "b".repeat(64),
      payloadInspected: true,
      sentry: {
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      },
      sha256: overrides.ipaSha256 ?? CANDIDATE_IPA_SHA256,
      signing: {
        certificateClass: "Apple Distribution",
        codesignVerified: true,
        distributionMethod: "app-store",
        teamIdentifier: launchInputs.appleTeamId,
      },
      teamIdentifier: launchInputs.appleTeamId,
    },
    payloadBinding: {
      archiveMatches: true,
      normalizedPayloadSha256:
        overrides.normalizedPayloadSha256 ?? "b".repeat(64),
      storeIpaMatches: true,
      validationIpaMatches: true,
    },
    release: {
      buildProfile: normalizedTrack,
      candidateBinding: buildCandidateBinding(sourceRevision, runtimeTrack),
      evidenceTrack: normalizedTrack,
      markerCount: 1,
      markerSource: "expo-constants-app-config",
      runtimeConfig: RELEASE_RUNTIME_CONFIGS[normalizedTrack],
      runtimeTrack,
    },
    sourceInfoPlistDeclarations: bundleDeclarationEvidence(),
    privacy: {
      containsAbsolutePaths: false,
      containsAppContent: false,
      containsCredentials: false,
      containsDeviceIdentifiers: false,
      containsProfiles: false,
      containsSignedUrls: false,
    },
    validationIpa: {
      appName: overrides.validationAppName ?? "GuidePupValidation.app",
      applicationIdentifier:
        `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
      appVersion: launchInputs.iosMarketingVersion,
      betaReportsActive: false,
      binaryName: overrides.binaryName ?? "GuidePup",
      binarySha256:
        overrides.validationIpaBinarySha256 ?? ipaBinarySha256,
      bundleDeclarations: bundleDeclarationEvidence(),
      buildNumber: launchInputs.iosBuildNumber,
      bundleIdentifier: launchInputs.iosBundleIdentifier,
      candidateIdentifier:
        buildCandidateBinding(sourceRevision, runtimeTrack).candidateIdentifier,
      entitlementsSha256: VALIDATION_ENTITLEMENTS_SHA256,
      getTaskAllow: true,
      name:
        overrides.validationIpaName
        ?? `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}-validation.ipa`,
      normalizedPayloadSha256:
        overrides.normalizedPayloadSha256 ?? "b".repeat(64),
      payloadInspected: true,
      provisionedDeviceCount: 1,
      sentry: {
        configuredDsnFound: false,
        crashDataManifestFound: false,
        sdkEmbedded: false,
      },
      sha256:
        overrides.validationIpaSha256 ?? "e".repeat(64),
      signing: {
        certificateClass: "Apple Development",
        codesignVerified: true,
        distributionMethod: "development",
        teamIdentifier: launchInputs.appleTeamId,
      },
      teamIdentifier: launchInputs.appleTeamId,
    },
  };
}

function buildPublicPageResponses() {
  const websiteUrl = launchInputs.websiteUrl;
  const privacyUrl = launchInputs.privacyPolicyUrl;
  const supportUrl = launchInputs.supportUrl;
  const safetyUrl = `${websiteUrl}/safety`;
  return {
    [websiteUrl]: {
      body: readFileSync(path.join(repoDir, "site/index.html"), "utf8"),
      finalUrl: websiteUrl,
      status: 200,
    },
    [privacyUrl]: {
      body: readFileSync(path.join(repoDir, "site/privacy/index.html"), "utf8"),
      finalUrl: privacyUrl,
      status: 200,
    },
    [supportUrl]: {
      body: readFileSync(path.join(repoDir, "site/support/index.html"), "utf8"),
      finalUrl: supportUrl,
      status: 200,
    },
    [safetyUrl]: {
      body: readFileSync(path.join(repoDir, "site/safety/index.html"), "utf8"),
      finalUrl: safetyUrl,
      status: 200,
    },
  };
}

function buildAppStoreConnectResponse(uploadedAt) {
  return {
    data: [{
      attributes: {
        expired: false,
        processingState: "VALID",
        uploadedDate: uploadedAt,
        version: launchInputs.iosBuildNumber,
      },
      id: "asc-build-record-4",
      relationships: {
        preReleaseVersion: {
          data: {
            id: "prerelease-version-1",
            type: "preReleaseVersions",
          },
        },
      },
      type: "builds",
    }],
    included: [{
      attributes: {
        platform: "IOS",
        version: launchInputs.iosMarketingVersion,
      },
      id: "prerelease-version-1",
      type: "preReleaseVersions",
    }],
  };
}

function copyTreeWithoutBuildArtifacts(source, destination) {
  const excluded = new Set([".expo", "build", "dist", "node_modules", "Pods"]);
  cpSync(source, destination, {
    recursive: true,
    filter(sourcePath) {
      const relative = path.relative(source, sourcePath);
      return !relative.split(path.sep).some((part) => excluded.has(part));
    },
  });
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout.trim();
}

function hashFile(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function hashFixtureNormalizedPayload(appPath) {
  const files = [];
  const pending = [appPath];
  while (pending.length > 0) {
    const currentPath = pending.pop();
    for (const entry of require("node:fs").readdirSync(currentPath, {
      withFileTypes: true,
    })) {
      const entryPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(appPath, entryPath);
      const segments = relativePath.split(path.sep);
      if (
        segments.some((segment) =>
          new Set(["_CodeSignature", "SC_Info"]).has(segment),
        )
        || segments.at(-1) === "embedded.mobileprovision"
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile()) {
        files.push({ entryPath, relativePath });
      }
    }
  }
  const manifestHash = createHash("sha256");
  const filesByRelativePath = new Map(
    files.map((file) => [
      file.relativePath.split(path.sep).join("/"),
      file,
    ]),
  );
  for (const normalizedPath of canonicalizeReleaseManifestPaths(
    files.map(({ relativePath }) => relativePath),
  )) {
    const { entryPath } = filesByRelativePath.get(normalizedPath);
    const mode = require("node:fs").statSync(entryPath).mode & 0o777;
    manifestHash.update(
      `${normalizedPath}\0${mode.toString(8)}\0${hashFile(entryPath)}\n`,
      "utf8",
    );
  }
  return manifestHash.digest("hex");
}

function fixtureCandidatePaths(fixtureExpo) {
  const candidateRoot = path.join(path.dirname(fixtureExpo), ".git/release-candidate");
  return {
    archivePath: path.join(
      candidateRoot,
      `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}.xcarchive`,
    ),
    candidateRoot,
    ipaPath: path.join(
      candidateRoot,
      `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}.ipa`,
    ),
    validationIpaPath: path.join(
      candidateRoot,
      `GuidePup-${launchInputs.iosMarketingVersion}-${launchInputs.iosBuildNumber}-validation.ipa`,
    ),
  };
}

function writeMatchingCandidateFixture(
  fixtureExpo,
  sourceRevision,
  runtimeTrack = "app-store",
) {
  const { archivePath, candidateRoot, ipaPath, validationIpaPath } =
    fixtureCandidatePaths(fixtureExpo);
  const appName = "GuidePupVisionAssistant.app";
  const binaryName = "GuidePupVisionAssistant";
  const appPath = path.join(
    archivePath,
    "Products/Applications",
    appName,
  );
  rmSync(candidateRoot, { force: true, recursive: true });
  mkdirSync(path.join(appPath, "EXConstants.bundle"), { recursive: true });
  writeFileSync(
    path.join(archivePath, "Info.plist"),
    plist.build({
      ApplicationProperties: {
        ApplicationPath: `Applications/${appName}`,
        CFBundleIdentifier: launchInputs.iosBundleIdentifier,
        CFBundleShortVersionString: launchInputs.iosMarketingVersion,
        CFBundleVersion: launchInputs.iosBuildNumber,
        SigningIdentity: `Apple Distribution: GuidePup Fixture (${launchInputs.appleTeamId})`,
        Team: launchInputs.appleTeamId,
      },
    }),
  );
  writeFileSync(
    path.join(appPath, "Info.plist"),
    plist.build({
      ...BUNDLE_DECLARATION_VALUES,
      CFBundleExecutable: binaryName,
      CFBundleIdentifier: launchInputs.iosBundleIdentifier,
      CFBundleShortVersionString: launchInputs.iosMarketingVersion,
      CFBundleVersion: launchInputs.iosBuildNumber,
    }),
  );
  writeFileSync(
    path.join(appPath, "embedded.mobileprovision"),
    "synthetic distribution profile fixture",
  );
  writeFileSync(
    path.join(appPath, binaryName),
    "synthetic signed GuidePup distribution binary fixture",
  );
  const normalizedTrack = normalizeRuntimeTrack(runtimeTrack);
  writeFileSync(
    path.join(appPath, "EXConstants.bundle/app.config"),
    JSON.stringify({
      extra: {
        guidePupCandidateBinding: buildCandidateBinding(
          sourceRevision,
          runtimeTrack,
        ),
        guidePupReleaseBinding: RELEASE_RUNTIME_CONFIGS[normalizedTrack],
        guidePupReleaseTrackMarker:
          `guidepup-release-track:${runtimeTrack}`,
      },
    }),
  );

  const packageRoot = path.join(candidateRoot, "package");
  const payloadPath = path.join(packageRoot, "Payload");
  mkdirSync(payloadPath, { recursive: true });
  cpSync(appPath, path.join(payloadPath, appName), { recursive: true });
  const zipResult = spawnSync(
    "zip",
    ["-qry", ipaPath, "Payload"],
    { cwd: packageRoot, encoding: "utf8" },
  );
  assert.equal(
    zipResult.status,
    0,
    `zip failed: ${zipResult.stderr || zipResult.stdout}`,
  );
  const validationAppName = "GuidePupValidation.app";
  const validationAppPath = path.join(candidateRoot, validationAppName);
  cpSync(appPath, validationAppPath, { recursive: true });
  writeFileSync(
    path.join(validationAppPath, "embedded.mobileprovision"),
    "synthetic device-authorized validation profile fixture",
  );
  mkdirSync(path.join(validationAppPath, "_CodeSignature"));
  writeFileSync(
    path.join(validationAppPath, "_CodeSignature", "CodeResources"),
    "synthetic validation signature fixture",
  );
  const validationPackageRoot =
    path.join(candidateRoot, "validation-package");
  const validationPayloadPath =
    path.join(validationPackageRoot, "Payload");
  mkdirSync(validationPayloadPath, { recursive: true });
  cpSync(
    validationAppPath,
    path.join(validationPayloadPath, validationAppName),
    { recursive: true },
  );
  const validationZipResult = spawnSync(
    "zip",
    ["-qry", validationIpaPath, "Payload"],
    { cwd: validationPackageRoot, encoding: "utf8" },
  );
  assert.equal(
    validationZipResult.status,
    0,
    `validation zip failed: ${validationZipResult.stderr || validationZipResult.stdout}`,
  );

  const artifact = buildCandidateEvidence(sourceRevision, runtimeTrack, {
    appName,
    archiveBinarySha256: hashFile(path.join(appPath, binaryName)),
    archiveName: path.basename(archivePath),
    binaryName,
    ipaBinarySha256: hashFile(path.join(appPath, binaryName)),
    ipaName: path.basename(ipaPath),
    ipaSha256: hashFile(ipaPath),
    normalizedPayloadSha256: hashFixtureNormalizedPayload(appPath),
    validationAppName,
    validationIpaBinarySha256:
      hashFile(path.join(validationAppPath, binaryName)),
    validationIpaName: path.basename(validationIpaPath),
    validationIpaSha256: hashFile(validationIpaPath),
  });
  writeCandidateEvidence(fixtureExpo, artifact);
  return { archivePath, artifact, ipaPath, validationIpaPath };
}

function createFixture() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "guidepup-release-smoke-"));
  const fixtureExpo = path.join(fixtureRoot, "expo");
  copyTreeWithoutBuildArtifacts(projectDir, fixtureExpo);
  symlinkSync(path.join(projectDir, "node_modules"), path.join(fixtureExpo, "node_modules"), "dir");
  const fixtureAppJsonPath = path.join(fixtureExpo, "app.json");
  const fixtureAppJson = JSON.parse(readFileSync(fixtureAppJsonPath, "utf8"));
  fixtureAppJson.expo.ios.buildNumber = launchInputs.iosBuildNumber;
  writeFileSync(fixtureAppJsonPath, `${JSON.stringify(fixtureAppJson, null, 2)}\n`);
  const fixtureProjectPath = path.join(fixtureExpo, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
  writeFileSync(
    fixtureProjectPath,
    readFileSync(fixtureProjectPath, "utf8").replace(
      /CURRENT_PROJECT_VERSION = [^;]+;/g,
      `CURRENT_PROJECT_VERSION = ${launchInputs.iosBuildNumber};`,
    ),
  );

  mkdirSync(path.join(fixtureRoot, "backend/guidepup-api"), { recursive: true });
  cpSync(path.join(repoDir, "backend/guidepup-api/eval"), path.join(fixtureRoot, "backend/guidepup-api/eval"), {
    recursive: true,
  });
  mkdirSync(path.join(fixtureRoot, "site"), { recursive: true });
  for (const page of ["privacy", "safety", "support"]) {
    cpSync(path.join(repoDir, "site", page), path.join(fixtureRoot, "site", page), { recursive: true });
  }

  runGit(fixtureRoot, ["init", "--quiet"]);
  runGit(fixtureRoot, ["config", "user.email", "smoke-test@example.invalid"]);
  runGit(fixtureRoot, ["config", "user.name", "GuidePup Smoke Test"]);
  runGit(fixtureRoot, ["add", "expo", "backend", "site"]);
  runGit(fixtureRoot, ["commit", "--quiet", "-m", "fixture"]);
  const sourceRevision = runGit(fixtureRoot, ["rev-parse", "HEAD"]);
  const candidate = writeMatchingCandidateFixture(
    fixtureExpo,
    sourceRevision,
  );
  const activeProvenance = {
    workerDeploymentId: "55555555-5555-4555-8555-555555555555",
    workerVersionCreatedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    workerVersionId: "66666666-6666-4666-8666-666666666666",
  };
  const fakeBin = path.join(fixtureRoot, ".git/test-bin");
  mkdirSync(fakeBin);
  const fakeNpxPath = path.join(fakeBin, "npx");
  writeFileSync(
    fakeNpxPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (process.env.GUIDEPUP_TEST_WRANGLER_UNAVAILABLE === "1") {
  process.exitCode = 2;
} else if (args[0] === "wrangler" && args[1] === "deployments" && args[2] === "status") {
  console.log(JSON.stringify({
    id: ${JSON.stringify(activeProvenance.workerDeploymentId)},
    versions: [{ percentage: 100, version_id: ${JSON.stringify(activeProvenance.workerVersionId)} }],
  }));
} else if (args[0] === "wrangler" && args[1] === "versions" && args[2] === "view") {
  console.log(JSON.stringify({
    annotations: { "workers/message": ${JSON.stringify(`source-revision:${sourceRevision}`)} },
    id: ${JSON.stringify(activeProvenance.workerVersionId)},
    metadata: { created_on: ${JSON.stringify(activeProvenance.workerVersionCreatedAt)} },
  }));
} else {
  process.exitCode = 2;
}
`,
  );
  chmodSync(fakeNpxPath, 0o755);
  const profilePath = path.join(fixtureRoot, ".git/test-profile.plist");
  const entitlementsPath = path.join(
    fixtureRoot,
    ".git/test-entitlements.plist",
  );
  const validationProfilePath = path.join(
    fixtureRoot,
    ".git/test-validation-profile.plist",
  );
  const validationEntitlementsPath = path.join(
    fixtureRoot,
    ".git/test-validation-entitlements.plist",
  );
  writeFileSync(
    profilePath,
    plist.build({
      Entitlements: {
        "application-identifier":
          `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
        "get-task-allow": false,
      },
      TeamIdentifier: [launchInputs.appleTeamId],
    }),
  );
  writeFileSync(
    entitlementsPath,
    plist.build(CANDIDATE_SIGNED_ENTITLEMENTS),
  );
  writeFileSync(
    validationProfilePath,
    plist.build({
      Entitlements: {
        "application-identifier":
          `${launchInputs.appleTeamId}.${launchInputs.iosBundleIdentifier}`,
        "get-task-allow": true,
      },
      ProvisionedDevices: ["device-fixture"],
      TeamIdentifier: [launchInputs.appleTeamId],
    }),
  );
  writeFileSync(
    validationEntitlementsPath,
    plist.build(VALIDATION_SIGNED_ENTITLEMENTS),
  );
  const fakeSecurityPath = path.join(fakeBin, "security");
  writeFileSync(
    fakeSecurityPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const target = process.argv.at(-1);
const validation = target.includes("GuidePupValidation.app");
process.stdout.write(fs.readFileSync(validation ? ${JSON.stringify(validationProfilePath)} : ${JSON.stringify(profilePath)}, "utf8"));
`,
  );
  chmodSync(fakeSecurityPath, 0o755);
  const fakeCodesignPath = path.join(fakeBin, "codesign");
  writeFileSync(
    fakeCodesignPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const validation = args.at(-1).includes("GuidePupValidation.app");
if (args.includes("--entitlements")) {
  process.stdout.write(fs.readFileSync(validation ? ${JSON.stringify(validationEntitlementsPath)} : ${JSON.stringify(entitlementsPath)}, "utf8"));
} else if (!args.includes("--verify")) {
  process.stderr.write(${JSON.stringify(
    `TeamIdentifier=${launchInputs.appleTeamId}\n`,
  )});
  process.stderr.write(validation
    ? "Authority=Apple Development: GuidePup Fixture\\n"
    : "Authority=Apple Distribution: GuidePup Fixture\\n");
}
`,
  );
  chmodSync(fakeCodesignPath, 0o755);
  const publicFetchPreload = path.join(fixtureRoot, ".git/mock-public-fetch.mjs");
  writeFileSync(
    publicFetchPreload,
    `const responses = JSON.parse(process.env.GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES || "{}");
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input?.url;
  if (url.startsWith("https://api.appstoreconnect.apple.com/v1/builds")) {
    const body = JSON.parse(process.env.GUIDEPUP_TEST_ASC_RESPONSE || "{}");
    return {
      json: async () => body,
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      url,
    };
  }
  const fixture = responses[url];
  if (!fixture) {
    throw new Error("No deterministic public-page response configured");
  }
  return {
    ok: Number.isInteger(fixture.status) && fixture.status >= 200 && fixture.status < 300,
    status: fixture.status,
    text: async () => fixture.body,
    url: fixture.finalUrl || url,
  };
};
`,
  );

  return {
    activeProvenance,
    candidate,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  };
}

function buildEnvelope(interactionMode, timestampMs) {
  return {
    appVersion: launchInputs.iosMarketingVersion,
    captureHeuristics: {
      frameAgeMs: 0,
      imageSource: "base64",
      resizedForUpload: false,
      uploadedHeight: 40,
      uploadedWidth: 40,
    },
    detail: "low",
    frameId: `fixture-${interactionMode}-frame`,
    frameSummary:
      `Synthetic sampled js-fallback ${interactionMode} smoke frame, source 40x40, upload 40x40.`,
    hasImage: true,
    interactionMode,
    mimeType: "image/png",
    nativePath: "js-fallback",
    platform: "ios",
    priorGuidance: "Synthetic preflight fixture context.",
    sampledFrame: true,
    sessionId: "fixture-smoke-session",
    sourceHeight: 40,
    sourceWidth: 40,
    timestampMs,
  };
}

function buildAnalyze(interactionMode, requestId) {
  return {
    confidence: 0.82,
    direction: "stop",
    executionPath: "provider-backed",
    fallbackReason: null,
    hazardLevel: "medium",
    interactionMode,
    latencyMs: 900,
    lighting: "normal",
    message: "Stop. Synthetic obstacle ahead.",
    model: `${launchInputs.productionVisionModel}-fixture`,
    obstacle: true,
    promptVersion: launchInputs.productionPromptVersion,
    provider: "openai-compatible",
    requestId,
    roundTripLatencyMs: 1200,
    sceneDescription: "A synthetic obstacle occupies the center path.",
    statusCode: 200,
    statusText: "OK",
    structuredOutputInvalidFields: [],
    structuredOutputMissingFields: [],
    structuredOutputValid: true,
    surfaceType: "indoor floor",
    walkability: "caution",
  };
}

function buildSmokeArtifact(environment, apiUrl, sourceRevision, activeProvenance) {
  const nowMs = Date.now() - 20 * 60_000;
  const generatedAt = new Date(nowMs - 1000).toISOString();
  const artifact = {
    apiUrl,
    artifactVersion: SMOKE_ARTIFACT_VERSION,
    bootstrap: {
      deviceIdSuffix: "abcdef12",
      requestId: "22222222-2222-4222-8222-222222222222",
      statusCode: 200,
      statusText: "OK",
    },
    environment,
    freshness: {
      expiresAt: new Date(Date.parse(generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString(),
      maxAgeSeconds: SMOKE_EVIDENCE_MAX_AGE_SECONDS,
    },
    generatedAt,
    health: {
      defaultMaxCompletionTokens: 700,
      defaultModel: launchInputs.productionVisionModel,
      defaultProvider: "openai-compatible",
      defaultRequestTimeoutMs: 12000,
      defaultRetryCount: 1,
      defaultRetryDelayMs: 250,
      environment,
      promptVersion: launchInputs.productionPromptVersion,
      requestId: "11111111-1111-4111-8111-111111111111",
      statusCode: 200,
      statusText: "OK",
      structuredOutputMode: "json_schema_strict",
    },
    lanes: {
      guidance: {
        analyze: buildAnalyze("guidance", "33333333-3333-4333-8333-333333333333"),
        interactionMode: "guidance",
        requestEnvelope: buildEnvelope("guidance", nowMs - 1000),
      },
      "scene-query": {
        analyze: buildAnalyze("scene-query", "44444444-4444-4444-8444-444444444444"),
        interactionMode: "scene-query",
        requestEnvelope: buildEnvelope("scene-query", nowMs - 1000),
      },
    },
    operator: "Preflight fixture",
    provenance: {
      sourceRevision,
      ...activeProvenance,
    },
    providerBacked: true,
  };
  artifact.launchContract = buildLaunchContract({ artifact });
  return artifact;
}

function writeSmoke(fixtureRoot, environment, artifact) {
  const fileName = environment === "production"
    ? "smoke-results-production.latest.json"
    : "smoke-results-staging.latest.json";
  writeFileSync(
    path.join(fixtureRoot, "backend/guidepup-api/eval", fileName),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function writeCandidateEvidence(fixtureExpo, artifact) {
  writeFileSync(
    path.join(fixtureExpo, "release/candidate-build.latest.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function buildNoScreenEvidence(smokeArtifact, track, options = {}) {
  const noScreen = JSON.parse(
    readFileSync(path.join(projectDir, "docs/no-screen-smoke-evidence.example.json"), "utf8"),
  );
  const generatedAt = new Date(Date.now() - (options.ageMs ?? 100)).toISOString();
  const generatedAtMs = Date.parse(generatedAt);
  const idSeeds = options.idSeeds ?? ["1", "2", "3", "4"];
  const uuidFor = (seed) =>
    `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${seed.repeat(12)}`;
  const buildSequence = (steps, startedAt, seed) => {
    const startedAtMs = Date.parse(startedAt);
    return steps.map((step, index) => ({
      ...step,
      eventId:
        `${seed.repeat(8)}-${seed.repeat(4)}-4${seed.repeat(3)}-8${seed.repeat(3)}-${(index + 1).toString(16).padStart(12, "0")}`,
      observedAt: new Date(startedAtMs + ((index + 1) * 4_000)).toISOString(),
      voiceRecognized: true,
    }));
  };
  const buildStopBargeIn = (steps) => {
    const stopStep = steps.find((step) => step.id === "stop-guidance");
    const observedAtMs = Date.parse(stopStep.observedAt);
    return {
      ...noScreen.stopBargeIn,
      analysisInactiveAfterStop: true,
      audioCueOutcome: "success",
      cameraInactiveAfterStop: true,
      eventId: stopStep.eventId,
      feedbackObservedAt: new Date(observedAtMs + 500).toISOString(),
      hapticOutcome: "success",
      listeningStoppedAfterStop: true,
      observedAt: stopStep.observedAt,
      postStopObservedAt: new Date(observedAtMs + 1_000).toISOString(),
    };
  };
  noScreen.artifactVersion = 3;
  noScreen.appStoreConnectBuildRecordIdentifier =
    options.installationSource === "testflight" ? "asc-build-record-4" : "";
  noScreen.cameraPaths.nativeCore.captureHeuristics.captureLatencyMs = 500;
  noScreen.cameraPaths.jsFallback.captureHeuristics.captureLatencyMs = 600;
  noScreen.cameraPaths.nativeCore.requestId = uuidFor(idSeeds[0]);
  noScreen.cameraPaths.jsFallback.requestId = uuidFor(idSeeds[1]);
  const nativeStartedAt = new Date(generatedAtMs - 180_000).toISOString();
  const fallbackStartedAt = new Date(generatedAtMs - 90_000).toISOString();
  const nativeSteps = buildSequence(noScreen.sequence, nativeStartedAt, idSeeds[2]);
  const fallbackSteps = buildSequence(noScreen.sequence, fallbackStartedAt, idSeeds[3]);
  noScreen.commandSequences = {
    jsFallback: {
      analyzeRequestId: noScreen.cameraPaths.jsFallback.requestId,
      completedAt: new Date(generatedAtMs - 30_000).toISOString(),
      executionId: uuidFor(idSeeds[3]),
      executionPath: "js-fallback",
      startedAt: fallbackStartedAt,
      steps: fallbackSteps,
      stopBargeIn: buildStopBargeIn(fallbackSteps),
    },
    nativeCore: {
      analyzeRequestId: noScreen.cameraPaths.nativeCore.requestId,
      completedAt: new Date(generatedAtMs - 120_000).toISOString(),
      executionId: uuidFor(idSeeds[2]),
      executionPath: "native-core",
      startedAt: nativeStartedAt,
      steps: nativeSteps,
      stopBargeIn: buildStopBargeIn(nativeSteps),
    },
  };
  delete noScreen.sequence;
  delete noScreen.stopBargeIn;
  noScreen.installationSource = options.installationSource ?? "ad-hoc";
  noScreen.installationEvidence = noScreen.installationSource === "testflight"
    ? {
        appStoreAppIdMatched: true,
        appTransactionVerified: true,
        appIdentityMatched: true,
        bundleVersionMatched: true,
        distributionEnvironment: "apple-sandbox",
        storeKitEvidencePurpose: "apple-signed-app-identity-only",
        uploadedAt: new Date(generatedAtMs - 300_000).toISOString(),
        uploadedIpaSha256:
          options.candidateEvidence?.ipa?.sha256
          ?? CANDIDATE_IPA_SHA256,
      }
      : {
          appStoreAppIdMatched: false,
          appTransactionVerified: false,
          appIdentityMatched: false,
          bundleVersionMatched: false,
          distributionEnvironment: "none",
          installedValidationIpaSha256:
            options.candidateEvidence?.validationIpa?.sha256
            ?? "e".repeat(64),
        };
  noScreen.interactionAssistance = options.interactionAssistance ?? "none";
  noScreen.interruptionRecovery = {
    audioRoute: {
      attempted: true,
      boundedRecoveryConfirmed: true,
      conservativeStopConfirmed: true,
      explicitRestartConfirmed: true,
      explicitRestartRequired: true,
      guidanceInactiveAfterInterruption: true,
      noContinuedGuidance: true,
      recoveryLatencyMs: 900,
    },
    backgroundForeground: {
      attempted: true,
      boundedRecoveryConfirmed: true,
      conservativeStopConfirmed: true,
      explicitRestartConfirmed: true,
      explicitRestartRequired: true,
      guidanceInactiveAfterInterruption: true,
      noContinuedGuidance: true,
      recoveryLatencyMs: 1100,
    },
  };
  noScreen.operator = options.operator ?? "operator-alpha";
  noScreen.participantLabel = options.participantLabel ?? "internal-alpha";
  noScreen.participantRole = options.participantRole ?? "internal-tester";
  noScreen.humanAttestation = {
    attestedAt: generatedAt,
    blindParticipantSelfAttested: noScreen.participantRole === "blind-participant",
    installationSourceConfirmed: true,
    nonvisualOperationConfirmed: true,
    participantRoleConfirmed: true,
    sensoryObservationsConfirmed: true,
  };
  noScreen.noScreen = {
    cleanInstallOrReset: true,
    nonvisualOperation: true,
    noScreenUsed: true,
    visualScreenInspectionUsed: false,
    voiceAndVoiceOverOnly: true,
  };
  delete noScreen.screenUse;
  noScreen.visualScreenUse = "none";
  noScreen.privacy.containsIdentityContactData = false;
  noScreen.provenance.schemaVersion = 3;
  noScreen.visualPromptingUsed = false;
  for (const target of [noScreen.device, noScreen.provenance]) {
    target.appVersion = launchInputs.iosMarketingVersion;
    target.buildNumber = launchInputs.iosBuildNumber;
    target.buildProfile = track;
    target.bundleIdentifier = launchInputs.iosBundleIdentifier;
  }
  noScreen.generatedAt = generatedAt;
  noScreen.provenance.generatedAt = generatedAt;
  noScreen.deviceReadiness.coreDeviceProbe = {
    checkedAt: new Date(generatedAtMs - 210_000).toISOString(),
    exitStatus: 0,
    outcome: "success",
    type: "devicectl-process-info",
  };
  noScreen.provenance.candidateBinarySha256 =
    options.candidateEvidence?.archive?.binarySha256
    ?? CANDIDATE_BINARY_SHA256;
  const candidateRuntimeTrack = track === "store"
    ? "app-store"
    : track === "testflight"
      ? "testflight"
      : "internal-preview";
  noScreen.provenance.candidateIdentifier =
    options.candidateEvidence?.release?.candidateBinding?.candidateIdentifier
    ?? buildCandidateBinding(
      smokeArtifact.provenance?.sourceRevision,
      candidateRuntimeTrack,
    ).candidateIdentifier;
  noScreen.provenance.releaseTrack = track;
  noScreen.provenance.sourceRevision = smokeArtifact.provenance?.sourceRevision;
  noScreen.backendSmoke.apiBaseUrl = launchInputs.productionApiBaseUrl;
  noScreen.backendSmoke.artifactVersion = smokeArtifact.artifactVersion;
  noScreen.backendSmoke.environment = "production";
  noScreen.backendSmoke.generatedAt = smokeArtifact.generatedAt;
  noScreen.backendSmoke.model = smokeArtifact.lanes?.guidance?.analyze?.model || "";
  noScreen.backendSmoke.promptVersion = smokeArtifact.lanes?.guidance?.analyze?.promptVersion || "";
  noScreen.backendSmoke.provenance = { ...smokeArtifact.provenance };
  noScreen.backendSmoke.requestIds = {
    analyze: smokeArtifact.lanes?.guidance?.analyze?.requestId || "",
    bootstrap: smokeArtifact.bootstrap?.requestId || "",
    guidanceAnalyze: smokeArtifact.lanes?.guidance?.analyze?.requestId || "",
    health: smokeArtifact.health?.requestId || "",
    sceneQueryAnalyze: smokeArtifact.lanes?.["scene-query"]?.analyze?.requestId || "",
  };
  noScreen.backendSmoke.walkability = smokeArtifact.lanes?.guidance?.analyze?.walkability || "";
  noScreen.provenance.apiEnvironment = "production";
  noScreen.provenance.apiBaseUrlLabel = "production";
  return noScreen;
}

function writeNoScreenEvidence(fixtureExpo, relativePath, artifact) {
  mkdirSync(path.join(fixtureExpo, "release"), { recursive: true });
  writeFileSync(
    path.join(fixtureExpo, relativePath),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
}

function writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, track, options = {}) {
  const candidateEvidence = JSON.parse(
    readFileSync(
      path.join(fixtureExpo, "release/candidate-build.latest.json"),
      "utf8",
    ),
  );
  const internal = buildNoScreenEvidence(smokeArtifact, track, {
    ageMs: 10 * 60_000,
    candidateEvidence,
    idSeeds: ["1", "2", "3", "4"],
    operator: "operator-alpha",
    participantLabel: "internal-alpha",
    participantRole: "internal-tester",
  });
  internal.provenance.runId = "no-screen-internal-fixture";
  writeNoScreenEvidence(
    fixtureExpo,
    "release/no-screen-smoke.internal.latest.json",
    internal,
  );

  const blindParticipant = buildNoScreenEvidence(smokeArtifact, track, {
    ageMs: 7 * 60_000,
    candidateEvidence,
    idSeeds: ["5", "6", "7", "8"],
    interactionAssistance: "safety-spotter-only",
    operator: "operator-bravo",
    participantLabel: "blind-beta",
    participantRole: "blind-participant",
  });
  blindParticipant.provenance.runId = "no-screen-blind-fixture";
  writeNoScreenEvidence(
    fixtureExpo,
    "release/no-screen-smoke.blind-participant.latest.json",
    blindParticipant,
  );

  let testflight;
  if (options.includeTestflightRepeat) {
    testflight = buildNoScreenEvidence(smokeArtifact, track, {
      ageMs: 60_000,
      candidateEvidence,
      idSeeds: ["9", "a", "b", "c"],
      installationSource: "testflight",
      interactionAssistance: "safety-spotter-only",
      operator: "operator-charlie",
      participantLabel: "blind-gamma",
      participantRole: "blind-participant",
    });
    testflight.provenance.runId = "no-screen-testflight-fixture";
    writeNoScreenEvidence(
      fixtureExpo,
      "release/no-screen-smoke.testflight.latest.json",
      testflight,
    );
    const uploadedAtMs = Date.parse(
      testflight.installationEvidence.uploadedAt,
    );
    const localAttempt = createIosSubmissionEvidence({
      appStoreConnectAppId: launchInputs.ascAppId,
      candidateArtifact: candidateEvidence,
      generatedAt: new Date(uploadedAtMs + 60_000),
      track: "testflight",
      uploadCompletedAt: new Date(uploadedAtMs + 60_000),
      uploadStartedAt: new Date(uploadedAtMs - 60_000),
    });
    writeFileSync(
      path.join(fixtureExpo, "release/ios-submission.latest.json"),
      `${JSON.stringify(localAttempt, null, 2)}\n`,
    );
  }

  return { blindParticipant, internal, testflight };
}

function runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload, extraEnv = {}) {
  const preloadOption = `--import=${pathToFileURL(publicFetchPreload).href}`;
  const nodeOptions = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(" ");
  const { archivePath, ipaPath, validationIpaPath } =
    fixtureCandidatePaths(fixtureExpo);
  let uploadedAt = new Date(Date.now() - 6 * 60_000).toISOString();
  try {
    const testflightEvidence = JSON.parse(
      readFileSync(
        path.join(
          fixtureExpo,
          "release/no-screen-smoke.testflight.latest.json",
        ),
        "utf8",
      ),
    );
    uploadedAt =
      testflightEvidence.installationEvidence?.uploadedAt
      ?? uploadedAt;
  } catch {
    // Missing TestFlight evidence is an intentional preflight test case.
  }
  return spawnSync(process.execPath, [
    "scripts/release-preflight.mjs",
    "--track",
    track,
    "--archive",
    archivePath,
    "--ipa",
    ipaPath,
    "--validation-ipa",
    validationIpaPath,
  ], {
    cwd: fixtureExpo,
    encoding: "utf8",
    env: {
      ...process.env,
      APP_STORE_CONNECT_API_TOKEN: "fixture.header.signature",
      GUIDEPUP_TEST_ASC_RESPONSE: JSON.stringify(
        buildAppStoreConnectResponse(uploadedAt),
      ),
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(buildPublicPageResponses()),
      NODE_OPTIONS: nodeOptions,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
      ...extraEnv,
    },
  });
}

function runStandaloneNoScreenValidation(
  fixtureExpo,
  fakeBin,
  {
    artifact = "release/no-screen-smoke.testflight.latest.json",
    extraEnv = {},
    installationSource = "testflight",
    participantRole = "blind-participant",
  } = {},
) {
  return spawnSync(
    process.execPath,
    [
      "scripts/validate-no-screen-smoke-evidence.mjs",
      "--artifact",
      artifact,
      "--installation-source",
      installationSource,
      "--participant-role",
      participantRole,
    ],
    {
      cwd: fixtureExpo,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}`,
        ...extraEnv,
      },
    },
  );
}

test("TestFlight and Store preflight accept current dual-lane provenance and reject each launch-invalid mutation", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const valid = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    const cases = [
      {
        expected: /freshness\.expired/,
        mutate(artifact) {
          artifact.generatedAt = new Date(Date.now() - 2 * SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000).toISOString();
          artifact.freshness.expiresAt = new Date(
            Date.parse(artifact.generatedAt) + SMOKE_EVIDENCE_MAX_AGE_SECONDS * 1000,
          ).toISOString();
        },
      },
      {
        expected: /provenance\.sourceRevision-mismatch/,
        mutate(artifact) {
          artifact.provenance.sourceRevision = "f".repeat(40);
        },
      },
      {
        expected: /provenance\.workerDeploymentId/,
        mutate(artifact) {
          delete artifact.provenance.workerDeploymentId;
        },
      },
      {
        expected: /provenance\.workerVersionId-active-mismatch/,
        mutate(artifact) {
          artifact.provenance.workerVersionId = "99999999-9999-4999-8999-999999999999";
        },
      },
      {
        expected: /lanes\.scene-query/,
        mutate(artifact) {
          delete artifact.lanes["scene-query"];
        },
      },
      {
        env: { GUIDEPUP_TEST_WRANGLER_UNAVAILABLE: "1" },
        expected: /provenance\.active-worker-unavailable/,
      },
    ];

    for (const track of ["testflight", "store"]) {
      writeSmoke(fixtureRoot, "production", valid);
      writeNoScreenEvidenceSet(fixtureExpo, valid, "store", {
        includeTestflightRepeat: track === "store",
      });
      const baseline = runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload);
      assert.equal(baseline.status, 0, `${track}: ${baseline.stdout}${baseline.stderr}`);

      for (const testCase of cases) {
        const artifact = structuredClone(valid);
        testCase.mutate?.(artifact);
        artifact.launchContract = buildLaunchContract({ artifact });
        writeSmoke(fixtureRoot, "production", artifact);
        writeNoScreenEvidenceSet(fixtureExpo, artifact, "store", {
          includeTestflightRepeat: track === "store",
        });
        const result = runPreflight(fixtureExpo, track, fakeBin, publicFetchPreload, testCase.env);
        const output = result.stdout + result.stderr;
        assert.equal(result.status, 1, `${track}: ${output}`);
        assert.match(output, testCase.expected);
      }
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preflight derives evidence track from the candidate and keeps Store app-store-only", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);

    const { artifact: testflightCandidate } = writeMatchingCandidateFixture(
      fixtureExpo,
      sourceRevision,
      "testflight",
    );
    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "testflight");
    const testflightResult = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    assert.equal(
      testflightResult.status,
      0,
      testflightResult.stdout + testflightResult.stderr,
    );

    const tamperedCandidate = structuredClone(testflightCandidate);
    tamperedCandidate.ipa.sha256 = "f".repeat(64);
    tamperedCandidate.archive.signing.codesignVerified = true;
    writeCandidateEvidence(fixtureExpo, tamperedCandidate);
    const tamperedResult = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const tamperedOutput = tamperedResult.stdout + tamperedResult.stderr;
    assert.equal(tamperedResult.status, 1, tamperedOutput);
    assert.match(
      tamperedOutput,
      /does not match fresh archive, Store IPA, and validation IPA inspection at: artifact\.ipa\.sha256/,
    );
    writeCandidateEvidence(fixtureExpo, testflightCandidate);

    const missingIpaCandidate = structuredClone(testflightCandidate);
    delete missingIpaCandidate.ipa;
    writeCandidateEvidence(fixtureExpo, missingIpaCandidate);
    const missingIpaResult = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const missingIpaOutput = missingIpaResult.stdout + missingIpaResult.stderr;
    assert.equal(missingIpaResult.status, 1, missingIpaOutput);
    assert.match(missingIpaOutput, /ipa\.(?:name|sha256)/);
    writeCandidateEvidence(fixtureExpo, testflightCandidate);

    const missingValidationTwin = structuredClone(testflightCandidate);
    delete missingValidationTwin.validationIpa;
    writeCandidateEvidence(fixtureExpo, missingValidationTwin);
    const missingValidationTwinResult = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const missingValidationTwinOutput =
      missingValidationTwinResult.stdout + missingValidationTwinResult.stderr;
    assert.equal(
      missingValidationTwinResult.status,
      1,
      missingValidationTwinOutput,
    );
    assert.match(
      missingValidationTwinOutput,
      /validationIpa\.(?:name|sha256|normalizedPayloadSha256)/,
    );
    writeCandidateEvidence(fixtureExpo, testflightCandidate);

    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "testflight", {
      includeTestflightRepeat: true,
    });
    const storeRejectsTestflight = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const storeOutput = storeRejectsTestflight.stdout + storeRejectsTestflight.stderr;
    assert.equal(storeRejectsTestflight.status, 1, storeOutput);
    assert.match(storeOutput, /Store preflight requires an app-store candidate normalized to store evidence/);

    const contradictoryCandidate = buildCandidateEvidence(sourceRevision, "app-store");
    contradictoryCandidate.release.buildProfile = "testflight";
    writeCandidateEvidence(fixtureExpo, contradictoryCandidate);
    const contradiction = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const contradictionOutput = contradiction.stdout + contradiction.stderr;
    assert.equal(contradiction.status, 1, contradictionOutput);
    assert.match(contradictionOutput, /release\.buildProfile contradicts release\.runtimeTrack/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("standalone TestFlight validation accepts only testflight or store candidates", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);

    for (const [runtimeTrack, evidenceTrack] of [
      ["testflight", "testflight"],
      ["app-store", "store"],
    ]) {
      writeCandidateEvidence(
        fixtureExpo,
        buildCandidateEvidence(sourceRevision, runtimeTrack),
      );
      const artifact = buildNoScreenEvidence(smokeArtifact, evidenceTrack, {
        installationSource: "testflight",
        interactionAssistance: "safety-spotter-only",
        operator: "operator-charlie",
        participantLabel: "blind-gamma",
        participantRole: "blind-participant",
      });
      artifact.provenance.runId = `standalone-${evidenceTrack}-candidate`;
      writeNoScreenEvidence(
        fixtureExpo,
        "release/no-screen-smoke.testflight.latest.json",
        artifact,
      );

      const result = runStandaloneNoScreenValidation(fixtureExpo, fakeBin);
      assert.equal(
        result.status,
        0,
        `${runtimeTrack}: ${result.stdout}${result.stderr}`,
      );
    }

    writeCandidateEvidence(
      fixtureExpo,
      buildCandidateEvidence(sourceRevision, "internal-preview"),
    );
    const previewArtifact = buildNoScreenEvidence(smokeArtifact, "preview", {
      installationSource: "testflight",
      interactionAssistance: "safety-spotter-only",
      operator: "operator-charlie",
      participantLabel: "blind-gamma",
      participantRole: "blind-participant",
    });
    previewArtifact.provenance.runId = "standalone-preview-candidate";
    writeNoScreenEvidence(
      fixtureExpo,
      "release/no-screen-smoke.testflight.latest.json",
      previewArtifact,
    );

    const previewResult = runStandaloneNoScreenValidation(fixtureExpo, fakeBin);
    const previewOutput = previewResult.stdout + previewResult.stderr;
    assert.equal(previewResult.status, 1, previewOutput);
    assert.match(
      previewOutput,
      /TestFlight installation evidence requires a testflight or store candidate/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("standalone no-screen validation rejects stale or unverifiable active production Worker provenance", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeCandidateEvidence(fixtureExpo, buildCandidateEvidence(sourceRevision, "app-store"));
    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
      includeTestflightRepeat: true,
    });

    const staleSmoke = structuredClone(smokeArtifact);
    staleSmoke.provenance.workerDeploymentId = "77777777-7777-4777-8777-777777777777";
    writeSmoke(fixtureRoot, "production", staleSmoke);
    const staleResult = runStandaloneNoScreenValidation(fixtureExpo, fakeBin);
    const staleOutput = staleResult.stdout + staleResult.stderr;
    assert.equal(staleResult.status, 1, staleOutput);
    assert.match(staleOutput, /does not match the active production Worker: workerDeploymentId/);

    writeSmoke(fixtureRoot, "production", smokeArtifact);
    const unavailableResult = runStandaloneNoScreenValidation(fixtureExpo, fakeBin, {
      extraEnv: { GUIDEPUP_TEST_WRANGLER_UNAVAILABLE: "1" },
    });
    const unavailableOutput = unavailableResult.stdout + unavailableResult.stderr;
    assert.equal(unavailableResult.status, 1, unavailableOutput);
    assert.match(unavailableOutput, /active production Worker could not be verified/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preflight requires separate pre-upload roles and a later TestFlight-installed Store repeat", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);

    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store");
    unlinkSync(path.join(fixtureExpo, "release/no-screen-smoke.blind-participant.latest.json"));
    const missingBlind = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const missingBlindOutput = missingBlind.stdout + missingBlind.stderr;
    assert.equal(missingBlind.status, 1, missingBlindOutput);
    assert.match(missingBlindOutput, /blindParticipant:missing/);

    const reused = writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store");
    reused.blindParticipant.provenance.runId = reused.internal.provenance.runId;
    reused.blindParticipant.operator = reused.internal.operator;
    writeNoScreenEvidence(
      fixtureExpo,
      "release/no-screen-smoke.blind-participant.latest.json",
      reused.blindParticipant,
    );
    const reusedResult = runPreflight(
      fixtureExpo,
      "testflight",
      fakeBin,
      publicFetchPreload,
    );
    const reusedOutput = reusedResult.stdout + reusedResult.stderr;
    assert.equal(reusedResult.status, 1, reusedOutput);
    assert.match(reusedOutput, /runId\.reused-from:internal/);
    assert.match(reusedOutput, /operator\.matches-internal/);

    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store");
    const missingRepeat = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const missingRepeatOutput = missingRepeat.stdout + missingRepeat.stderr;
    assert.equal(missingRepeat.status, 1, missingRepeatOutput);
    assert.match(missingRepeatOutput, /testflight:missing/);

    const withRepeat = writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
      includeTestflightRepeat: true,
    });
    withRepeat.testflight.appStoreConnectBuildRecordIdentifier = "";
    withRepeat.testflight.generatedAt = withRepeat.blindParticipant.generatedAt;
    withRepeat.testflight.provenance.generatedAt = withRepeat.testflight.generatedAt;
    writeNoScreenEvidence(
      fixtureExpo,
      "release/no-screen-smoke.testflight.latest.json",
      withRepeat.testflight,
    );
    const invalidRepeat = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const invalidRepeatOutput = invalidRepeat.stdout + invalidRepeat.stderr;
    assert.equal(invalidRepeat.status, 1, invalidRepeatOutput);
    assert.match(invalidRepeatOutput, /appStoreConnectBuildRecordIdentifier/);
    assert.match(invalidRepeatOutput, /testflight\.generatedAt\.not-after-blindParticipant/);

    const hashMismatch = writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
      includeTestflightRepeat: true,
    });
    hashMismatch.testflight.installationEvidence.uploadedIpaSha256 = "e".repeat(64);
    writeNoScreenEvidence(
      fixtureExpo,
      "release/no-screen-smoke.testflight.latest.json",
      hashMismatch.testflight,
    );
    const hashMismatchResult = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const hashMismatchOutput = hashMismatchResult.stdout + hashMismatchResult.stderr;
    assert.equal(hashMismatchResult.status, 1, hashMismatchOutput);
    assert.match(
      hashMismatchOutput,
      /testflight\.invalid:installationEvidence\.uploadedIpaSha256-mismatch/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("all-track preflight validates the complete iOS launch matrix without reusing production no-screen evidence as staging", () => {
  const {
    activeProvenance,
    candidate,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const stagingSmoke = buildSmokeArtifact(
      "staging",
      launchInputs.stagingApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    const productionSmoke = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "staging", stagingSmoke);
    writeSmoke(fixtureRoot, "production", productionSmoke);
    writeCandidateEvidence(fixtureExpo, candidate.artifact);
    writeNoScreenEvidenceSet(fixtureExpo, productionSmoke, "store", {
      includeTestflightRepeat: true,
    });

    const result = runPreflight(fixtureExpo, "all", fakeBin, publicFetchPreload);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("store-backed preflight rejects no-screen evidence from a different launch candidate", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);
    const cases = [
      {
        expected: /generatedAt\.stale/,
        mutate(artifact) {
          artifact.generatedAt = new Date(
            Date.now() - (NO_SCREEN_EVIDENCE_MAX_AGE_SECONDS + 1) * 1000,
          ).toISOString();
          artifact.provenance.generatedAt = artifact.generatedAt;
        },
        track: "testflight",
      },
      {
        expected: /device\.appVersion:1\.0\.1/,
        mutate(artifact) {
          artifact.device.appVersion = "1.0.1";
          artifact.provenance.appVersion = "1.0.1";
        },
        track: "testflight",
      },
      {
        expected: /provenance\.buildNumber:5/,
        mutate(artifact) {
          artifact.device.buildNumber = "5";
          artifact.provenance.buildNumber = "5";
        },
        track: "testflight",
      },
      {
        expected: /provenance\.releaseTrack:testflight/,
        mutate(artifact) {
          artifact.device.buildProfile = "testflight";
          artifact.provenance.buildProfile = "testflight";
          artifact.provenance.releaseTrack = "testflight";
        },
        track: "store",
      },
      {
        expected: /provenance\.sourceRevision-mismatch/,
        mutate(artifact) {
          artifact.provenance.sourceRevision = "f".repeat(40);
        },
        track: "testflight",
      },
      {
        expected: /provenance\.candidateIdentifier-mismatch/,
        mutate(artifact) {
          artifact.provenance.candidateIdentifier = "f".repeat(64);
        },
        track: "testflight",
      },
      {
        expected: /backendSmoke\.requestIds\.guidanceAnalyze\.candidate-mismatch/,
        mutate(artifact) {
          artifact.backendSmoke.requestIds.guidanceAnalyze = "99999999-9999-4999-8999-999999999999";
        },
        track: "store",
      },
    ];

    for (const testCase of cases) {
      const evidenceSet = writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
        includeTestflightRepeat: testCase.track === "store",
      });
      testCase.mutate(evidenceSet.internal);
      writeNoScreenEvidence(
        fixtureExpo,
        "release/no-screen-smoke.internal.latest.json",
        evidenceSet.internal,
      );
      const result = runPreflight(
        fixtureExpo,
        testCase.track,
        fakeBin,
        publicFetchPreload,
      );
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 1, `${testCase.track}: ${output}`);
      assert.match(output, testCase.expected);
    }
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("store preflight rejects stale or unsuccessful live pages even when local pages are current", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);
    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
      includeTestflightRepeat: true,
    });

    const stalePages = buildPublicPageResponses();
    stalePages[launchInputs.supportUrl].body =
      "Support - Guide Pup. Check camera permission. Contact emergency services. Launch rehearsal.";
    const staleResult = runPreflight(fixtureExpo, "store", fakeBin, publicFetchPreload, {
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(stalePages),
    });
    const staleOutput = staleResult.stdout + staleResult.stderr;
    assert.equal(staleResult.status, 1, staleOutput);
    assert.match(staleOutput, /Live support is missing required current marker "charliehan112@gmail\.com"/);
    assert.match(staleOutput, /Live support still contains stale or launch-internal marker "launch rehearsal"/);

    const unavailablePages = buildPublicPageResponses();
    unavailablePages[launchInputs.privacyPolicyUrl].status = 503;
    const unavailableResult = runPreflight(fixtureExpo, "store", fakeBin, publicFetchPreload, {
      GUIDEPUP_TEST_PUBLIC_PAGE_RESPONSES: JSON.stringify(unavailablePages),
    });
    const unavailableOutput = unavailableResult.stdout + unavailableResult.stderr;
    assert.equal(unavailableResult.status, 1, unavailableOutput);
    assert.match(unavailableOutput, /Live privacy policy must return a successful HTTP response/);
    assert.match(unavailableOutput, /status 503/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("store preflight requires candidate-bound local attempt plus independent Apple correlation", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const smokeArtifact = buildSmokeArtifact(
      "production",
      launchInputs.productionApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    writeSmoke(fixtureRoot, "production", smokeArtifact);
    writeNoScreenEvidenceSet(fixtureExpo, smokeArtifact, "store", {
      includeTestflightRepeat: true,
    });
    const attemptPath = path.join(
      fixtureExpo,
      "release/ios-submission.latest.json",
    );
    const validAttempt = JSON.parse(readFileSync(attemptPath, "utf8"));

    const splicedAttempt = structuredClone(validAttempt);
    splicedAttempt.localCandidateIpaSha256 = "f".repeat(64);
    writeFileSync(
      attemptPath,
      `${JSON.stringify(splicedAttempt, null, 2)}\n`,
    );
    const splicedResult = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const splicedOutput = splicedResult.stdout + splicedResult.stderr;
    assert.equal(splicedResult.status, 1, splicedOutput);
    assert.match(
      splicedOutput,
      /localCandidateIpaSha256 does not match the local candidate upload attempt/,
    );

    const staleAttempt = structuredClone(validAttempt);
    staleAttempt.attemptStartedAt = "2026-07-01T20:00:00.000Z";
    staleAttempt.attemptCompletedAt = "2026-07-01T20:10:00.000Z";
    staleAttempt.generatedAt = staleAttempt.attemptCompletedAt;
    writeFileSync(
      attemptPath,
      `${JSON.stringify(staleAttempt, null, 2)}\n`,
    );
    const staleResult = runPreflight(
      fixtureExpo,
      "store",
      fakeBin,
      publicFetchPreload,
    );
    const staleOutput = staleResult.stdout + staleResult.stderr;
    assert.equal(staleResult.status, 1, staleOutput);
    assert.match(
      staleOutput,
      /uploadedAt does not correlate with the local upload-attempt window/,
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});

test("preview preflight warns, but does not pass single-lane evidence as launch-valid", () => {
  const {
    activeProvenance,
    fakeBin,
    fixtureExpo,
    fixtureRoot,
    publicFetchPreload,
    sourceRevision,
  } = createFixture();
  try {
    const artifact = buildSmokeArtifact(
      "staging",
      launchInputs.stagingApiBaseUrl,
      sourceRevision,
      activeProvenance,
    );
    delete artifact.lanes["scene-query"];
    artifact.launchContract = buildLaunchContract({ artifact });
    writeSmoke(fixtureRoot, "staging", artifact);

    const result = runPreflight(fixtureExpo, "preview", fakeBin, publicFetchPreload);
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.match(output, /Warnings:/);
    assert.match(output, /lanes\.scene-query/);
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
