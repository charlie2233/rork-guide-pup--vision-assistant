import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { getPublicUrls, isPlaceholderValue, launchInputs } = require("../release/launch-inputs");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectDir, relativePath), "utf8"));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(projectDir, relativePath));
}

const appJson = readJson("app.json");
const easJson = readJson("eas.json");
const publicUrls = getPublicUrls();

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

checkPlaceholder(launchInputs.iosBundleIdentifier, "iOS bundle identifier");
checkPlaceholder(launchInputs.androidPackage, "Android package");
checkPlaceholder(launchInputs.appleTeamId, "Apple Team ID");
checkPlaceholder(launchInputs.ascAppId, "App Store Connect app ID");
checkPlaceholder(launchInputs.copyright, "Store copyright");
checkPlaceholder(launchInputs.productionApiBaseUrl, "Production API base URL");

expect(Boolean(publicUrls.websiteUrl), "Website URL is unresolved.");
expect(Boolean(publicUrls.privacyPolicyUrl), "Privacy policy URL is unresolved.");
expect(Boolean(publicUrls.supportUrl), "Support URL is unresolved.");

compare(appJson.expo.name, launchInputs.appName, "App name");
compare(appJson.expo.slug, launchInputs.slug, "App slug");
compare(appJson.expo.scheme, launchInputs.scheme, "App scheme");
compare(appJson.expo.ios?.bundleIdentifier, launchInputs.iosBundleIdentifier, "app.json iOS bundle identifier");
compare(appJson.expo.android?.package, launchInputs.androidPackage, "app.json Android package");

const previewProfile = easJson.build?.preview;
const testflightProfile = easJson.build?.testflight;
const storeProfile = easJson.build?.store;

expect(Boolean(previewProfile), "Missing build.preview profile.");
expect(Boolean(testflightProfile), "Missing build.testflight profile.");
expect(Boolean(storeProfile), "Missing build.store profile.");

if (previewProfile) {
  compare(previewProfile.distribution, "internal", "preview distribution");
  compare(previewProfile.env?.EXPO_PUBLIC_RELEASE_TRACK, "internal-preview", "preview release track");
  compare(previewProfile.env?.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS, "false", "preview experimental tabs flag");
}

for (const [profileName, profile] of Object.entries({ testflight: testflightProfile, store: storeProfile })) {
  if (!profile) {
    continue;
  }

  compare(profile.distribution, "store", `${profileName} distribution`);
  compare(profile.env?.EXPO_PUBLIC_APP_ENV, "production", `${profileName} app env`);
  compare(profile.env?.EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS, "false", `${profileName} experimental tabs flag`);
  expect(
    profile.ios?.image === launchInputs.storeBuildImage,
    `${profileName} iOS image must be "${launchInputs.storeBuildImage}" for App Store uploads.`,
  );
}

compare(testflightProfile?.channel, "testflight", "testflight update channel");
compare(storeProfile?.channel, "production", "store update channel");
compare(testflightProfile?.env?.EXPO_PUBLIC_RELEASE_TRACK, "testflight", "testflight release track");
compare(storeProfile?.env?.EXPO_PUBLIC_RELEASE_TRACK, "app-store", "store release track");

const submitTestflight = easJson.submit?.testflight;
const submitStore = easJson.submit?.store;

expect(Boolean(submitTestflight), "Missing submit.testflight profile.");
expect(Boolean(submitStore), "Missing submit.store profile.");

for (const [profileName, profile] of Object.entries({ testflight: submitTestflight, store: submitStore })) {
  if (!profile) {
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

const envExample = fs.readFileSync(path.join(projectDir, ".env.example"), "utf8");
for (const requiredEnv of [
  "EXPO_PUBLIC_API_BASE_URL",
  "EXPO_PUBLIC_APP_ENV",
  "EXPO_PUBLIC_RELEASE_TRACK",
  "EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS",
]) {
  expect(envExample.includes(`${requiredEnv}=`), `.env.example is missing ${requiredEnv}.`);
}

warn(Boolean(process.env.EXPO_PUBLIC_API_BASE_URL), "EXPO_PUBLIC_API_BASE_URL is not set in the current shell.");
warn(Boolean(process.env.EXPO_PUBLIC_WEBSITE_URL), "EXPO_PUBLIC_WEBSITE_URL is not set in the current shell.");
warn(Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN), "EXPO_PUBLIC_SENTRY_DSN is not set in the current shell.");
warn(Boolean(process.env.SENTRY_AUTH_TOKEN), "SENTRY_AUTH_TOKEN is not set in the current shell.");
warn(Boolean(process.env.SENTRY_ORG), "SENTRY_ORG is not set in the current shell.");
warn(Boolean(process.env.SENTRY_PROJECT), "SENTRY_PROJECT is not set in the current shell.");

if (errors.length > 0 || warnings.length > 0) {
  console.log("Guide Pup release preflight");
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

console.log("Release preflight passed.");
