import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { validateEvidencePrivacy } from "./evidence-privacy.mjs";
import {
  formatNoScreenSmokeEvidenceIssues,
  NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH,
  readNoScreenSmokeEvidenceArtifact,
  validateNoScreenSmokeEvidenceArtifact,
} from "./no-screen-smoke-evidence.mjs";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const publicUrls = getPublicUrls();
const validTracks = new Set(["preview", "testflight", "store", "all"]);
const stagingSmokeArtifactPath = path.resolve(projectDir, "../backend/guidepup-api/eval/smoke-results-staging.latest.json");
const productionSmokeArtifactPath = path.resolve(projectDir, "../backend/guidepup-api/eval/smoke-results-production.latest.json");
const noScreenSmokeArtifactPath = path.resolve(projectDir, NO_SCREEN_SMOKE_ARTIFACT_RELATIVE_PATH);

const errors = [];
const warnings = [];

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

function readSmokeArtifact(filePath) {
  if (!fileExistsAbsolute(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function modelMatchesExpected(value, expected) {
  return typeof value === "string" && (value === expected || value.startsWith(`${expected}-`));
}

function validateSmokeEvidenceShape(artifact) {
  const missing = [];
  const invalid = [];
  const launchContract =
    artifact?.launchContract && typeof artifact.launchContract === "object" && !Array.isArray(artifact.launchContract)
      ? artifact.launchContract
      : undefined;
  const envelope =
    artifact?.requestEnvelope && typeof artifact.requestEnvelope === "object" && !Array.isArray(artifact.requestEnvelope)
      ? artifact.requestEnvelope
      : undefined;
  const analyze =
    artifact?.analyze && typeof artifact.analyze === "object" && !Array.isArray(artifact.analyze)
      ? artifact.analyze
      : undefined;
  const health =
    artifact?.health && typeof artifact.health === "object" && !Array.isArray(artifact.health)
      ? artifact.health
      : undefined;

  const requireEnvelopeField = (fieldName, validator) => {
    if (!envelope || !(fieldName in envelope) || envelope[fieldName] === undefined || envelope[fieldName] === null) {
      missing.push(`requestEnvelope.${fieldName}`);
      return;
    }

    if (!validator(envelope[fieldName])) {
      invalid.push(`requestEnvelope.${fieldName}`);
    }
  };

  const requireAnalyzeField = (fieldName, validator) => {
    if (!analyze || !(fieldName in analyze) || analyze[fieldName] === undefined || analyze[fieldName] === null) {
      missing.push(`analyze.${fieldName}`);
      return;
    }

    if (!validator(analyze[fieldName])) {
      invalid.push(`analyze.${fieldName}`);
    }
  };

  const requireHealthField = (fieldName, validator) => {
    if (!health || !(fieldName in health) || health[fieldName] === undefined || health[fieldName] === null) {
      missing.push(`health.${fieldName}`);
      return;
    }

    if (!validator(health[fieldName])) {
      invalid.push(`health.${fieldName}`);
    }
  };

  const requireLaunchContractField = (fieldName, validator) => {
    if (!launchContract || !(fieldName in launchContract) || launchContract[fieldName] === undefined || launchContract[fieldName] === null) {
      missing.push(`launchContract.${fieldName}`);
      return;
    }

    if (!validator(launchContract[fieldName])) {
      invalid.push(`launchContract.${fieldName}`);
    }
  };

  const isCaptureHeuristics = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    return (
      ["uri", "base64", "unknown"].includes(value.imageSource) &&
      typeof value.resizedForUpload === "boolean" &&
      Number.isInteger(value.uploadedHeight) &&
      value.uploadedHeight > 0 &&
      Number.isInteger(value.uploadedWidth) &&
      value.uploadedWidth > 0 &&
      typeof value.frameAgeMs === "number" &&
      Number.isFinite(value.frameAgeMs) &&
      value.frameAgeMs >= 0
    );
  };

  requireEnvelopeField("sampledFrame", (value) => value === true);
  requireEnvelopeField("hasImage", (value) => value === true);
  requireEnvelopeField("appVersion", isNonEmptyString);
  requireEnvelopeField("captureHeuristics", isCaptureHeuristics);
  requireEnvelopeField("sessionId", isNonEmptyString);
  requireEnvelopeField("frameId", isNonEmptyString);
  requireEnvelopeField("frameSummary", isNonEmptyString);
  requireEnvelopeField("timestampMs", (value) => Number.isInteger(value) && value > 0);
  requireEnvelopeField("nativePath", (value) => value === "native-core" || value === "js-fallback");
  requireEnvelopeField("platform", (value) => ["ios", "android", "web", "unknown"].includes(value));
  requireEnvelopeField("priorGuidance", isNonEmptyString);
  requireEnvelopeField("detail", (value) => value === "low" || value === "high");
  requireEnvelopeField("sourceHeight", (value) => Number.isInteger(value) && value > 0);
  requireEnvelopeField("sourceWidth", (value) => Number.isInteger(value) && value > 0);

  requireHealthField("defaultMaxCompletionTokens", (value) => Number.isInteger(value) && value >= 128 && value <= 1200);
  requireHealthField("defaultRequestTimeoutMs", (value) => Number.isInteger(value) && value >= 3000 && value <= 30000);
  requireHealthField("defaultRetryCount", (value) => Number.isInteger(value) && value >= 0 && value <= 2);
  requireHealthField("defaultRetryDelayMs", (value) => Number.isInteger(value) && value >= 0 && value <= 2000);

  requireAnalyzeField("structuredOutputValid", (value) => value === true);
  requireAnalyzeField("confidence", (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
  requireAnalyzeField("direction", (value) => ["turn-left", "turn-right", "forward", "stop"].includes(value));
  requireAnalyzeField("hazardLevel", (value) => ["none", "low", "medium", "high"].includes(value));
  requireAnalyzeField("lighting", (value) => ["dark", "dim", "normal", "bright", "unknown"].includes(value));
  requireAnalyzeField("message", isNonEmptyString);
  requireAnalyzeField("model", isNonEmptyString);
  requireAnalyzeField("obstacle", (value) => typeof value === "boolean");
  requireAnalyzeField("promptVersion", isNonEmptyString);
  requireAnalyzeField("provider", isNonEmptyString);
  requireAnalyzeField("sceneDescription", isNonEmptyString);
  requireAnalyzeField("surfaceType", isNonEmptyString);
  requireAnalyzeField("walkability", (value) => ["clear", "caution", "uncertain"].includes(value));

  requireLaunchContractField("runtimeControlsPresent", (value) => value === true);
  requireLaunchContractField("sampledFrameEnvelopeValid", (value) => value === true);
  requireLaunchContractField("structuredOutputValid", (value) => value === true);
  requireLaunchContractField("valid", (value) => value === true);

  if (!analyze || !("fallbackReason" in analyze)) {
    missing.push("analyze.fallbackReason");
  } else if (analyze.fallbackReason !== null && analyze.fallbackReason !== undefined && !isNonEmptyString(analyze.fallbackReason)) {
    invalid.push("analyze.fallbackReason");
  }

  if (Array.isArray(analyze?.structuredOutputMissingFields) && analyze.structuredOutputMissingFields.length > 0) {
    invalid.push(`analyze.structuredOutputMissingFields:${analyze.structuredOutputMissingFields.join(",")}`);
  }

  if (Array.isArray(analyze?.structuredOutputInvalidFields) && analyze.structuredOutputInvalidFields.length > 0) {
    invalid.push(`analyze.structuredOutputInvalidFields:${analyze.structuredOutputInvalidFields.join(",")}`);
  }

  const privacy = validateEvidencePrivacy(artifact);
  for (const fieldPath of privacy.disallowedKeys) {
    invalid.push(`disallowedKey:${fieldPath}`);
  }
  for (const pattern of privacy.sensitivePatterns) {
    invalid.push(`sensitivePattern:${pattern}`);
  }

  return {
    invalid,
    missing,
    valid: missing.length === 0 && invalid.length === 0,
  };
}

function validateSmokeArtifact(artifact, options) {
  const {
    allowWarning,
    description,
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
  expect(isNonEmptyString(artifact.analyze?.requestId), `${description} smoke artifact must include /v1/vision/analyze request ID.`);

  const modelMatches =
    !expectedVisionModel ||
    (
      modelMatchesExpected(artifact.health?.defaultModel, expectedVisionModel) &&
      modelMatchesExpected(artifact.analyze?.model, expectedVisionModel)
    );
  const promptMatches =
    !expectedPromptVersion ||
    (
      artifact.health?.promptVersion === expectedPromptVersion &&
      artifact.analyze?.promptVersion === expectedPromptVersion
    );
  const modelContractMessage = `${description} smoke artifact must use launch vision model "${expectedVisionModel}", found health "${artifact.health?.defaultModel ?? "missing"}" and analyze "${artifact.analyze?.model ?? "missing"}".`;
  const promptContractMessage = `${description} smoke artifact must use prompt version "${expectedPromptVersion}", found health "${artifact.health?.promptVersion ?? "missing"}" and analyze "${artifact.analyze?.promptVersion ?? "missing"}".`;
  const evidenceShape = validateSmokeEvidenceShape(artifact);
  const evidenceShapeMessage = `${description} smoke artifact must include launch contract, sampled-frame envelope, runtime controls, and structured analyze fields. Missing: ${
    evidenceShape.missing.join(", ") || "none"
  }. Invalid: ${evidenceShape.invalid.join(", ") || "none"}.`;

  if (requireProviderBacked) {
    expect(
      artifact.providerBacked === true && artifact.analyze?.executionPath === "provider-backed",
      `${description} smoke artifact must show provider-backed analyze. Current execution path is "${artifact.analyze?.executionPath ?? "missing"}"${artifact.analyze?.fallbackReason ? ` with fallback reason "${artifact.analyze.fallbackReason}"` : ""}.`,
    );
    expect(modelMatches, modelContractMessage);
    expect(promptMatches, promptContractMessage);
    expect(evidenceShape.valid, evidenceShapeMessage);
    return;
  }

  if (artifact.providerBacked !== true || artifact.analyze?.executionPath !== "provider-backed") {
    warn(
      false,
      `${description} smoke artifact shows "${artifact.analyze?.executionPath ?? "missing"}"${artifact.analyze?.fallbackReason ? ` with fallback reason "${artifact.analyze.fallbackReason}"` : ""}.`,
    );
  }

  warn(evidenceShape.valid, evidenceShapeMessage);
  warn(modelMatches, modelContractMessage);
  warn(promptMatches, promptContractMessage);
}

function validateNoScreenSmokeEvidence(artifact, options) {
  const {
    allowWarning,
    description,
    expectedApiBaseUrl,
  } = options;

  if (!artifact) {
    const message = `${description} no-screen smoke evidence artifact is missing: ${path.relative(projectDir, noScreenSmokeArtifactPath)}. Run the real-iPhone no-screen validation and write sanitized evidence before TestFlight.`;
    if (allowWarning) {
      warn(false, message);
      return;
    }
    expect(false, message);
    return;
  }

  const result = validateNoScreenSmokeEvidenceArtifact(artifact, {
    expectedApiBaseUrl,
    expectedBundleIdentifier: isPlaceholderValue(launchInputs.iosBundleIdentifier)
      ? undefined
      : launchInputs.iosBundleIdentifier,
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedVisionModel: launchInputs.productionVisionModel,
  });
  const message = `${description} no-screen smoke evidence must prove the real-iPhone voice/haptics/audio/VoiceOver sequence without raw media, secrets, signed URLs, or full device identifiers. ${formatNoScreenSmokeEvidenceIssues(result)}`;

  if (allowWarning) {
    warn(result.valid, message);
    return;
  }

  expect(result.valid, message);
}

const argv = process.argv.slice(2);
const selectedTrack = parseTrack(argv);
if (!validTracks.has(selectedTrack)) {
  console.error(`Unsupported --track value "${selectedTrack}". Use preview, testflight, store, or all.`);
  process.exit(1);
}
const strictPreviewProvider = hasFlag(argv, "--strict-preview-provider");

const isAllTracks = selectedTrack === "all";
const requiresPreview = selectedTrack === "preview" || isAllTracks;
const requiresTestflight = selectedTrack === "testflight" || isAllTracks;
const requiresStore = selectedTrack === "store" || isAllTracks;
const requiresStoreBackedDistribution = selectedTrack === "testflight" || selectedTrack === "store" || isAllTracks;
const requiresIos = requiresPreview || requiresStoreBackedDistribution;
const stagingSmokeArtifact = readSmokeArtifact(stagingSmokeArtifactPath);
const productionSmokeArtifact = readSmokeArtifact(productionSmokeArtifactPath);
const noScreenSmokeArtifact = readNoScreenSmokeEvidenceArtifact(projectDir);

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
}

if (isAllTracks) {
  checkPlaceholder(launchInputs.androidPackage, "Android package");
  compare(appJson.expo.android?.package, launchInputs.androidPackage, "app.json Android package");
}

expect(Boolean(publicUrls.websiteUrl), "Website URL is unresolved.");
expect(Boolean(publicUrls.privacyPolicyUrl), "Privacy policy URL is unresolved.");
expect(Boolean(publicUrls.supportUrl), "Support URL is unresolved.");
expect(Boolean(publicUrls.safetyUrl), "Safety URL is unresolved.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/privacy/index.html")), "Public privacy page is missing: site/privacy/index.html.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/support/index.html")), "Public support page is missing: site/support/index.html.");
expect(fileExistsAbsolute(path.resolve(projectDir, "../site/safety/index.html")), "Public safety page is missing: site/safety/index.html.");

compare(appJson.expo.name, launchInputs.appName, "App name");
compare(appJson.expo.slug, launchInputs.slug, "App slug");
compare(appJson.expo.scheme, launchInputs.scheme, "App scheme");

const iosInfoPlist = appJson.expo.ios?.infoPlist || {};
expect(isNonEmptyString(iosInfoPlist.NSCameraUsageDescription), "iOS camera permission copy is missing.");
expect(isNonEmptyString(iosInfoPlist.NSMicrophoneUsageDescription), "iOS microphone permission copy is missing.");
expect(isNonEmptyString(iosInfoPlist.NSSpeechRecognitionUsageDescription), "iOS speech-recognition permission copy is missing.");

const previewProfile = easJson.build?.preview;
const testflightProfile = easJson.build?.testflight;
const storeProfile = easJson.build?.store;

if (requiresPreview) {
  expect(Boolean(previewProfile), "Missing build.preview profile.");
}

if (requiresTestflight) {
  expect(Boolean(testflightProfile), "Missing build.testflight profile.");
}

if (requiresStore) {
  expect(Boolean(storeProfile), "Missing build.store profile.");
}

if (previewProfile && requiresPreview) {
  compare(previewProfile.distribution, "internal", "preview distribution");
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
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedVisionModel: launchInputs.productionVisionModel,
    filePath: stagingSmokeArtifactPath,
    requireProviderBacked: strictPreviewProvider,
    targetUrl: launchInputs.stagingApiBaseUrl,
  });
  validateNoScreenSmokeEvidence(noScreenSmokeArtifact, {
    allowWarning: true,
    description: "Preview / staging",
    expectedApiBaseUrl: launchInputs.stagingApiBaseUrl,
  });
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
    expectedPromptVersion: launchInputs.productionPromptVersion,
    expectedVisionModel: launchInputs.productionVisionModel,
    filePath: productionSmokeArtifactPath,
    requireProviderBacked: true,
    targetUrl: launchInputs.productionApiBaseUrl,
  });
  validateNoScreenSmokeEvidence(noScreenSmokeArtifact, {
    allowWarning: false,
    description: "Production",
    expectedApiBaseUrl: launchInputs.productionApiBaseUrl,
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

warn(Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN), "EXPO_PUBLIC_SENTRY_DSN is not set in the current shell.");
warn(Boolean(process.env.SENTRY_AUTH_TOKEN), "SENTRY_AUTH_TOKEN is not set in the current shell.");
warn(Boolean(process.env.SENTRY_ORG), "SENTRY_ORG is not set in the current shell.");
warn(Boolean(process.env.SENTRY_PROJECT), "SENTRY_PROJECT is not set in the current shell.");

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

console.log(`Release preflight passed for ${selectedTrack}.`);
