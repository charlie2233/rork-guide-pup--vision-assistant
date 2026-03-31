# Guide Pup TestFlight Release Checklist

Use this checklist for the next production cycle. Leave placeholders in place until the real values exist.

## Required identifiers

- Apple Team ID: `TODO_APPLE_TEAM_ID`
- App Store Connect App ID: `TODO_APP_STORE_CONNECT_APP_ID`
- App Store Connect app name: `Guide Pup: Vision Assistant`
- iOS bundle identifier: `app.rork.guide-pup-vision-assist`

## Required links

- Privacy Policy URL: `TODO_PRIVACY_POLICY_URL`
- Support URL: `TODO_SUPPORT_URL`
- Emergency / safety disclaimer URL or in-app copy: `TODO_EMERGENCY_SAFETY_DISCLAIMER`

## App Store answers to confirm

- Camera usage: app uses the camera for assistive navigation analysis.
- Third-party AI processing: camera frames are sent to a backend and may be processed by third-party AI providers.
- Microphone access: not requested in the shipping navigation path.
- Audio behavior: the shipping path does not record audio; audio playback exists only in experimental surfaces.
- Data retention and deletion: confirm with the final privacy policy and backend logs policy.

## Build steps

1. Set `EXPO_PUBLIC_API_BASE_URL` for staging or production.
2. Confirm `EXPO_PUBLIC_APP_ENV=production` for the production build.
3. Confirm `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS=false` for the shipping build.
4. Run a production EAS build for iOS.
5. Install the build on a physical device.
6. Submit to TestFlight only after smoke testing passes.

## TestFlight smoke plan

- Launch the app from a clean install.
- Complete onboarding.
- Verify the home screen routes to the navigation flow.
- Grant camera permission and confirm the permission copy is correct.
- Capture a frame and verify the app returns spoken guidance.
- Force a network failure and verify the app degrades to a safe `STOP` response.
- Confirm the settings screen links resolve to the privacy and support destinations.
- Confirm the experimental tabs are hidden in the production build.

## Release blockers

- Missing Apple Team ID.
- Missing App Store Connect App ID.
- Missing privacy policy URL.
- Missing support URL.
- Missing final emergency / safety disclaimer copy.
- Missing backend production credentials.
- Missing App Store screenshots and metadata.

