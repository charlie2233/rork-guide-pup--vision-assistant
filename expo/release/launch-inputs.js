const launchInputs = {
  appName: "Guide Pup: Vision Assistant",
  slug: "guide-pup-vision-assist",
  scheme: "guidepup",
  packageName: "guidepup-app",
  iosBundleIdentifier: "app.rork.guide-pup-vision-assist",
  androidPackage: "TODO_ANDROID_PACKAGE",
  appleTeamId: "SBSJ3MX9GZ",
  ascAppId: "6756947790",
  stagingApiBaseUrl: "https://guidepup-api-staging.charliehan-lifepage.workers.dev",
  websiteUrl: "https://guidepup-site.pages.dev",
  privacyPolicyUrl: "https://guidepup-site.pages.dev/privacy",
  supportUrl: "https://guidepup-site.pages.dev/support",
  supportEmail: "TODO_SUPPORT_EMAIL",
  copyright: "TODO_COPYRIGHT_HOLDER",
  emergencyDisclaimer: "TODO_EMERGENCY_SAFETY_DISCLAIMER",
  appReviewFirstName: "TODO_APP_REVIEW_FIRST_NAME",
  appReviewLastName: "TODO_APP_REVIEW_LAST_NAME",
  appReviewEmail: "TODO_APP_REVIEW_EMAIL",
  appReviewPhone: "TODO_APP_REVIEW_PHONE",
  appReviewDemoRequired: false,
  appReviewNotes:
    "Guide Pup does not require account sign-in. Start from onboarding, allow camera/microphone/speech permissions, then use Start Guidance or the voice command 'start guidance'. The app uses anonymous device/session bootstrap and speaks conservative guidance or STOP when analysis is unavailable or unclear.",
  productionApiBaseUrl: "https://guidepup-api-production.charliehan-lifepage.workers.dev",
  productionPromptVersion: "2026-05-22.v1",
  productionSentryDsn: "",
  productionVisionModel: "gpt-5.5",
  storeBuildImage: "macos-sequoia-15.6-xcode-26.2",
  metadataPath: "store.config.js",
  pagesProjectName: "guidepup-site",
  workerName: "guidepup-api",
  productionWorkerName: "guidepup-api-production",
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
