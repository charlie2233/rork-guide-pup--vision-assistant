import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  fetchAppStoreConnectBuildEvidence,
  resolveAppStoreConnectApiToken,
} from "./app-store-connect-build-evidence.mjs";
import { validateEvidencePrivacy } from "./evidence-privacy.mjs";
import {
  formatNoScreenSmokeEvidenceIssues,
  NO_SCREEN_SMOKE_ARTIFACT_PATHS,
  readNoScreenSmokeEvidenceArtifact,
  validateNoScreenEvidenceProgression,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";
import {
  buildExpectedReleaseRuntimeConfigs,
  DEFAULT_RELEASE_CANDIDATE_PATH,
  validateReleaseCandidateEvidenceForLaunch,
  validateReleaseCandidateEvidenceSourceBinding,
} from "./release-candidate-evidence.mjs";
import {
  assessIosSubmissionEvidence,
  DEFAULT_IOS_SUBMISSION_ARTIFACT_PATH,
  expectedIosSubmissionEvidence,
} from "./ios-submission-evidence.mjs";
import { resolveReleaseSourceState } from "./release-source-state.mjs";
import {
  isGitRevision,
  validateSmokeArtifactContract,
} from "../../backend/guidepup-api/eval/smoke-contract.mjs";
import { resolveWorkerProvenance } from "../../backend/guidepup-api/eval/run-live-smoke.mjs";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { getConfig: getExpoConfig } = require("@expo/config");
const plist = require("@expo/plist").default;
const { getPublicUrls, isPlaceholderValue, launchInputs } = require("../release/launch-inputs");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, relativePath), "utf8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(projectDir, relativePath));
}

function fileExistsAbsolute(filePath) {
  return fs.existsSync(filePath);
}

const appJson = readJson("app.json");
const easJson = readJson("eas.json");
const packageJson = readJson("package.json");
const publicUrls = getPublicUrls();
const validTracks = new Set(["preview", "testflight", "store", "all"]);
const stagingSmokeArtifactPath = path.resolve(projectDir, "../backend/guidepup-api/eval/smoke-results-staging.latest.json");
const productionSmokeArtifactPath = path.resolve(projectDir, "../backend/guidepup-api/eval/smoke-results-production.latest.json");
const noScreenSmokeArtifactPaths = Object.fromEntries(
  Object.entries(NO_SCREEN_SMOKE_ARTIFACT_PATHS).map(([key, relativePath]) => [
    key,
    path.resolve(projectDir, relativePath),
  ]),
);
const releaseCandidateArtifactPath = path.resolve(projectDir, DEFAULT_RELEASE_CANDIDATE_PATH);
const iosSubmissionArtifactPath = path.resolve(
  projectDir,
  DEFAULT_IOS_SUBMISSION_ARTIFACT_PATH,
);
const supportPagePath = path.resolve(projectDir, "../site/support/index.html");
const expoAppConfigPath = path.resolve(projectDir, "app.config.ts");
const iosInfoPlistPath = path.resolve(projectDir, "ios/GuidePupVisionAssistant/Info.plist");
const iosProjectFilePath = path.resolve(projectDir, "ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj");
const iosPrivacyManifestPath = path.resolve(projectDir, "ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy");
const iosXcodeEnvPath = path.resolve(projectDir, "ios/.xcode.env");
const runtimeConfigPath = path.resolve(projectDir, "src/lib/config.ts");
const iosPodfileLockPath = path.resolve(projectDir, "ios/Podfile.lock");
const clientDiagnosticsPath = path.resolve(projectDir, "src/lib/clientDiagnostics.ts");
const iosAppTargetName = "GuidePupVisionAssistant";

const errors = [];
const warnings = [];
let cachedMetadataConfig;

function expect(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function warn(condition, message) {
  if (!condition) {
    warnings.push(message);
  }
}

function compare(actual, expected, label) {
  expect(actual === expected, `${label} must be "${expected}", found "${actual ?? "undefined"}".`);
}

function checkPlaceholder(value, label) {
  expect(!isPlaceholderValue(value), `${label} is unresolved: "${value || "empty"}".`);
}

function parseTrack(argv) {
  const trackArgIndex = argv.findIndex((arg) => arg === "--track");
  if (trackArgIndex !== -1) {
    return argv[trackArgIndex + 1];
  }

  const inlineTrackArg = argv.find((arg) => arg.startsWith("--track="));
  if (inlineTrackArg) {
    return inlineTrackArg.slice("--track=".length);
  }

  return "testflight";
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function parseOptionValue(argv, option) {
  const optionIndex = argv.findIndex((arg) => arg === option);
  if (optionIndex !== -1) {
    const value = argv[optionIndex + 1];
    return value && !value.startsWith("--") ? value : undefined;
  }

  const inlineOption = argv.find((arg) => arg.startsWith(`${option}=`));
  return inlineOption?.slice(`${option}=`.length) || undefined;
}

function readSmokeArtifact(filePath) {
  if (!fileExistsAbsolute(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextFileAbsolute(filePath) {
  if (!fileExistsAbsolute(filePath)) {
    return undefined;
  }

  return fs.readFileSync(filePath, "utf8");
}

function readCurrentGitSourceRevision() {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: path.resolve(projectDir, ".."),
    encoding: "utf8",
  });
  const sourceRevision = result.status === 0 ? result.stdout.trim().toLowerCase() : undefined;
  return isGitRevision(sourceRevision) ? sourceRevision : undefined;
}

function validateReleaseSourceState(expectedSourceRevision) {
  try {
    const state = resolveReleaseSourceState({ cwd: path.resolve(projectDir, "..") });
    expect(
      state.sourceRevision === expectedSourceRevision,
      `Release source revision must match Git HEAD ${expectedSourceRevision ?? "unavailable"}, found ${state.sourceRevision}.`,
    );
    return state;
  } catch (error) {
    expect(
      false,
      `Release source must be clean outside the exact generated-evidence allowlist: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function validateReleaseCandidateArtifact(artifact, expectedSourceRevision) {
  if (!artifact) {
    expect(
      false,
      `Release candidate evidence is missing: ${path.relative(projectDir, releaseCandidateArtifactPath)}. Generate it from the signed archive before TestFlight or store submission.`,
    );
    return undefined;
  }

  const result = validateReleaseCandidateEvidenceSourceBinding(artifact, {
    appVersion: launchInputs.iosMarketingVersion,
    buildNumber: launchInputs.iosBuildNumber,
    bundleIdentifier: launchInputs.iosBundleIdentifier,
    releaseRuntimeConfigs: buildExpectedReleaseRuntimeConfigs(easJson),
    sourceRevision: expectedSourceRevision,
    teamIdentifier: launchInputs.appleTeamId,
  });
  expect(
    result.valid,
    `Release candidate evidence must be structurally valid and bound to the exact source revision, bundle, version/build, and Apple team before fresh artifact inspection. Invalid: ${result.errors.join(", ") || "none"}.`,
  );
  return result.valid ? artifact : undefined;
}

function validateIosSubmissionForStore(
  artifact,
  candidateArtifact,
  appStoreConnectBuildEvidence,
) {
  if (!artifact) {
    expect(
      false,
      `Store preflight requires local upload-attempt evidence at ${path.relative(projectDir, iosSubmissionArtifactPath)}.`,
    );
    return;
  }
  if (!candidateArtifact || !appStoreConnectBuildEvidence) {
    return;
  }
  const expected = expectedIosSubmissionEvidence(
    candidateArtifact,
    launchInputs.ascAppId,
    artifact.track,
  );
  const validation = assessIosSubmissionEvidence({
    appStoreConnectBuildEvidence,
    artifact,
    expected,
  });
  expect(
    validation.submissionCorrelationReady,
    `Store local upload-attempt evidence and independent App Store Connect correlation must match the candidate. Invalid: ${validation.errors.join(", ") || "none"}.`,
  );
}

async function reinspectReleaseCandidateArtifact(
  artifact,
  expectedSourceRevision,
  archivePath,
  ipaPath,
  validationIpaPath,
) {
  if (!artifact || !archivePath || !ipaPath || !validationIpaPath) {
    return undefined;
  }

  try {
    const validation = await validateReleaseCandidateEvidenceForLaunch(
      artifact,
      {
        appVersion: launchInputs.iosMarketingVersion,
        buildNumber: launchInputs.iosBuildNumber,
        bundleIdentifier: launchInputs.iosBundleIdentifier,
        releaseRuntimeConfigs: buildExpectedReleaseRuntimeConfigs(easJson),
        sourceRevision: expectedSourceRevision,
        teamIdentifier: launchInputs.appleTeamId,
      },
      {
        archivePath,
        ipaPath,
        validationIpaPath,
      },
    );
    expect(
      validation.valid,
      validation.errors.join(", ")
        || "Release candidate launch-grade inspection failed.",
    );
    return validation.valid ? artifact : undefined;
  } catch (error) {
    expect(
      false,
      `Release candidate archive/Store IPA/validation IPA re-inspection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

function loadMetadataConfig() {
  if (cachedMetadataConfig !== undefined) {
    return cachedMetadataConfig;
  }

  const metadataPath = path.join(projectDir, launchInputs.metadataPath);
  try {
    const metadata = require(metadataPath);
    cachedMetadataConfig = typeof metadata === "function" ? metadata() : metadata;
  } catch (error) {
    errors.push(`Metadata config could not be loaded from ${launchInputs.metadataPath}: ${error instanceof Error ? error.message : String(error)}.`);
    cachedMetadataConfig = null;
  }

  return cachedMetadataConfig;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isLikelyEmail(value) {
  return isNonEmptyString(value) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isLikelyInternationalPhone(value) {
  return isNonEmptyString(value) && /^\+[0-9][0-9\s().-]{6,}$/.test(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function plistStringUsesBuildSetting(xml, keyName, settingName) {
  const pattern = new RegExp(
    `<key>${escapeRegExp(keyName)}</key>\\s*<string>\\$\\(${escapeRegExp(settingName)}\\)</string>`,
  );
  return pattern.test(xml);
}

function getPbxObjectBlock(projectText, objectId) {
  const pattern = new RegExp(
    `^\\t\\t${escapeRegExp(objectId)} \\/\\*[^\\n]*\\*\\/ = \\{([\\s\\S]*?)^\\t\\t\\};$`,
    "m",
  );
  return projectText.match(pattern)?.[1];
}

function getPbxBuildSetting(configurationBlock, settingName, configurationName) {
  const pattern = new RegExp(
    `^[ \\t]*${escapeRegExp(settingName)}[ \\t]*=[ \\t]*([^;\\n]+);[ \\t]*$`,
    "gm",
  );
  const matches = [...configurationBlock.matchAll(pattern)];
  expect(
    matches.length === 1,
    `Native iOS app target ${configurationName} must define ${settingName} exactly once.`,
  );

  const rawValue = matches[0]?.[1]?.trim();
  if (!rawValue) {
    return undefined;
  }

  return rawValue.startsWith('"') && rawValue.endsWith('"') ? rawValue.slice(1, -1) : rawValue;
}

function getPbxShellScript(projectText, phaseName) {
  const phasePattern = new RegExp(
    `^\\t\\t[A-F0-9]+ \\/\\* ${escapeRegExp(phaseName)} \\*\\/ = \\{([\\s\\S]*?)^\\t\\t\\};$`,
    "m",
  );
  const phaseBlock = projectText.match(phasePattern)?.[1];
  if (!phaseBlock) {
    return undefined;
  }

  const quotedScript = phaseBlock.match(/^[ \t]*shellScript = ("(?:\\.|[^"\\])*");[ \t]*$/m)?.[1];
  if (!quotedScript) {
    return undefined;
  }

  try {
    return JSON.parse(quotedScript);
  } catch {
    return undefined;
  }
}

function validateIosVersionOwnership() {
  const marketingVersion = launchInputs.iosMarketingVersion;
  const buildNumber = launchInputs.iosBuildNumber;

  expect(
    typeof marketingVersion === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(marketingVersion),
    `launchInputs.iosMarketingVersion must contain three period-separated integers, found "${marketingVersion ?? "undefined"}".`,
  );
  expect(
    typeof buildNumber === "string" && /^[1-9][0-9]*$/.test(buildNumber),
    `launchInputs.iosBuildNumber must be a positive integer string, found "${buildNumber ?? "undefined"}".`,
  );
  compare(appJson.expo.version, marketingVersion, "app.json iOS marketing version");
  compare(appJson.expo.ios?.buildNumber, buildNumber, "app.json iOS build number");
  compare(easJson.cli?.appVersionSource, "local", "EAS app version source");

  const infoPlistXml = readTextFileAbsolute(iosInfoPlistPath);
  expect(Boolean(infoPlistXml), "Native iOS Info.plist is missing: ios/GuidePupVisionAssistant/Info.plist.");
  if (infoPlistXml) {
    expect(
      plistStringUsesBuildSetting(infoPlistXml, "CFBundleShortVersionString", "MARKETING_VERSION"),
      "Native iOS Info.plist CFBundleShortVersionString must reference $(MARKETING_VERSION).",
    );
    expect(
      plistStringUsesBuildSetting(infoPlistXml, "CFBundleVersion", "CURRENT_PROJECT_VERSION"),
      "Native iOS Info.plist CFBundleVersion must reference $(CURRENT_PROJECT_VERSION).",
    );
    const nativeInfoPlist = plist.parse(infoPlistXml);
    compare(
      nativeInfoPlist.GuidePupAppStoreConnectAppID,
      launchInputs.ascAppId,
      "Native iOS StoreKit app ID expectation",
    );
    compare(
      nativeInfoPlist.GuidePupExpectedBuildNumber,
      buildNumber,
      "Native iOS StoreKit build expectation",
    );
  }

  const projectText = readTextFileAbsolute(iosProjectFilePath);
  expect(Boolean(projectText), "Native iOS Xcode project is missing: ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj.");
  if (!projectText) {
    return;
  }

  const configurationListReference = projectText.match(
    new RegExp(
      `buildConfigurationList = ([A-F0-9]+) \\/\\* Build configuration list for PBXNativeTarget "${escapeRegExp(iosAppTargetName)}" \\*\\/;`,
    ),
  );
  expect(Boolean(configurationListReference), `Native iOS app target ${iosAppTargetName} configuration list is missing.`);
  const configurationListId = configurationListReference?.[1];
  if (!configurationListId) {
    return;
  }

  const configurationListBlock = getPbxObjectBlock(projectText, configurationListId);
  expect(Boolean(configurationListBlock), `Native iOS app target ${iosAppTargetName} configuration list cannot be parsed.`);
  if (!configurationListBlock) {
    return;
  }

  for (const configurationName of ["Debug", "Release"]) {
    const configurationReference = configurationListBlock.match(
      new RegExp(`^[ \\t]*([A-F0-9]+) \\/\\* ${configurationName} \\*\\/,[ \\t]*$`, "m"),
    );
    expect(Boolean(configurationReference), `Native iOS app target ${configurationName} configuration is missing.`);
    const configurationId = configurationReference?.[1];
    if (!configurationId) {
      continue;
    }

    const configurationBlock = getPbxObjectBlock(projectText, configurationId);
    expect(Boolean(configurationBlock), `Native iOS app target ${configurationName} configuration cannot be parsed.`);
    if (!configurationBlock) {
      continue;
    }

    compare(
      getPbxBuildSetting(configurationBlock, "MARKETING_VERSION", configurationName),
      marketingVersion,
      `Native iOS app target ${configurationName} MARKETING_VERSION`,
    );
    compare(
      getPbxBuildSetting(configurationBlock, "CURRENT_PROJECT_VERSION", configurationName),
      buildNumber,
      `Native iOS app target ${configurationName} CURRENT_PROJECT_VERSION`,
    );
    compare(
      getPbxBuildSetting(configurationBlock, "DEVELOPMENT_TEAM", configurationName),
      launchInputs.appleTeamId,
      `Native iOS app target ${configurationName} DEVELOPMENT_TEAM`,
    );
    compare(
      getPbxBuildSetting(configurationBlock, "PRODUCT_BUNDLE_IDENTIFIER", configurationName),
      launchInputs.iosBundleIdentifier,
      `Native iOS app target ${configurationName} PRODUCT_BUNDLE_IDENTIFIER`,
    );
    compare(
      getPbxBuildSetting(configurationBlock, "CODE_SIGN_STYLE", configurationName),
      "Automatic",
      `Native iOS app target ${configurationName} CODE_SIGN_STYLE`,
    );
  }
}

function getOptionalEnvValue(profile, key) {
  const value = profile?.env?.[key];
  return typeof value === "string" ? value : undefined;
}

const directXcodeEnvironmentKeys = [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_RELEASE_TRACK",
  "EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS",
  "EXPO_PUBLIC_WEBSITE_URL",
  "EXPO_PUBLIC_PRIVACY_POLICY_URL",
  "EXPO_PUBLIC_SUPPORT_URL",
  "EXPO_PUBLIC_SUPPORT_EMAIL",
  "EXPO_PUBLIC_EMERGENCY_DISCLAIMER",
];

const expectedReactNativeBundleInvocation = [
  "/bin/sh",
  "`\"$NODE_BINARY\" --print \"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\"`",
].join(" ");
const expectedEntryFileAssignment =
  'export ENTRY_FILE="$("$NODE_BINARY" -e "require(\'expo/scripts/resolveAppEntry\')" "$PROJECT_ROOT" ios absolute | tail -n 1)"';
const expectedCliPathAssignment =
  'export CLI_PATH="$("$NODE_BINARY" --print "require.resolve(\'@expo/cli\', { paths: [require.resolve(\'expo/package.json\')] })")"';

function instrumentBundleScript(bundleScript) {
  const lines = bundleScript.split(/\r?\n/);
  const wrapperIndexes = lines.flatMap((line, index) =>
    line.trim() === expectedReactNativeBundleInvocation ? [index] : [],
  );
  expect(
    wrapperIndexes.length === 1,
    "Native iOS React Native bundle phase must contain exactly one canonical executable react-native-xcode.sh invocation.",
  );
  const entryFileAssignmentCount = lines.filter((line) => line.trim() === expectedEntryFileAssignment).length;
  const cliPathAssignmentCount = lines.filter((line) => line.trim() === expectedCliPathAssignment).length;
  expect(
    entryFileAssignmentCount === 1,
    "Native iOS React Native bundle phase must contain exactly one canonical Expo ENTRY_FILE assignment.",
  );
  expect(
    cliPathAssignmentCount === 1,
    "Native iOS React Native bundle phase must contain exactly one canonical Expo CLI_PATH assignment.",
  );
  if (wrapperIndexes.length !== 1 || entryFileAssignmentCount !== 1 || cliPathAssignmentCount !== 1) {
    return undefined;
  }

  const randomProbeKey = () => `GUIDE_PUP_${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const probeKeys = {
    cliPathAssignmentReached: randomProbeKey(),
    cliPathResolvedAtWrapper: randomProbeKey(),
    entryFileAssignmentReached: randomProbeKey(),
    entryFileResolvedAtWrapper: randomProbeKey(),
    localSourceCount: randomProbeKey(),
    updatesSourceCount: randomProbeKey(),
    versionedSourceCount: randomProbeKey(),
    bundleWrapperReached: randomProbeKey(),
  };
  const instrumentedLines = lines.map((line) => {
    const indentation = line.match(/^\s*/)?.[0] || "";
    const trimmed = line.trim();
    if (trimmed === expectedEntryFileAssignment) {
      return `${line}\n${indentation}export ${probeKeys.entryFileAssignmentReached}=true`;
    }
    if (trimmed === expectedCliPathAssignment) {
      return `${line}\n${indentation}export ${probeKeys.cliPathAssignmentReached}=true`;
    }
    switch (trimmed) {
      case 'source "$PODS_ROOT/../.xcode.env"':
        return `${line}\n${indentation}export ${probeKeys.versionedSourceCount}=$((\${${probeKeys.versionedSourceCount}:-0} + 1))`;
      case 'source "$PODS_ROOT/../.xcode.env.local"':
        return `${line}\n${indentation}export ${probeKeys.localSourceCount}=$((\${${probeKeys.localSourceCount}:-0} + 1))`;
      case 'source "$PODS_ROOT/../.xcode.env.updates"':
        return `${line}\n${indentation}export ${probeKeys.updatesSourceCount}=$((\${${probeKeys.updatesSourceCount}:-0} + 1))`;
      case expectedReactNativeBundleInvocation:
        return [
          `${indentation}export ${probeKeys.bundleWrapperReached}=true`,
          `${indentation}if [ "\${${probeKeys.entryFileAssignmentReached}:-false}" = "true" ] && [ -n "\${ENTRY_FILE:-}" ] && [ -f "$ENTRY_FILE" ]; then`,
          `${indentation}  export ${probeKeys.entryFileResolvedAtWrapper}=true`,
          `${indentation}else`,
          `${indentation}  export ${probeKeys.entryFileResolvedAtWrapper}=false`,
          `${indentation}fi`,
          `${indentation}if [ "\${${probeKeys.cliPathAssignmentReached}:-false}" = "true" ] && [ -n "\${CLI_PATH:-}" ] && [ -f "$CLI_PATH" ]; then`,
          `${indentation}  export ${probeKeys.cliPathResolvedAtWrapper}=true`,
          `${indentation}else`,
          `${indentation}  export ${probeKeys.cliPathResolvedAtWrapper}=false`,
          `${indentation}fi`,
        ].join("\n");
      default:
        return line;
    }
  });

  return { lines: instrumentedLines, probeKeys };
}

function createDirectXcodeProbeRoot() {
  const probeRoot = fs.mkdtempSync(path.join(tmpdir(), "guidepup-xcode-env-"));
  fs.mkdirSync(path.join(probeRoot, "Pods"));
  fs.copyFileSync(iosXcodeEnvPath, path.join(probeRoot, ".xcode.env"));

  for (const fileName of [".xcode.env.local", ".xcode.env.updates"]) {
    const sourcePath = path.join(projectDir, "ios", fileName);
    const probePath = path.join(probeRoot, fileName);
    if (fileExistsAbsolute(sourcePath)) {
      fs.copyFileSync(sourcePath, probePath);
    } else {
      fs.writeFileSync(probePath, "", "utf8");
    }
  }

  return probeRoot;
}

function readDirectXcodeEnvironment(
  configuration,
  environmentOverrides,
  instrumentedBundleScript,
  environmentLabel,
  probeRoot,
) {
  if (!instrumentedBundleScript) {
    return {};
  }

  const outputKeys = ["BUNDLE_COMMAND", ...directXcodeEnvironmentKeys, ...Object.values(instrumentedBundleScript.probeKeys)];
  const outputDelimiter = `GUIDE_PUP_ENV_${randomUUID().replaceAll("-", "").toUpperCase()}`;
  const delimiterMarker = `\n${outputDelimiter}\n`;
  const printEnvironment = [
    ...instrumentedBundleScript.lines,
    `printf '\\n%s\\n' '${outputDelimiter}'`,
    "/usr/bin/env -0",
  ].join("\n");
  const result = spawnSync(
    "/bin/sh",
    ["-c", printEnvironment, "guidepup-xcode-env"],
    {
      encoding: "utf8",
      env: {
        CONFIGURATION: configuration,
        HOME: process.env.HOME || "",
        PATH: process.env.PATH || "/usr/bin:/bin",
        PODS_ROOT: path.join(probeRoot, "Pods"),
        PROJECT_DIR: path.join(projectDir, "ios"),
        SRCROOT: path.join(projectDir, "ios"),
        ...environmentOverrides,
      },
    },
  );

  expect(
    result.status === 0,
    `Direct Xcode ${environmentLabel} environment could not be resolved through the native bundle phase.`,
  );
  if (result.status !== 0) {
    return {};
  }

  const delimiterIndex = result.stdout.lastIndexOf(delimiterMarker);
  if (delimiterIndex === -1) {
    expect(false, `Direct Xcode ${environmentLabel} environment did not reach its isolated output boundary.`);
    return {};
  }

  const environmentEntries = result.stdout
    .slice(delimiterIndex + delimiterMarker.length)
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=");
      return separatorIndex === -1 ? [entry, ""] : [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)];
    });
  const resolvedEnvironment = Object.fromEntries(environmentEntries);
  return Object.fromEntries(outputKeys.map((key) => [key, resolvedEnvironment[key]]));
}

function validateDirectXcodeProbeExecution(environment, label, probeKeys) {
  compare(environment.BUNDLE_COMMAND, "export:embed", `Direct Xcode ${label} BUNDLE_COMMAND`);
  compare(
    environment[probeKeys.versionedSourceCount],
    "1",
    `Direct Xcode ${label} versioned environment source count`,
  );
  compare(
    environment[probeKeys.localSourceCount],
    "2",
    `Direct Xcode ${label} local environment source count`,
  );
  compare(
    environment[probeKeys.updatesSourceCount],
    "1",
    `Direct Xcode ${label} updates environment source count`,
  );
  compare(
    environment[probeKeys.bundleWrapperReached],
    "true",
    `Direct Xcode ${label} bundle wrapper reachability`,
  );
  compare(
    environment[probeKeys.entryFileResolvedAtWrapper],
    "true",
    `Direct Xcode ${label} Expo entry resolution before bundle wrapper`,
  );
  compare(
    environment[probeKeys.cliPathResolvedAtWrapper],
    "true",
    `Direct Xcode ${label} Expo CLI resolution before bundle wrapper`,
  );
}

function validateDirectXcodeLaunchEnvironment() {
  expect(Boolean(readTextFileAbsolute(iosXcodeEnvPath)), "Local Xcode environment source is missing: ios/.xcode.env.");
  if (!fileExistsAbsolute(iosXcodeEnvPath)) {
    return;
  }

  const projectText = readTextFileAbsolute(iosProjectFilePath);
  expect(Boolean(projectText), "Native iOS Xcode project is missing: ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj.");
  if (!projectText) {
    return;
  }

  const bundleScript = getPbxShellScript(projectText, "Bundle React Native code and images");
  expect(Boolean(bundleScript), "Native iOS React Native bundle phase cannot be parsed.");
  if (!bundleScript) {
    return;
  }

  const instrumentedBundleScript = instrumentBundleScript(bundleScript);
  if (!instrumentedBundleScript) {
    return;
  }

  const probeRoot = createDirectXcodeProbeRoot();
  let debugEnvironment;
  let releaseEnvironment;
  const resolvedEasEnvironments = [];
  try {
    debugEnvironment = readDirectXcodeEnvironment("Debug", {}, instrumentedBundleScript, "Debug", probeRoot);
    releaseEnvironment = readDirectXcodeEnvironment("Release", {}, instrumentedBundleScript, "Release", probeRoot);
    validateDirectXcodeProbeExecution(debugEnvironment, "Debug", instrumentedBundleScript.probeKeys);
    validateDirectXcodeProbeExecution(releaseEnvironment, "Release", instrumentedBundleScript.probeKeys);

    for (const [profileName, profile] of [
      ["preview", easJson.build?.preview],
      ["testflight", easJson.build?.testflight],
      ["store", easJson.build?.store],
    ]) {
      const profileEnvironment = profile?.env || {};
      const resolvedEnvironment = readDirectXcodeEnvironment(
        "Release",
        {
          ...profileEnvironment,
          CI: "1",
          EAS_BUILD: "true",
          EAS_BUILD_COCOAPODS_CACHE_URL: "https://cache.invalid/cocoapods",
          EAS_BUILD_GIT_COMMIT_HASH: "0000000000000000000000000000000000000000",
          EAS_BUILD_ID: "00000000-0000-4000-8000-000000000000",
          EAS_BUILD_MAVEN_CACHE_URL: "https://cache.invalid/maven",
          EAS_BUILD_NPM_CACHE_URL: "https://cache.invalid/npm",
          EAS_BUILD_PLATFORM: "ios",
          EAS_BUILD_PROFILE: profileName,
          EAS_BUILD_PROJECT_ID: "00000000-0000-4000-8000-000000000000",
          EAS_BUILD_RUNNER: "eas-build",
          EAS_BUILD_USERNAME: "guidepup-preflight",
          EAS_BUILD_WORKINGDIR: projectDir,
        },
        instrumentedBundleScript,
        `EAS ${profileName}`,
        probeRoot,
      );
      validateDirectXcodeProbeExecution(
        resolvedEnvironment,
        `EAS ${profileName}`,
        instrumentedBundleScript.probeKeys,
      );
      resolvedEasEnvironments.push([profileName, profileEnvironment, resolvedEnvironment]);
    }
  } finally {
    fs.rmSync(probeRoot, { force: true, recursive: true });
  }
  compare(
    debugEnvironment.EXPO_PUBLIC_API_BASE_URL,
    launchInputs.stagingApiBaseUrl,
    "Direct Xcode Debug EXPO_PUBLIC_API_BASE_URL",
  );
  compare(debugEnvironment.EXPO_PUBLIC_APP_ENV, "preview", "Direct Xcode Debug EXPO_PUBLIC_APP_ENV");
  compare(
    debugEnvironment.EXPO_PUBLIC_RELEASE_TRACK,
    "internal-preview",
    "Direct Xcode Debug EXPO_PUBLIC_RELEASE_TRACK",
  );
  compare(
    releaseEnvironment.EXPO_PUBLIC_API_BASE_URL,
    launchInputs.productionApiBaseUrl,
    "Direct Xcode Release EXPO_PUBLIC_API_BASE_URL",
  );
  compare(releaseEnvironment.EXPO_PUBLIC_APP_ENV, "production", "Direct Xcode Release EXPO_PUBLIC_APP_ENV");
  compare(
    releaseEnvironment.EXPO_PUBLIC_RELEASE_TRACK,
    "app-store",
    "Direct Xcode Release EXPO_PUBLIC_RELEASE_TRACK",
  );
  for (const [configuration, environment] of [
    ["Debug", debugEnvironment],
    ["Release", releaseEnvironment],
  ]) {
    compare(
      environment.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS,
      "false",
      `Direct Xcode ${configuration} experimental tabs flag`,
    );
    compare(environment.EXPO_PUBLIC_WEBSITE_URL, publicUrls.websiteUrl, `Direct Xcode ${configuration} website URL`);
    compare(
      environment.EXPO_PUBLIC_PRIVACY_POLICY_URL,
      publicUrls.privacyPolicyUrl,
      `Direct Xcode ${configuration} privacy policy URL`,
    );
    compare(environment.EXPO_PUBLIC_SUPPORT_URL, publicUrls.supportUrl, `Direct Xcode ${configuration} support URL`);
    compare(
      environment.EXPO_PUBLIC_SUPPORT_EMAIL,
      launchInputs.supportEmail,
      `Direct Xcode ${configuration} support email`,
    );
    compare(
      environment.EXPO_PUBLIC_EMERGENCY_DISCLAIMER,
      launchInputs.emergencyDisclaimer,
      `Direct Xcode ${configuration} emergency disclaimer`,
    );
  }

  for (const [profileName, profileEnvironment, resolvedEnvironment] of resolvedEasEnvironments) {
    for (const key of directXcodeEnvironmentKeys) {
      if (typeof profileEnvironment[key] === "string") {
        compare(resolvedEnvironment[key], profileEnvironment[key], `Direct Xcode EAS ${profileName} effective ${key}`);
      }
    }
  }

  const bundleLines = bundleScript.split(/\r?\n/);
  const executableExactIndexes = (expectedLine) => bundleLines.flatMap((line, index) => {
    const trimmed = line.trim();
    return trimmed === expectedLine && !trimmed.startsWith("#") ? [index] : [];
  });
  const versionedEnvironmentIndexes = executableExactIndexes('source "$PODS_ROOT/../.xcode.env"');
  const localEnvironmentIndexes = executableExactIndexes('source "$PODS_ROOT/../.xcode.env.local"');
  const bundleCommandIndexes = executableExactIndexes('export BUNDLE_COMMAND="export:embed"');
  const entryFileAssignmentIndexes = executableExactIndexes(expectedEntryFileAssignment);
  const cliPathAssignmentIndexes = executableExactIndexes(expectedCliPathAssignment);
  const updatesEnvironmentIndexes = executableExactIndexes('source "$PODS_ROOT/../.xcode.env.updates"');
  const reactNativeBundleIndexes = bundleLines.flatMap((line, index) =>
    line.trim() === expectedReactNativeBundleInvocation ? [index] : [],
  );
  const versionedEnvironmentIndex = versionedEnvironmentIndexes[0] ?? -1;
  const firstLocalEnvironmentIndex = localEnvironmentIndexes[0] ?? -1;
  const bundleCommandIndex = bundleCommandIndexes[0] ?? -1;
  const entryFileAssignmentIndex = entryFileAssignmentIndexes[0] ?? -1;
  const cliPathAssignmentIndex = cliPathAssignmentIndexes[0] ?? -1;
  const updatesEnvironmentIndex = updatesEnvironmentIndexes[0] ?? -1;
  const finalLocalEnvironmentIndex = localEnvironmentIndexes.at(-1) ?? -1;
  const reactNativeBundleIndex = reactNativeBundleIndexes[0] ?? -1;
  expect(
    versionedEnvironmentIndexes.length === 1 && versionedEnvironmentIndex < bundleCommandIndex,
    "Native iOS React Native bundle phase must source ios/.xcode.env before selecting Expo export:embed.",
  );
  expect(
    localEnvironmentIndexes.length === 2 && firstLocalEnvironmentIndex > versionedEnvironmentIndex,
    "Native iOS React Native bundle phase must apply .xcode.env.local after the versioned launch defaults.",
  );
  expect(bundleCommandIndexes.length === 1, 'Native iOS React Native bundle phase must use Expo "export:embed" exactly once.');
  expect(
    entryFileAssignmentIndexes.length === 1
      && entryFileAssignmentIndex > firstLocalEnvironmentIndex
      && entryFileAssignmentIndex < cliPathAssignmentIndex
      && entryFileAssignmentIndex < bundleCommandIndex,
    "Native iOS React Native bundle phase must resolve the Expo entry after launch defaults and before the Expo CLI.",
  );
  expect(
    cliPathAssignmentIndexes.length === 1
      && cliPathAssignmentIndex > entryFileAssignmentIndex
      && cliPathAssignmentIndex < bundleCommandIndex,
    "Native iOS React Native bundle phase must resolve the Expo CLI before selecting the bundle command.",
  );
  expect(
    updatesEnvironmentIndexes.length === 1
      && updatesEnvironmentIndex > bundleCommandIndex
      && finalLocalEnvironmentIndex > updatesEnvironmentIndex,
    "Native iOS React Native bundle phase environment update/local override order has changed.",
  );
  expect(
    reactNativeBundleIndexes.length === 1 && reactNativeBundleIndex > finalLocalEnvironmentIndex,
    "Native iOS React Native bundle phase must resolve all Xcode environment files before bundling JavaScript.",
  );
}

function validateSentrySdkAbsent() {
  const appConfigSource = readTextFileAbsolute(expoAppConfigPath);
  const projectText = readTextFileAbsolute(iosProjectFilePath);
  const runtimeConfigSource = readTextFileAbsolute(runtimeConfigPath);
  const podfileLock = readTextFileAbsolute(iosPodfileLockPath);
  const clientDiagnosticsSource = readTextFileAbsolute(clientDiagnosticsPath);

  expect(Boolean(appConfigSource), "Expo dynamic app config is missing: app.config.ts.");
  if (appConfigSource) {
    expect(
      /require\(["']\.\/release\/launch-inputs\.js["']\)/.test(appConfigSource),
      "app.config.ts must load the checked-in release launch inputs.",
    );
    expect(!/Sentry|sentry/.test(appConfigSource), "app.config.ts must not expose Sentry launch configuration.");
  }

  try {
    const resolvedConfig = getExpoConfig(projectDir, {
      isPublicConfig: true,
      skipPlugins: true,
      skipSDKVersionRequirement: true,
    }).exp;
    compare(
      resolvedConfig.ios?.bundleIdentifier,
      launchInputs.iosBundleIdentifier,
      "Resolved Expo iOS bundle identifier",
    );
    compare(
      resolvedConfig.ios?.infoPlist?.GuidePupAppStoreConnectAppID,
      launchInputs.ascAppId,
      "Resolved Expo StoreKit app ID expectation",
    );
    compare(
      resolvedConfig.ios?.infoPlist?.GuidePupExpectedBuildNumber,
      launchInputs.iosBuildNumber,
      "Resolved Expo StoreKit build expectation",
    );
    expect(
      !resolvedConfig.plugins?.some((plugin) =>
        (Array.isArray(plugin) ? plugin[0] : plugin) === "@sentry/react-native/expo"
      ),
      "Resolved Expo plugins must not include @sentry/react-native/expo.",
    );
  } catch (error) {
    expect(false, `Expo dynamic app config could not be resolved: ${error instanceof Error ? error.message : String(error)}.`);
  }

  expect(Boolean(runtimeConfigSource), "Runtime app config is missing: src/lib/config.ts.");
  expect(Boolean(clientDiagnosticsSource), "Local client diagnostics adapter is missing.");
  expect(
    !/@sentry\/react-native|EXPO_PUBLIC_SENTRY_DSN|launchSentryMode|sentryDsn/.test(
      `${runtimeConfigSource || ""}\n${clientDiagnosticsSource || ""}`,
    ),
    "Shipping runtime config and local diagnostics must not import or configure Sentry.",
  );
  expect(
    !packageJson.dependencies?.["@sentry/react-native"] && !packageJson.devDependencies?.["@sentry/react-native"],
    "package.json must not include @sentry/react-native while launch Sentry mode is disabled.",
  );
  expect(
    !appJson.expo?.plugins?.some((plugin) =>
      (Array.isArray(plugin) ? plugin[0] : plugin) === "@sentry/react-native/expo"
    ),
    "app.json must not include @sentry/react-native/expo while launch Sentry mode is disabled.",
  );
  expect(
    !/RNSentry|(?:^|[^A-Za-z])Sentry(?:[^A-Za-z]|$)/m.test(podfileLock || ""),
    "ios/Podfile.lock must not include Sentry pods while launch Sentry mode is disabled.",
  );
  expect(
    !/@sentry\/react-native|Upload Debug Symbols to Sentry|sentry-xcode|Sentry\.bundle/.test(projectText || ""),
    "Native iOS project must not contain Sentry bundle, wrapper, or upload-phase references.",
  );
  expect(
    !fileExists("ios/sentry.properties"),
    "ios/sentry.properties must not exist while the Sentry SDK is absent.",
  );
}

function validateSentryLaunchDecision({ previewProfile, testflightProfile, storeProfile }) {
  const sentryMode = launchInputs.sentryMode;
  compare(sentryMode, "disabled", "launchInputs.sentryMode");
  expect(
    !isNonEmptyString(launchInputs.productionSentryDsn),
    "Production Sentry DSN must stay blank while the launch client contains no Sentry SDK.",
  );
  validateSentrySdkAbsent();

  const selectedProfiles = [
    ["preview", previewProfile, requiresPreview],
    ["testflight", testflightProfile, requiresTestflight],
    ["store", storeProfile, requiresStore],
  ].filter(([, profile, shouldCheck]) => shouldCheck && profile);
  const xcodeEnv = readTextFileAbsolute(iosXcodeEnvPath);
  expect(Boolean(xcodeEnv), "Local Xcode environment source is missing: ios/.xcode.env.");
  expect(
    !/SENTRY|sentry/.test(xcodeEnv || ""),
    "ios/.xcode.env must not contain Sentry variables while the SDK is absent.",
  );
  for (const [profileName, profile] of selectedProfiles) {
    expect(
      getOptionalEnvValue(profile, "EXPO_PUBLIC_SENTRY_DSN") === undefined,
      `${profileName} must omit EXPO_PUBLIC_SENTRY_DSN while the Sentry SDK is absent.`,
    );
    expect(
      getOptionalEnvValue(profile, "SENTRY_DISABLE_AUTO_UPLOAD") === undefined,
      `${profileName} must omit SENTRY_DISABLE_AUTO_UPLOAD while the Sentry SDK is absent.`,
    );
  }
}

function validateSmokeArtifact(artifact, options) {
  const {
    allowWarning,
    description,
    expectedEnvironment,
    filePath,
    expectedPromptVersion,
    expectedVisionModel,
    requireProviderBacked,
    targetUrl,
  } = options;

  if (!artifact) {
    const message = `${description} smoke artifact is missing: ${path.relative(projectDir, filePath)}. Run the live smoke command first.`;
    if (allowWarning && !requireProviderBacked) {
      warn(false, message);
      return;
    }
    expect(false, message);
    return;
  }

  expect(artifact.apiUrl === targetUrl, `${description} smoke artifact must target "${targetUrl}", found "${artifact.apiUrl ?? "undefined"}".`);
  expect(artifact.health?.statusCode === 200, `${description} smoke artifact must show /health 200.`);
  expect(isNonEmptyString(artifact.health?.requestId), `${description} smoke artifact must include /health request ID.`);
  expect(artifact.bootstrap?.statusCode === 200, `${description} smoke artifact must show /v1/device/bootstrap 200.`);
  expect(isNonEmptyString(artifact.bootstrap?.requestId), `${description} smoke artifact must include /v1/device/bootstrap request ID.`);
  // Historical v1 evidence used artifact.analyze?.requestId; it remains readable but is never launch-valid.
  const explicitFields = validateExplicitSmokeFields(artifact);
  const gitResult = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: path.resolve(projectDir, ".."),
    encoding: "utf8",
  });
  const currentSourceRevision = gitResult.status === 0 ? gitResult.stdout.trim().toLowerCase() : undefined;
  const evidenceShape = validateSmokeArtifactContract(artifact, {
    expectedApiUrl: targetUrl,
    expectedEnvironment,
    expectedModel: expectedVisionModel,
    expectedPromptVersion,
    expectedSourceRevision: currentSourceRevision,
  });
  evidenceShape.missing.push(...explicitFields.missing);
  evidenceShape.invalid.push(...explicitFields.invalid);
  if (!isGitRevision(currentSourceRevision)) {
    evidenceShape.invalid.push("provenance.current-source-revision-unavailable");
  }
  if (requireProviderBacked && isGitRevision(currentSourceRevision)) {
    try {
      const activeProvenance = resolveWorkerProvenance(expectedEnvironment, currentSourceRevision);
      if (artifact.provenance?.workerDeploymentId !== activeProvenance.workerDeploymentId) {
        evidenceShape.invalid.push("provenance.workerDeploymentId-active-mismatch");
      }
      if (artifact.provenance?.workerVersionId !== activeProvenance.workerVersionId) {
        evidenceShape.invalid.push("provenance.workerVersionId-active-mismatch");
      }
      if (artifact.provenance?.workerVersionCreatedAt !== activeProvenance.workerVersionCreatedAt) {
        evidenceShape.invalid.push("provenance.workerVersionCreatedAt-active-mismatch");
      }
    } catch {
      evidenceShape.invalid.push("provenance.active-worker-unavailable");
    }
  } else if (!requireProviderBacked) {
    evidenceShape.invalid.push("provenance.active-worker-not-verified-for-preview");
  }
  const privacy = validateEvidencePrivacy(artifact);
  for (const fieldPath of privacy.disallowedKeys) {
    evidenceShape.invalid.push(`disallowedKey:${fieldPath}`);
  }
  for (const pattern of privacy.sensitivePatterns) {
    evidenceShape.invalid.push(`sensitivePattern:${pattern}`);
  }
  evidenceShape.valid = evidenceShape.missing.length === 0 && evidenceShape.invalid.length === 0;
  const evidenceShapeMessage = `${description} smoke artifact must be fresh, match the current Git revision and active Worker deployment/version, and prove distinct provider-backed guidance and scene-query lanes with sanitized request IDs and valid structured safety outputs. Missing: ${
    evidenceShape.missing.join(", ") || "none"
  }. Invalid: ${evidenceShape.invalid.join(", ") || "none"}.`;

  if (requireProviderBacked) {
    expect(evidenceShape.valid, evidenceShapeMessage);
    return;
  }

  warn(evidenceShape.valid, evidenceShapeMessage);
}

function validateExplicitSmokeFields(artifact) {
  const missing = [];
  const invalid = [];
  const requireField = (container, fieldPath, fieldName, validator) => {
    if (!container || !(fieldName in container) || container[fieldName] === undefined || container[fieldName] === null) {
      missing.push(fieldPath);
    } else if (!validator(container[fieldName])) {
      invalid.push(fieldPath);
    }
  };
  const requireHealthField = (fieldName, validator) =>
    requireField(artifact.health, `health.${fieldName}`, fieldName, validator);
  const requireLaunchContractField = (fieldName, validator) =>
    requireField(artifact.launchContract, `launchContract.${fieldName}`, fieldName, validator);

  requireHealthField("defaultMaxCompletionTokens", (value) => Number.isInteger(value) && value >= 128 && value <= 1200);
  requireHealthField("defaultRequestTimeoutMs", (value) => Number.isInteger(value) && value >= 3000 && value <= 30000);
  requireHealthField("defaultRetryCount", (value) => Number.isInteger(value) && value >= 0 && value <= 2);
  requireHealthField("structuredOutputMode", (value) => value === "json_schema_strict");
  requireLaunchContractField("valid", (value) => value === true);
  requireLaunchContractField("strictStructuredOutputsPresent", (value) => value === true);

  for (const mode of ["guidance", "scene-query"]) {
    const lane = artifact.lanes?.[mode];
    const requireEnvelopeField = (fieldName, validator) =>
      requireField(lane?.requestEnvelope, `lanes.${mode}.requestEnvelope.${fieldName}`, fieldName, validator);
    const requireAnalyzeField = (fieldName, validator) =>
      requireField(lane?.analyze, `lanes.${mode}.analyze.${fieldName}`, fieldName, validator);

    requireEnvelopeField("frameSummary", isNonEmptyString);
    requireEnvelopeField("captureHeuristics", (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value));
    requireAnalyzeField("walkability", (value) => ["clear", "caution", "uncertain"].includes(value));
  }

  return { invalid, missing };
}

function validateNoScreenSmokeEvidence(artifact, options) {
  const {
    allowWarning,
    artifactPath,
    description,
    expectedApiBaseUrl,
    expectedApiEnvironment,
    expectedBackendSmokeArtifact,
    expectedBuildProfile,
    expectedCandidateBinarySha256,
    expectedCandidateIdentifier,
    expectedCandidateIpaSha256,
    expectedReleaseTrack,
    expectedSourceRevision,
    expectedInstallationSource,
    expectedParticipantRole,
    expectedValidationIpaSha256,
  } = options;

  if (!artifact) {
    const message = `${description} no-screen smoke evidence artifact is missing: ${path.relative(projectDir, artifactPath)}. Run the real-iPhone no-screen validation and write sanitized evidence before TestFlight.`;
    if (allowWarning) {
      warn(false, message);
      return;
    }
    expect(false, message);
    return;
  }

  const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
    expectedApiBaseUrl,
    expectedApiEnvironment,
    expectedAppVersion: launchInputs.iosMarketingVersion,
    expectedBackendSmokeArtifact,
    expectedBuildNumber: launchInputs.iosBuildNumber,
    expectedBuildProfile,
    expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
      ? undefined
      : launchInputs.iosBundleIdentifier,
    expectedCandidateBinarySha256,
    expectedCandidateIdentifier,
    expectedCandidateIpaSha256,
    expectedCandidateGeneratedAt: options.expectedCandidateGeneratedAt,
    expectedInstallationSource,
    expectedParticipantRole,
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedReleaseTrack,
    expectedSourceRevision,
    expectedVisionModel: launchInputs.productionVisionModel,
    expectedValidationIpaSha256,
    requireCandidateBinding: true,
  });
  const message = `${description} no-screen smoke evidence must be recent and bind the real-iPhone voice/haptics/audio/VoiceOver sequence to app ${launchInputs.iosMarketingVersion} (${launchInputs.iosBuildNumber}), release track ${expectedReleaseTrack}, the current Git source revision, the signed-config candidate identifier, the signed candidate binary SHA-256, the installed normalized validation-twin IPA SHA-256 for pre-upload runs, the Store IPA SHA-256 for TestFlight installs, and the exact candidate backend smoke provenance/request IDs without raw media, secrets, signed URLs, or full device identifiers. ${formatNoScreenSmokeEvidenceIssues(result)}`;

  if (allowWarning) {
    warn(result.valid, message);
    return;
  }

  expect(result.valid, message);
}

function validateNoScreenEvidenceSet(artifacts, options) {
  const result = validateNoScreenEvidenceProgression(artifacts, {
    expectedApiBaseUrl: options.expectedApiBaseUrl,
    expectedApiEnvironment: options.expectedApiEnvironment,
    expectedAppVersion: launchInputs.iosMarketingVersion,
    expectedBackendSmokeArtifact: options.expectedBackendSmokeArtifact,
    expectedBuildNumber: launchInputs.iosBuildNumber,
    expectedBuildProfile: options.expectedBuildProfile,
    expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
      ? undefined
      : launchInputs.iosBundleIdentifier,
    expectedCandidateBinarySha256: options.candidate?.archive?.binarySha256,
    expectedCandidateIdentifier:
      options.candidate?.release?.candidateBinding?.candidateIdentifier,
    expectedCandidateIpaSha256: options.candidate?.ipa?.sha256,
    expectedCandidateGeneratedAt: options.candidate?.generatedAt,
    expectedAppStoreConnectBuildEvidence:
      options.expectedAppStoreConnectBuildEvidence,
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedReleaseTrack: options.expectedReleaseTrack,
    expectedSourceRevision: options.expectedSourceRevision,
    expectedVisionModel: launchInputs.productionVisionModel,
    expectedValidationIpaSha256: options.candidate?.validationIpa?.sha256,
    requireCandidateBinding: true,
    requireTestflightRepeat: options.requireTestflightRepeat,
  });
  const requiredPaths = [
    NO_SCREEN_SMOKE_ARTIFACT_PATHS.internal,
    NO_SCREEN_SMOKE_ARTIFACT_PATHS.blindParticipant,
    ...(options.requireTestflightRepeat
      ? [NO_SCREEN_SMOKE_ARTIFACT_PATHS.testflight]
      : []),
  ];
  expect(
    result.valid,
    `${options.description} no-screen evidence progression must use separate sanitized v3 artifacts (${requiredPaths.join(", ")}), bind pre-upload runs to the installable normalized validation twin and the later TestFlight repeat to the Store IPA, keep per-step event IDs unique, bind STOP sensory outcomes to each path's STOP event, keep the pre-upload internal and blind-participant operators distinct, and complete the TestFlight-installed blind repeat before Store submission. Invalid: ${result.errors.join(", ") || "none"}.`,
  );
}

function validatePublicSupportPageForStore() {
  const supportHtml = readTextFileAbsolute(supportPagePath);
  if (!supportHtml) {
    return;
  }

  const lowerSupportHtml = supportHtml.toLowerCase();
  for (const phrase of ["launch rehearsal", "before submitting", "todo_", "finalized during launch"]) {
    expect(
      !lowerSupportHtml.includes(phrase),
      `Public support page must not contain launch-internal placeholder phrase "${phrase}".`,
    );
  }

  if (isPlaceholderValue(launchInputs.supportEmail)) {
    expect(false, "Public support page cannot be App Store-ready until support email is resolved.");
    return;
  }

  expect(
    supportHtml.includes(launchInputs.supportEmail),
    "Public support page must include the configured support email from launch-inputs.js.",
  );
}

const publicPageResponseLimitBytes = 1024 * 1024;
const publicPageTimeoutMs = 10_000;
const launchInternalPublicPagePhrases = [
  "launch rehearsal",
  "before submitting",
  "todo_",
  "finalized during launch",
];

function formatPublicUrlForOutput(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "configured URL";
  }
}

function isSafeHttpsPublicUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function getLivePublicPageSpecs() {
  return [
    {
      forbiddenMarkers: [...launchInternalPublicPagePhrases, "does not request microphone"],
      label: "homepage",
      requiredMarkers: [
        "blind and low-vision users",
        "optional hands-free voice commands",
        "contains no crash-reporting sdk",
      ],
      url: publicUrls.websiteUrl,
    },
    {
      forbiddenMarkers: [...launchInternalPublicPagePhrases, "does not request microphone"],
      label: "privacy policy",
      requiredMarkers: [
        "guide pup privacy policy",
        "voice and apple speech",
        "guide pup does not collect or retain raw voice audio",
        "sender's name, email address, message",
        "support emails may remain in the support mailbox as needed to answer and manage the request",
        "cloudflare observability",
        "openai",
        launchInputs.supportEmail,
      ],
      url: publicUrls.privacyPolicyUrl,
    },
    {
      forbiddenMarkers: launchInternalPublicPagePhrases,
      label: "support",
      requiredMarkers: [
        "support - guide pup",
        "camera permission",
        "emergency services",
        "the support mailbox may retain that information as needed to respond to and manage your request",
        launchInputs.supportEmail,
      ],
      url: publicUrls.supportUrl,
    },
    {
      forbiddenMarkers: launchInternalPublicPagePhrases,
      label: "safety",
      requiredMarkers: [
        "not guaranteed hazard detection or emergency response",
        "when stop appears",
        "emergency guidance",
      ],
      url: publicUrls.safetyUrl,
    },
  ];
}

async function inspectLivePublicPage(spec, fetchImpl) {
  const issues = [];
  const outputUrl = formatPublicUrlForOutput(spec.url);
  if (!isSafeHttpsPublicUrl(spec.url)) {
    return { issues: [`Live ${spec.label} URL must be HTTPS without embedded credentials: ${outputUrl}.`], spec };
  }
  if (typeof fetchImpl !== "function") {
    return { issues: [`Live ${spec.label} could not be checked because fetch is unavailable.`], spec };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), publicPageTimeoutMs);
  timeout.unref?.();
  try {
    const response = await fetchImpl(spec.url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "GuidePup-Release-Preflight/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response || response.ok !== true || !Number.isInteger(response.status)) {
      issues.push(`Live ${spec.label} must return a successful HTTP response; ${outputUrl} returned status ${response?.status ?? "unavailable"}.`);
      return { issues, spec };
    }
    if (!isSafeHttpsPublicUrl(response.url || spec.url)) {
      issues.push(`Live ${spec.label} must remain on HTTPS after redirects: ${outputUrl}.`);
      return { issues, spec };
    }

    const body = await response.text();
    if (typeof body !== "string" || Buffer.byteLength(body, "utf8") > publicPageResponseLimitBytes) {
      issues.push(`Live ${spec.label} response must be text no larger than ${publicPageResponseLimitBytes} bytes.`);
      return { issues, spec };
    }
    const normalizedBody = body.toLowerCase().replace(/\s+/g, " ");
    for (const marker of spec.requiredMarkers) {
      if (!isNonEmptyString(marker) || !normalizedBody.includes(marker.toLowerCase())) {
        issues.push(`Live ${spec.label} is missing required current marker "${marker || "configured support email"}".`);
      }
    }
    for (const marker of spec.forbiddenMarkers) {
      if (normalizedBody.includes(marker)) {
        issues.push(`Live ${spec.label} still contains stale or launch-internal marker "${marker}".`);
      }
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError" ? "timed out" : "could not be fetched";
    issues.push(`Live ${spec.label} ${reason}: ${outputUrl}.`);
  } finally {
    clearTimeout(timeout);
  }

  return { issues, spec };
}

async function validateLivePublicPagesForStore(fetchImpl = globalThis.fetch) {
  const results = await Promise.all(
    getLivePublicPageSpecs().map((spec) => inspectLivePublicPage(spec, fetchImpl)),
  );
  for (const result of results) {
    for (const issue of result.issues) {
      expect(false, issue);
    }
  }
}

function validateAppReviewMetadataForStore() {
  const metadataConfig = loadMetadataConfig();
  if (!metadataConfig || typeof metadataConfig !== "object" || Array.isArray(metadataConfig)) {
    expect(false, `Metadata config must export an object for App Store review metadata: ${launchInputs.metadataPath}.`);
    return;
  }

  const review = metadataConfig.apple?.review;
  expect(Boolean(review), "App Store metadata must include apple.review App Review Information.");
  if (!review) {
    return;
  }

  compare(review.firstName, launchInputs.appReviewFirstName, "App Review first name");
  compare(review.lastName, launchInputs.appReviewLastName, "App Review last name");
  compare(review.email, launchInputs.appReviewEmail, "App Review email");
  compare(review.phone, launchInputs.appReviewPhone, "App Review phone");
  if (!isPlaceholderValue(review.email)) {
    expect(isLikelyEmail(review.email), "App Review email must be a valid email address.");
  }
  if (!isPlaceholderValue(review.phone)) {
    expect(isLikelyInternationalPhone(review.phone), "App Review phone must include a country code, for example +1 555 010 1234.");
  }
  compare(review.demoRequired, false, "App Review sign-in required / demoRequired");
  compare(launchInputs.appReviewDemoRequired, false, "Launch input appReviewDemoRequired");
  expect(
    !("demoUsername" in review) && !("demoPassword" in review),
    "App Review metadata must not include demo credentials because Guide Pup has no account sign-in flow.",
  );
  expect(
    isNonEmptyString(review.notes) && review.notes === launchInputs.appReviewNotes,
    "App Review notes must come from launch-inputs.js.",
  );
  expect(
    typeof review.notes === "string" && review.notes.toLowerCase().includes("does not require account sign-in"),
    "App Review notes must clearly state that Guide Pup does not require account sign-in.",
  );
}

function validateIosPrivacySurface() {
  const infoPlistXml = readTextFileAbsolute(iosInfoPlistPath);
  const privacyManifestXml = readTextFileAbsolute(iosPrivacyManifestPath);

  expect(Boolean(infoPlistXml), "Native iOS Info.plist is missing: ios/GuidePupVisionAssistant/Info.plist.");
  expect(Boolean(privacyManifestXml), "iOS privacy manifest is missing: ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy.");

  if (infoPlistXml) {
    for (const permissionKey of [
      "NSLocationAlwaysAndWhenInUseUsageDescription",
      "NSLocationAlwaysUsageDescription",
      "NSLocationWhenInUseUsageDescription",
      "NSPhotoLibraryUsageDescription",
    ]) {
      expect(
        !infoPlistXml.includes(`<key>${permissionKey}</key>`),
        `Native iOS Info.plist must not include unused ${permissionKey} permission copy for this shipping path.`,
      );
    }
  }

  if (!privacyManifestXml) {
    return;
  }

  let privacyManifest;
  try {
    privacyManifest = plist.parse(privacyManifestXml);
  } catch (error) {
    expect(false, `iOS privacy manifest could not be parsed: ${error instanceof Error ? error.message : String(error)}.`);
    return;
  }

  compare(privacyManifest.NSPrivacyTracking, false, "iOS privacy manifest top-level tracking");

  const collectedData = privacyManifest.NSPrivacyCollectedDataTypes;
  expect(Array.isArray(collectedData), "iOS privacy manifest NSPrivacyCollectedDataTypes must be an array.");
  if (!Array.isArray(collectedData)) {
    return;
  }

  const appFunctionality = "NSPrivacyCollectedDataTypePurposeAppFunctionality";
  const analytics = "NSPrivacyCollectedDataTypePurposeAnalytics";
  const expectedCollectedData = new Map([
    ["NSPrivacyCollectedDataTypePhotosorVideos", { linked: true, purposes: [appFunctionality] }],
    ["NSPrivacyCollectedDataTypeEnvironmentScanning", { linked: true, purposes: [appFunctionality, analytics] }],
    ["NSPrivacyCollectedDataTypeName", { linked: true, purposes: [appFunctionality] }],
    ["NSPrivacyCollectedDataTypeEmailAddress", { linked: true, purposes: [appFunctionality] }],
    ["NSPrivacyCollectedDataTypeCustomerSupport", { linked: true, purposes: [appFunctionality] }],
    ["NSPrivacyCollectedDataTypeDeviceID", { linked: true, purposes: [appFunctionality] }],
    ["NSPrivacyCollectedDataTypeProductInteraction", { linked: true, purposes: [appFunctionality, analytics] }],
    ["NSPrivacyCollectedDataTypePerformanceData", { linked: true, purposes: [appFunctionality, analytics] }],
    ["NSPrivacyCollectedDataTypeOtherDiagnosticData", { linked: true, purposes: [appFunctionality, analytics] }],
  ]);
  const entriesByType = new Map();

  for (const entry of collectedData) {
    const dataType = entry?.NSPrivacyCollectedDataType;
    expect(isNonEmptyString(dataType), "Every iOS privacy manifest collected-data entry must declare its data type.");
    if (!isNonEmptyString(dataType)) {
      continue;
    }
    expect(!entriesByType.has(dataType), `iOS privacy manifest must not duplicate ${dataType}.`);
    if (!entriesByType.has(dataType)) {
      entriesByType.set(dataType, entry);
    }
  }

  expect(
    entriesByType.size === expectedCollectedData.size,
    `iOS privacy manifest must contain exactly ${expectedCollectedData.size} collected-data types, found ${entriesByType.size}.`,
  );
  for (const dataType of entriesByType.keys()) {
    expect(expectedCollectedData.has(dataType), `iOS privacy manifest has unexpected collected-data type ${dataType}.`);
  }

  for (const [dataType, expected] of expectedCollectedData) {
    const entry = entriesByType.get(dataType);
    expect(Boolean(entry), `iOS privacy manifest must disclose ${dataType}.`);
    if (!entry) {
      continue;
    }

    compare(entry.NSPrivacyCollectedDataTypeLinked, expected.linked, `iOS privacy manifest ${dataType} linked flag`);
    compare(entry.NSPrivacyCollectedDataTypeTracking, false, `iOS privacy manifest ${dataType} tracking flag`);

    const purposes = entry.NSPrivacyCollectedDataTypePurposes;
    expect(Array.isArray(purposes), `iOS privacy manifest ${dataType} purposes must be an array.`);
    if (!Array.isArray(purposes)) {
      continue;
    }
    const uniquePurposes = new Set(purposes);
    expect(uniquePurposes.size === purposes.length, `iOS privacy manifest ${dataType} purposes must not contain duplicates.`);
    expect(
      uniquePurposes.size === expected.purposes.length && expected.purposes.every((purpose) => uniquePurposes.has(purpose)),
      `iOS privacy manifest ${dataType} purposes must be exactly: ${expected.purposes.join(", ")}.`,
    );
  }
}

const argv = process.argv.slice(2);
const selectedTrack = parseTrack(argv);
if (!validTracks.has(selectedTrack)) {
  console.error(`Unsupported --track value "${selectedTrack}". Use preview, testflight, store, or all.`);
  process.exit(1);
}
const strictPreviewProvider = hasFlag(argv, "--strict-preview-provider");
const releaseArchivePathValue = parseOptionValue(argv, "--archive");
const releaseIpaPathValue = parseOptionValue(argv, "--ipa");
const releaseValidationIpaPathValue =
  parseOptionValue(argv, "--validation-ipa");

const isAllTracks = selectedTrack === "all";
const requiresPreview = selectedTrack === "preview" || isAllTracks;
const requiresTestflight = selectedTrack === "testflight" || isAllTracks;
const requiresStore = selectedTrack === "store" || isAllTracks;
const requiresStoreBackedDistribution = selectedTrack === "testflight" || selectedTrack === "store" || isAllTracks;
const requiresIos = requiresPreview || requiresStoreBackedDistribution;
const stagingSmokeArtifact = readSmokeArtifact(stagingSmokeArtifactPath);
const productionSmokeArtifact = readSmokeArtifact(productionSmokeArtifactPath);
const noScreenSmokeArtifacts = Object.fromEntries(
  Object.entries(NO_SCREEN_SMOKE_ARTIFACT_PATHS).map(([key, relativePath]) => [
    key,
    readNoScreenSmokeEvidenceArtifact(projectDir, relativePath),
  ]),
);
const releaseCandidateArtifact = readSmokeArtifact(releaseCandidateArtifactPath);
const iosSubmissionArtifact = readSmokeArtifact(iosSubmissionArtifactPath);
const currentSourceRevision = readCurrentGitSourceRevision();
let validatedReleaseCandidateArtifact;
let appStoreConnectBuildEvidence;

if (requiresStoreBackedDistribution) {
  expect(
    Boolean(releaseArchivePathValue),
    "Store-backed preflight requires --archive pointing to the exact signed .xcarchive.",
  );
  expect(
    Boolean(releaseIpaPathValue),
    "Store-backed preflight requires --ipa pointing to the exact exported IPA.",
  );
  expect(
    Boolean(releaseValidationIpaPathValue),
    "Store-backed preflight requires --validation-ipa pointing to the separately exported device-installable validation twin.",
  );
  validateReleaseSourceState(currentSourceRevision);
  validatedReleaseCandidateArtifact = validateReleaseCandidateArtifact(
    releaseCandidateArtifact,
    currentSourceRevision,
  );
  validatedReleaseCandidateArtifact = await reinspectReleaseCandidateArtifact(
    validatedReleaseCandidateArtifact,
    currentSourceRevision,
    releaseArchivePathValue
      ? path.resolve(projectDir, releaseArchivePathValue)
      : undefined,
    releaseIpaPathValue
      ? path.resolve(projectDir, releaseIpaPathValue)
      : undefined,
    releaseValidationIpaPathValue
      ? path.resolve(projectDir, releaseValidationIpaPathValue)
      : undefined,
  );
  const candidateBuildProfile = validatedReleaseCandidateArtifact?.release?.buildProfile;
  const candidateRuntimeTrack = validatedReleaseCandidateArtifact?.release?.runtimeTrack;
  if (requiresStore) {
    expect(
      candidateBuildProfile === "store" && candidateRuntimeTrack === "app-store",
      `Store preflight requires an app-store candidate normalized to store evidence, found runtime track "${candidateRuntimeTrack ?? "missing"}" and build profile "${candidateBuildProfile ?? "missing"}".`,
    );
  } else if (requiresTestflight) {
    expect(
      candidateBuildProfile === "testflight" || candidateBuildProfile === "store",
      `TestFlight preflight requires a testflight or app-store candidate, found build profile "${candidateBuildProfile ?? "missing"}".`,
    );
  }
}

if (requiresStore) {
  try {
    const appStoreConnectApiToken =
      resolveAppStoreConnectApiToken();
    appStoreConnectBuildEvidence =
      await fetchAppStoreConnectBuildEvidence({
        appId: launchInputs.ascAppId,
        buildNumber: launchInputs.iosBuildNumber,
        marketingVersion: launchInputs.iosMarketingVersion,
        token: appStoreConnectApiToken,
      });
  } catch (error) {
    expect(
      false,
      `Authenticated App Store Connect build verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  validateIosSubmissionForStore(
    iosSubmissionArtifact,
    validatedReleaseCandidateArtifact,
    appStoreConnectBuildEvidence,
  );
}

if (requiresIos) {
  checkPlaceholder(launchInputs.iosBundleIdentifier, "iOS bundle identifier");
  compare(appJson.expo.ios?.bundleIdentifier, launchInputs.iosBundleIdentifier, "app.json iOS bundle identifier");
}

if (requiresPreview) {
  checkPlaceholder(launchInputs.stagingApiBaseUrl, "Preview / staging API base URL");
}

if (requiresStoreBackedDistribution) {
  checkPlaceholder(launchInputs.appleTeamId, "Apple Team ID");
  checkPlaceholder(launchInputs.ascAppId, "App Store Connect app ID");
  checkPlaceholder(launchInputs.copyright, "Store copyright");
  checkPlaceholder(launchInputs.productionApiBaseUrl, "Production API base URL");
  checkPlaceholder(launchInputs.supportEmail, "Support email");
  checkPlaceholder(launchInputs.emergencyDisclaimer, "Emergency / safety disclaimer");
  checkPlaceholder(launchInputs.appReviewFirstName, "App Review first name");
  checkPlaceholder(launchInputs.appReviewLastName, "App Review last name");
  checkPlaceholder(launchInputs.appReviewEmail, "App Review email");
  checkPlaceholder(launchInputs.appReviewPhone, "App Review phone");
}

expect(Boolean(publicUrls.websiteUrl), "Website URL is unresolved.");
expect(Boolean(publicUrls.privacyPolicyUrl), "Privacy policy URL is unresolved.");
expect(Boolean(publicUrls.supportUrl), "Support URL is unresolved.");
expect(Boolean(publicUrls.safetyUrl), "Safety URL is unresolved.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/privacy/index.html")), "Public privacy page is missing: site/privacy/index.html.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/support/index.html")), "Public support page is missing: site/support/index.html.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/safety/index.html")), "Public safety page is missing: site/safety/index.html.");

if (requiresStoreBackedDistribution) {
  compare(launchInputs.supportEmail, "charliehan112@gmail.com", "Launch support email");
  validatePublicSupportPageForStore();
  validateAppReviewMetadataForStore();
  await validateLivePublicPagesForStore();
  warn(
    false,
    "External gate not verified by this local preflight: App Store screenshots and device-size coverage must be confirmed in App Store Connect.",
  );
  warn(
    false,
    "External gate not verified by this local preflight: the live App Store Connect build, metadata, agreements, compliance, and review state must be confirmed in Apple systems.",
  );
} else if (requiresPreview) {
  warn(
    false,
    "Preview does not launch-gate live public-page content; TestFlight/store preflight fetches and validates the configured HTTPS pages.",
  );
}

compare(appJson.expo.name, launchInputs.appName, "App name");
compare(appJson.expo.slug, launchInputs.slug, "App slug");
compare(appJson.expo.scheme, launchInputs.scheme, "App scheme");

const iosInfoPlist = appJson.expo.ios?.infoPlist || {};
expect(isNonEmptyString(iosInfoPlist.NSCameraUsageDescription), "iOS camera permission copy is missing.");
expect(isNonEmptyString(iosInfoPlist.NSMicrophoneUsageDescription), "iOS microphone permission copy is missing.");
expect(isNonEmptyString(iosInfoPlist.NSSpeechRecognitionUsageDescription), "iOS speech-recognition permission copy is missing.");
if (requiresIos) {
  validateIosPrivacySurface();
  validateIosVersionOwnership();
  validateDirectXcodeLaunchEnvironment();
}

const previewProfile = easJson.build?.preview;
const testflightProfile = easJson.build?.testflight;
const storeProfile = easJson.build?.store;

if (requiresIos) {
  expect(
    easJson.cli?.requireCommit === true,
    "EAS CLI must require a committed source snapshot for iOS builds.",
  );
}

if (requiresPreview) {
  expect(Boolean(previewProfile), "Missing build.preview profile.");
}

if (requiresTestflight) {
  expect(Boolean(testflightProfile), "Missing build.testflight profile.");
}

if (requiresStore) {
  expect(Boolean(storeProfile), "Missing build.store profile.");
}

validateSentryLaunchDecision({
  previewProfile,
  storeProfile,
  testflightProfile,
});

if (previewProfile && requiresPreview) {
  compare(previewProfile.distribution, "internal", "preview distribution");
  compare(previewProfile.autoIncrement, false, "preview autoIncrement");
  compare(previewProfile.env?.EXPO_PUBLIC_API_BASE_URL, launchInputs.stagingApiBaseUrl, "preview API base URL");
  compare(previewProfile.env?.EXPO_PUBLIC_RELEASE_TRACK, "internal-preview", "preview release track");
  compare(previewProfile.env?.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS, "false", "preview experimental tabs flag");
  compare(previewProfile.env?.EXPO_PUBLIC_WEBSITE_URL, publicUrls.websiteUrl, "preview website URL");
  compare(previewProfile.env?.EXPO_PUBLIC_PRIVACY_POLICY_URL, publicUrls.privacyPolicyUrl, "preview privacy policy URL");
  compare(previewProfile.env?.EXPO_PUBLIC_SUPPORT_URL, publicUrls.supportUrl, "preview support URL");
  compare(previewProfile.env?.EXPO_PUBLIC_SUPPORT_EMAIL, launchInputs.supportEmail, "preview support email");
  compare(previewProfile.env?.EXPO_PUBLIC_EMERGENCY_DISCLAIMER, launchInputs.emergencyDisclaimer, "preview emergency disclaimer");
}

if (requiresPreview) {
  validateSmokeArtifact(stagingSmokeArtifact, {
    allowWarning: !strictPreviewProvider,
    description: "Preview / staging",
    expectedEnvironment: "staging",
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedVisionModel: launchInputs.productionVisionModel,
    filePath: stagingSmokeArtifactPath,
    requireProviderBacked: strictPreviewProvider,
    targetUrl: launchInputs.stagingApiBaseUrl,
  });
  if (!isAllTracks) {
    validateNoScreenSmokeEvidence(noScreenSmokeArtifacts.internal, {
      allowWarning: true,
      artifactPath: noScreenSmokeArtifactPaths.internal,
      description: "Preview / staging",
      expectedApiBaseUrl: launchInputs.stagingApiBaseUrl,
      expectedApiEnvironment: "staging",
      expectedBackendSmokeArtifact: stagingSmokeArtifact,
      expectedBuildProfile: "preview",
      expectedInstallationSource: "ad-hoc",
      expectedParticipantRole: "internal-tester",
      expectedReleaseTrack: "preview",
      expectedSourceRevision: currentSourceRevision,
    });
  }
}

for (const [profileName, profile] of Object.entries({ testflight: testflightProfile, store: storeProfile })) {
  const shouldCheckProfile = profileName === "testflight" ? requiresTestflight : requiresStore;
  if (!profile) {
    continue;
  }
  if (!shouldCheckProfile) {
    continue;
  }

  compare(profile.distribution, "store", `${profileName} distribution`);
  compare(profile.autoIncrement, false, `${profileName} autoIncrement`);
  compare(profile.env?.EXPO_PUBLIC_APP_ENV, "production", `${profileName} app env`);
  compare(profile.env?.EXPO_PUBLIC_API_BASE_URL, launchInputs.productionApiBaseUrl, `${profileName} API base URL`);
  compare(profile.env?.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS, "false", `${profileName} experimental tabs flag`);
  compare(profile.env?.EXPO_PUBLIC_WEBSITE_URL, publicUrls.websiteUrl, `${profileName} website URL`);
  compare(profile.env?.EXPO_PUBLIC_PRIVACY_POLICY_URL, publicUrls.privacyPolicyUrl, `${profileName} privacy policy URL`);
  compare(profile.env?.EXPO_PUBLIC_SUPPORT_URL, publicUrls.supportUrl, `${profileName} support URL`);
  compare(profile.env?.EXPO_PUBLIC_SUPPORT_EMAIL, launchInputs.supportEmail, `${profileName} support email`);
  compare(profile.env?.EXPO_PUBLIC_EMERGENCY_DISCLAIMER, launchInputs.emergencyDisclaimer, `${profileName} emergency disclaimer`);
  expect(
    profile.ios?.image === launchInputs.storeBuildImage,
    `${profileName} iOS image must be "${launchInputs.storeBuildImage}" for App Store uploads.`,
  );
}

if (requiresStoreBackedDistribution) {
  compare(testflightProfile?.channel, "testflight", "testflight update channel");
  compare(storeProfile?.channel, "production", "store update channel");
  compare(testflightProfile?.env?.EXPO_PUBLIC_RELEASE_TRACK, "testflight", "testflight release track");
  compare(storeProfile?.env?.EXPO_PUBLIC_RELEASE_TRACK, "app-store", "store release track");
  validateSmokeArtifact(productionSmokeArtifact, {
    allowWarning: false,
    description: "Production",
    expectedEnvironment: "production",
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedVisionModel: launchInputs.productionVisionModel,
    filePath: productionSmokeArtifactPath,
    requireProviderBacked: true,
    targetUrl: launchInputs.productionApiBaseUrl,
  });
  const candidateEvidenceTrack = validatedReleaseCandidateArtifact?.release?.evidenceTrack;
  const candidateBuildProfile = validatedReleaseCandidateArtifact?.release?.buildProfile;
  validateNoScreenEvidenceSet(noScreenSmokeArtifacts, {
    expectedAppStoreConnectBuildEvidence: appStoreConnectBuildEvidence,
    candidate: validatedReleaseCandidateArtifact,
    description: "Production",
    expectedApiBaseUrl: launchInputs.productionApiBaseUrl,
    expectedApiEnvironment: "production",
    expectedBackendSmokeArtifact: productionSmokeArtifact,
    expectedBuildProfile: candidateBuildProfile,
    expectedReleaseTrack: candidateEvidenceTrack,
    expectedSourceRevision: currentSourceRevision,
    requireTestflightRepeat: requiresStore,
  });
}

const submitTestflight = easJson.submit?.testflight;
const submitStore = easJson.submit?.store;

if (requiresTestflight) {
  expect(Boolean(submitTestflight), "Missing submit.testflight profile.");
}

if (requiresStore) {
  expect(Boolean(submitStore), "Missing submit.store profile.");
}

for (const [profileName, profile] of Object.entries({ testflight: submitTestflight, store: submitStore })) {
  const shouldCheckProfile = profileName === "testflight" ? requiresTestflight : requiresStore;
  if (!profile) {
    continue;
  }
  if (!shouldCheckProfile) {
    continue;
  }

  compare(profile.metadataPath, launchInputs.metadataPath, `${profileName} metadataPath`);
  compare(profile.ios?.appleTeamId, launchInputs.appleTeamId, `${profileName} Apple Team ID`);
  compare(profile.ios?.ascAppId, launchInputs.ascAppId, `${profileName} App Store Connect app ID`);
}

expect(fileExists(launchInputs.metadataPath), `Metadata config file is missing: ${launchInputs.metadataPath}`);
expect(fileExists("docs/launch-inputs.md"), "docs/launch-inputs.md is missing.");
expect(fileExists("docs/privacy-answer-matrix.md"), "docs/privacy-answer-matrix.md is missing.");
expect(fileExists("docs/fill-these-now.md"), "docs/fill-these-now.md is missing.");
expect(fileExists("docs/no-screen-smoke-evidence.md"), "docs/no-screen-smoke-evidence.md is missing.");

const envExample = fs.readFileSync(path.join(projectDir, ".env.example"), "utf8");
for (const requiredEnv of [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_RELEASE_TRACK",
  "EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS",
]) {
  expect(envExample.includes(`${requiredEnv}=`), `.env.example is missing ${requiredEnv}.`);
}

if (errors.length > 0 || warnings.length > 0) {
  console.log(`Guide Pup release preflight (track: ${selectedTrack})`);
  console.log("");
}

if (errors.length > 0) {
  console.log("Errors:");
  for (const error of errors) {
    console.log(`- ${error}`);
  }
  console.log("");
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
  console.log("");
}

if (errors.length > 0) {
  process.exit(1);
}

if (requiresStoreBackedDistribution) {
  console.log(
    `Local release preflight checks passed for ${selectedTrack}; screenshots and live App Store Connect/TestFlight state remain external gates.`,
  );
} else {
  console.log(`Local release preflight checks passed for ${selectedTrack}.`);
}
