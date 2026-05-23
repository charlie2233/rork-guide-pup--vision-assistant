# Guide Pup TestFlight Release Checklist

Use this checklist for the next production cycle. Leave placeholders in place until the real values exist, but do not skip the preflight gate.

## Source Of Truth

All unresolved identifiers, URLs, and release notes live in [Launch Inputs](./launch-inputs.md). Update that file first when preparing the build.

## App Store answers to confirm

- Camera usage: app uses the camera for assistive navigation analysis.
- Third-party AI processing: camera frames are sent to a backend and may be processed by third-party AI providers.
- Microphone access: optional hands-free commands request microphone access and iOS speech recognition.
- Audio behavior: spoken commands are parsed into a bounded command set; raw voice audio is not intentionally logged or sent to AI providers by Guide Pup.
- Data retention and deletion: confirm with the final privacy policy and backend logs policy.

## Build steps

1. Run `npx eas-cli whoami` and confirm the correct Expo account is logged in, or export `EXPO_TOKEN`.
2. Preview uses the staging API URL from `eas.json`.
3. TestFlight and store use the production API URL from `eas.json`.
4. `EXPO_PUBLIC_WEBSITE_URL` is already set to the live Pages site in `eas.json`.
5. Confirm `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS=false` for every shipping profile.
6. Run `npm --prefix ../backend/guidepup-api run verify:secrets:staging` and `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
7. Run `npm --prefix ../backend/guidepup-api run smoke:staging` and `npm --prefix ../backend/guidepup-api run smoke:production`.
8. Run `npm run release:preflight:preview`, `npm run release:preflight:testflight`, and `npm run release:preflight:store` from `expo/`.
9. `testflight` and `store` must not proceed unless `backend/guidepup-api/eval/smoke-results-production.latest.json` shows `provider-backed` analyze.
10. Run `npx eas-cli build --profile preview --platform ios` for the internal preview / ad hoc build.
11. Install the internal preview build on a physical device for smoke testing.
12. Run `npx eas-cli build --profile testflight --platform ios` for the real TestFlight candidate.
13. If Expo metadata push is needed and the account/app are already ready, run `npx eas-cli metadata:push --profile store`. Do not let a metadata-only issue block the build or submit path if manual App Store Connect entry can continue.
14. Run `npx eas-cli submit --profile testflight --platform ios` only after smoke testing passes.

## TestFlight smoke plan

- Launch the app from a clean install.
- Complete onboarding.
- Verify the home screen routes to the navigation flow.
- Grant camera permission and confirm the permission copy is correct.
- Grant microphone and speech-recognition permissions when using hands-free commands, and confirm both permission prompts match the review copy.
- Capture a frame and verify the app returns spoken guidance.
- Force a network failure and verify the app degrades to a safe `STOP` response.
- Verify preview still points at staging, and confirm whether staging is provider-backed or still in safe fallback mode.
- Confirm the settings screen links resolve to the privacy and support destinations.
- Confirm the experimental tabs are hidden in the production build.
- Confirm diagnostics shows `internal-preview` on the ad hoc build and `testflight` on the TestFlight candidate.
- Confirm diagnostics shows `provider-backed` or `safe fallback` execution path with the last request ID.
- Capture the app name, version, and build number shown in diagnostics or device settings for reviewer notes.

## Release blockers

- Missing launch inputs in [Launch Inputs](./launch-inputs.md).
- Failed the matching `npm run release:preflight:<track>` command.
- Missing Expo/EAS login or `EXPO_TOKEN`.
- Failed `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
- Missing staging `OPENAI_API_KEY` if you want preview validation to be provider-backed instead of warning-only.
- Missing backend production `OPENAI_API_KEY`, which hard-blocks `testflight` and `store`.
- Missing App Store screenshots and metadata.
- Missing or incorrect public website/privacy/support URLs in `store.config.js`.
