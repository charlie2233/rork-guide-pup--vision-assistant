const { getPublicUrls, launchInputs } = require("./release/launch-inputs");
const appConfig = require("./app.json");

const publicUrls = getPublicUrls();

module.exports = {
  configVersion: 0,
  apple: {
    version: appConfig.expo.version,
    copyright: launchInputs.copyright,
    categories: ["NAVIGATION", "UTILITIES"],
    info: {
      "en-US": {
        title: launchInputs.appName,
        subtitle: "Assistive scene guidance",
        description:
          "Guide Pup provides assistive navigation guidance for blind and low-vision users. The app captures camera frames, sends them to the Guide Pup backend for analysis, and speaks short forward, turn, or stop cues with conservative safe-stop behavior when the scene is unclear or the service is unavailable.",
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
