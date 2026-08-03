import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const swiftModule = read(
  "../modules/guidepup-navigation-core/ios/GuidePupNavigationCoreModule.swift",
);
const nativeTypes = read(
  "../modules/guidepup-navigation-core/src/GuidePupNavigationCore.types.ts",
);
const nativeModule = read(
  "../modules/guidepup-navigation-core/src/GuidePupNavigationCoreModule.ts",
);
const webModule = read(
  "../modules/guidepup-navigation-core/src/GuidePupNavigationCoreModule.web.ts",
);
const wrapper = read("../src/native/GuidePupNavigationCore.ts");

function distributionEvidenceSlice() {
  const start = swiftModule.indexOf('AsyncFunction("getDistributionEvidence")');
  const end = swiftModule.indexOf('AsyncFunction("getState")', start);
  assert.notEqual(start, -1, "Native distribution evidence method is missing.");
  assert.notEqual(end, -1, "Native distribution evidence method boundary is missing.");
  return swiftModule.slice(start, end);
}

test("native distribution evidence trusts only a verified StoreKit app transaction", () => {
  const source = distributionEvidenceSlice();

  assert.match(source, /#available\(iOS 16\.0, \*\)/);
  assert.match(source, /try await AppTransaction\.shared/);
  assert.match(source, /case \.verified\(let appTransaction\)/);
  assert.match(source, /switch appTransaction\.environment/);
  assert.match(source, /appTransaction\.bundleID == bundleIdentifier/);
  assert.match(source, /appTransaction\.appVersion == appVersion/);
  assert.match(source, /appTransaction\.appID\.map\(String\.init\) == expectedAppStoreAppId/);
  assert.match(source, /GuidePupExpectedBuildNumber/);
  assert.match(source, /bundleVersion == expectedBuildNumber/);
  assert.match(source, /case \.sandbox:\s*environment = "apple-sandbox"/);
  assert.match(source, /case \.production:\s*environment = "app-store-production"/);
  assert.match(source, /case \.xcode:\s*environment = "xcode"/);
  assert.match(source, /case \.unverified:/);
  assert.match(source, /"transactionVerified": true/);
  assert.match(source, /"transactionVerified": false/);
  assert.match(source, /"identityMatched": identityMatched/);
  assert.match(source, /"identityMatched": false/);
  assert.match(source, /"appStoreAppIdMatched": appStoreAppIdMatched/);
  assert.match(source, /"bundleVersionMatched": bundleVersionMatched/);
  assert.match(source, /"environment": environment/);

  assert.doesNotMatch(source, /appStoreReceiptURL|checkResourceIsReachable|sandboxReceipt/);
  assert.doesNotMatch(
    source,
    /jsonRepresentation|\bjws\b|base64|payload|token|appTransaction(?:ID|\.id)|originalAppTransaction/i,
  );
});

test("native TypeScript module exposes typed distribution evidence", () => {
  assert.match(
    nativeTypes,
    /export type GuidePupDistributionEnvironment =[\s\S]*"apple-sandbox"[\s\S]*"app-store-production"[\s\S]*"xcode"[\s\S]*"unknown"[\s\S]*"none"/,
  );
  assert.match(
    nativeTypes,
    /export interface GuidePupDistributionEvidence \{[\s\S]*appStoreAppIdMatched: boolean;[\s\S]*bundleVersionMatched: boolean;[\s\S]*transactionVerified: boolean;[\s\S]*identityMatched: boolean;[\s\S]*environment: GuidePupDistributionEnvironment;/,
  );
  assert.match(
    nativeModule,
    /getDistributionEvidence\(\): Promise<GuidePupDistributionEvidence>/,
  );
});

test("web and app wrappers expose a truthful unverified distribution fallback", () => {
  assert.match(
    webModule,
    /getDistributionEvidence\(\) \{[\s\S]*Promise\.resolve\(unavailableDistributionEvidence\)/,
  );
  assert.match(
    webModule,
    /unavailableDistributionEvidence[\s\S]*appStoreAppIdMatched: false,[\s\S]*bundleVersionMatched: false,[\s\S]*transactionVerified: false,[\s\S]*identityMatched: false,[\s\S]*environment: "none"/,
  );
  assert.match(
    wrapper,
    /getDistributionEvidence\?\(\): Promise<GuidePupDistributionEvidence>/,
  );
  assert.match(
    wrapper,
    /fallbackDistributionEvidence[\s\S]*appStoreAppIdMatched: false,[\s\S]*bundleVersionMatched: false,[\s\S]*transactionVerified: false,[\s\S]*identityMatched: false,[\s\S]*environment: "none"/,
  );
  assert.match(
    wrapper,
    /async function getDistributionEvidence\(\): Promise<GuidePupDistributionEvidence>[\s\S]*if \(!nativeModule\?\.getDistributionEvidence\)[\s\S]*catch \{[\s\S]*return fallbackDistributionEvidence;/,
  );
  assert.match(
    wrapper,
    /export const GuidePupNavigationCore = \{[\s\S]*getDistributionEvidence,/,
  );
});
