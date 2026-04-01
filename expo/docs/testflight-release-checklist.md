# Guide Pup TestFlight Release Checklist

Use this checklist for the next production cycle. Leave placeholders in place until the real values exist, but do not skip the preflight gate.

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
2. Set `EXPO_PUBLIC_WEBSITE_URL` after the public site is deployed.
3. Confirm `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS=false` for every shipping profile.
4. Run `npm run release:preflight` from `expo/`.
5. Run `npx eas-cli metadata:push --profile store --platform ios`.
6. Run `npx eas-cli build --profile preview --platform ios` for the internal preview / ad hoc build.
7. Run `npx eas-cli build --profile testflight --platform ios` for the real TestFlight candidate.
8. Install the internal preview build on a physical device for smoke testing.
9. Run `npx eas-cli submit --profile testflight --platform ios` only after smoke testing passes.

## TestFlight smoke plan

- Launch the app from a clean install.
- Complete onboarding.
- Verify the home screen routes to the navigation flow.
- Grant camera permission and confirm the permission copy is correct.
- Capture a frame and verify the app returns spoken guidance.
- Force a network failure and verify the app degrades to a safe `STOP` response.
- Confirm the settings screen links resolve to the privacy and support destinations.
- Confirm the experimental tabs are hidden in the production build.
- Confirm diagnostics shows `internal-preview` on the ad hoc build and `testflight` on the TestFlight candidate.
- Capture the app name, version, and build number shown in diagnostics or device settings for reviewer notes.

## Release blockers

- Missing launch inputs in [Launch Inputs](./launch-inputs.md).
- Failed `npm run release:preflight`.
- Missing backend production credentials.
- Missing App Store screenshots and metadata.
- Missing or incorrect public website/privacy/support URLs in `store.config.js`.
