const appReviewCommandSequence = Object.freeze([
  { spokenPhrase: "start guidance", expectedLane: "voice-command", expectedIntent: "start-guidance", duringSpeech: false },
  { spokenPhrase: "status", expectedLane: "voice-command", expectedIntent: "status", duringSpeech: false },
  { spokenPhrase: "help", expectedLane: "voice-command", expectedIntent: "help", duringSpeech: false },
  { spokenPhrase: "slower speech", expectedLane: "voice-command", expectedIntent: "slower-speech", duringSpeech: false },
  { spokenPhrase: "faster speech", expectedLane: "voice-command", expectedIntent: "faster-speech", duringSpeech: false },
  { spokenPhrase: "more detail", expectedLane: "voice-command", expectedIntent: "more-detail", duringSpeech: false },
  { spokenPhrase: "less detail", expectedLane: "voice-command", expectedIntent: "less-detail", duringSpeech: false },
  { spokenPhrase: "haptics off", expectedLane: "voice-command", expectedIntent: "haptics-off", duringSpeech: false },
  { spokenPhrase: "haptics on", expectedLane: "voice-command", expectedIntent: "haptics-on", duringSpeech: false },
  { spokenPhrase: "repeat", expectedLane: "voice-command", expectedIntent: "repeat", duringSpeech: false },
  { spokenPhrase: "what do you see", expectedLane: "conversation", expectedIntent: "what-do-you-see", duringSpeech: false },
  { spokenPhrase: "STOP", expectedLane: "voice-command", expectedIntent: "stop-guidance", duringSpeech: true },
].map((step) => Object.freeze(step)));

function renderAppReviewCommandSequence(sequence) {
  return sequence
    .map((step, index) => {
      const phrase = `'${step.spokenPhrase}'`;
      if (step.duringSpeech) {
        return `${index === sequence.length - 1 ? "then " : ""}say ${phrase} while speech is playing`;
      }
      return `say ${phrase}`;
    })
    .join("; ");
}

const appReviewStartGuidanceProse = renderAppReviewCommandSequence(
  appReviewCommandSequence.slice(0, 1),
);
const appReviewRemainingCommandSequenceProse = renderAppReviewCommandSequence(
  appReviewCommandSequence.slice(1),
);

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
    `Cold launch Guide Pup. With VoiceOver, complete the three onboarding screens by activating Continue, Continue, then Start using Guide Pup. Guide Pup does not require account sign-in or a demo account. On Home, wait for the spoken ready prompt. Allow microphone and speech-recognition access when iOS requests them, then wait for the success cue indicating listening is ready. For the required no-screen review, ${appReviewStartGuidanceProse}. Allow camera access when iOS requests it, then wait for the spoken camera-ready prompt and its success cue. Continue in this exact order: ${appReviewRemainingCommandSequenceProse}. After voice STOP completes, guidance is paused and the app does not return Home. Use VoiceOver to activate the on-screen Return Home control before opening Settings. Open Settings, then choose Backup camera check (the camera fallback check). Wait for the spoken backup-camera-ready prompt and its success cue, then repeat the same ordered sequence, including 'STOP' while speech is playing. Guide Pup is an assistive vision and navigation aid and does not guarantee hazard detection or emergency response. Sampled compressed camera frames are sent through the Guide Pup Cloudflare backend to an OpenAI vision provider for structured scene analysis. Optional voice commands use Apple speech recognition; on-device recognition is preferred when supported, and Apple service processing may otherwise occur. Guide Pup does not intentionally log raw camera frames or raw voice audio, and voice audio is not sent to the vision provider. The deterministic command lane controls commands and the bounded conversation lane handles 'what do you see'; neither cloud lane controls camera, speech, haptics, VoiceOver, or STOP. Sanitized Cloudflare request/performance logs may persist for up to 7 days; OpenAI default abuse-monitoring retention may be up to 30 days unless approved retention controls apply. The app speaks a conservative STOP when analysis is unavailable, unsafe, stale, or unclear.`,
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
  appReviewCommandSequence,
  getPublicUrls,
  isPlaceholderValue,
  launchInputs,
};
