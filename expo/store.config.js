const { getPublicUrls, launchInputs } = require("./release/launch-inputs");
const appConfig = require("./app.json");

const publicUrls = getPublicUrls();

module.exports = {
  configVersion: 0,
  apple: {
    version: appConfig.expo.version,
    copyright: launchInputs.copyright,
    categories: ["NAVIGATION", "UTILITIES"],
    review: {
      firstName: launchInputs.appReviewFirstName,
      lastName: launchInputs.appReviewLastName,
      email: launchInputs.appReviewEmail,
      phone: launchInputs.appReviewPhone,
      demoRequired: launchInputs.appReviewDemoRequired,
      notes: launchInputs.appReviewNotes,
    },
    info: {
      "en-US": {
        title: launchInputs.appName,
        subtitle: "Assistive scene guidance",
        description:
          "Guide Pup provides assistive navigation guidance for blind and low-vision users. The app captures sampled camera frames, sends them through the Guide Pup backend to a third-party AI provider for analysis, and speaks short forward, turn, or stop cues with conservative safe-stop behavior when the scene is unclear or the service is unavailable. Optional hands-free commands use Apple speech recognition.",
        keywords: [
          "accessibility",
          "blind",
          "low vision",
          "navigation",
          "scene guidance",
        ],
        marketingUrl: publicUrls.websiteUrl || launchInputs.websiteUrl,
        supportUrl: publicUrls.supportUrl || launchInputs.supportUrl,
        privacyPolicyUrl: publicUrls.privacyPolicyUrl || launchInputs.privacyPolicyUrl,
      },
    },
  },
};
