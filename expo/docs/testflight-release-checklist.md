# Guide Pup TestFlight Release Checklist

Use this checklist for the next production cycle. Leave placeholders in place until the real values exist.

## Source Of Truth

All unresolved identifiers, URLs, and release notes live in [Launch Inputs](./launch-inputs.md). Update that file first when preparing the build.

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
4. Run `npx eas-cli build --profile preview --platform ios` for a rehearsal build.
5. Run `npx eas-cli build --profile production --platform ios` for the release candidate.
6. Install the build on a physical device.
7. Submit to TestFlight only after smoke testing passes.

## TestFlight smoke plan

- Launch the app from a clean install.
- Complete onboarding.
- Verify the home screen routes to the navigation flow.
- Grant camera permission and confirm the permission copy is correct.
- Capture a frame and verify the app returns spoken guidance.
- Force a network failure and verify the app degrades to a safe `STOP` response.
- Confirm the settings screen links resolve to the privacy and support destinations.
- Confirm the experimental tabs are hidden in the production build.
- Capture the app name, version, and build number shown in diagnostics or device settings for reviewer notes.

## Release blockers

- Missing launch inputs in [Launch Inputs](./launch-inputs.md).
- Missing backend production credentials.
- Missing App Store screenshots and metadata.
