const launchInputs = {
  appName: "Guide Pup: Vision Assistant",
  slug: "guide-pup-vision-assist",
  scheme: "guidepup",
  packageName: "guidepup-app",
  iosBundleIdentifier: "app.rork.guide-pup-vision-assist",
  androidPackage: "TODO_ANDROID_PACKAGE",
  appleTeamId: "K99RADPB9G",
  ascAppId: "6756947790",
  iosMarketingVersion: "1.0.0",
  iosBuildNumber: "4",
  stagingApiBaseUrl: "https://guidepup-api-staging.charliehan-lifepage.workers.dev",
  websiteUrl: "https://guidepup-site.pages.dev",
  privacyPolicyUrl: "https://guidepup-site.pages.dev/privacy",
  supportUrl: "https://guidepup-site.pages.dev/support",
  supportEmail: "charliehan112@gmail.com",
  copyright: "2026 XIANMIN CHEN",
  emergencyDisclaimer:
    "Guide Pup provides assistive guidance, not guaranteed hazard detection or emergency response. If the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient. If you are in immediate danger, stop using the app and contact local emergency services or nearby people directly.",
  appReviewFirstName: "XIANMIN",
  appReviewLastName: "CHEN",
  appReviewEmail: "charliehan112@gmail.com",
  appReviewPhone: "+1 949 529 6122",
  appReviewDemoRequired: false,
  appReviewNotes:
    "Guide Pup does not require account sign-in. Start from onboarding, allow camera, microphone, and speech-recognition permissions, then use Start Guidance or say 'start guidance'. Sampled compressed camera frames are sent through the Guide Pup Cloudflare backend to an OpenAI vision provider for structured scene analysis. Optional voice commands use Apple speech recognition; on-device recognition is preferred when supported, and Apple service processing may otherwise occur. Guide Pup does not intentionally log raw camera frames or raw voice audio, and voice audio is not sent to the vision provider. The deterministic command lane alone controls start, stop, repeat, status, and settings. Sanitized Cloudflare request/performance logs may persist for up to 7 days; OpenAI default abuse-monitoring retention may be up to 30 days unless approved retention controls apply. The app speaks a conservative STOP when analysis is unavailable, unsafe, stale, or unclear.",
  productionApiBaseUrl: "https://guidepup-api-production.charliehan-lifepage.workers.dev",
  productionPromptVersion: "2026-07-18.v1",
  sentryMode: "disabled",
  productionSentryDsn: "",
  productionVisionModel: "gpt-5.6-sol",
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
