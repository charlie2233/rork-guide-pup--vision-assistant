const launchInputs = {
  appName: "Guide Pup: Vision Assistant",
  slug: "guide-pup-vision-assist",
  scheme: "guidepup",
  packageName: "guidepup-app",
  iosBundleIdentifier: "TODO_IOS_BUNDLE_IDENTIFIER",
  androidPackage: "TODO_ANDROID_PACKAGE",
  appleTeamId: "TODO_APPLE_TEAM_ID",
  ascAppId: "TODO_APP_STORE_CONNECT_APP_ID",
  stagingApiBaseUrl: "https://guidepup-api-staging.charliehan-lifepage.workers.dev",
  websiteUrl: "https://guidepup-site.pages.dev",
  privacyPolicyUrl: "https://guidepup-site.pages.dev/privacy",
  supportUrl: "https://guidepup-site.pages.dev/support",
  supportEmail: "TODO_SUPPORT_EMAIL",
  copyright: "TODO_COPYRIGHT_HOLDER",
  emergencyDisclaimer: "TODO_EMERGENCY_SAFETY_DISCLAIMER",
  productionApiBaseUrl: "TODO_PRODUCTION_API_BASE_URL",
  productionSentryDsn: "",
  storeBuildImage: "macos-sequoia-15.6-xcode-26.2",
  metadataPath: "store.config.js",
  pagesProjectName: "guidepup-site",
  workerName: "guidepup-api",
  stagingWorkerName: "guidepup-api-staging",
};

function trimToUndefined(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isPlaceholderValue(value) {
  const trimmed = trimToUndefined(value);
  return !trimmed || trimmed.startsWith("TODO_");
}

function normalizeUrl(value) {
  const trimmed = trimToUndefined(value);
  if (!trimmed || isPlaceholderValue(trimmed)) {
    return undefined;
  }

  return trimmed.replace(/\/+$/g, "");
}

function derivePublicPageUrl(pathname) {
  const websiteUrl = normalizeUrl(launchInputs.websiteUrl);
  return websiteUrl ? `${websiteUrl}${pathname}` : undefined;
}

function getPublicUrls() {
  const explicitPrivacy = normalizeUrl(launchInputs.privacyPolicyUrl);
  const explicitSupport = normalizeUrl(launchInputs.supportUrl);

  return {
    privacyPolicyUrl: explicitPrivacy || derivePublicPageUrl("/privacy"),
    safetyUrl: derivePublicPageUrl("/safety"),
    supportUrl: explicitSupport || derivePublicPageUrl("/support"),
    websiteUrl: normalizeUrl(launchInputs.websiteUrl),
  };
}

module.exports = {
  getPublicUrls,
  isPlaceholderValue,
  launchInputs,
};
