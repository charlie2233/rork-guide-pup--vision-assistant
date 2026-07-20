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

1. Freeze the release source, commit every intended source/config/test change, push the candidate revision, and run `node scripts/release-source-state.mjs` from `expo/`. Only the explicitly enumerated generated evidence and final screenshot paths may be dirty after this point.
2. Confirm TestFlight/store use the production API URL, `EXPO_PUBLIC_WEBSITE_URL` points to the live site, and `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS=false` for every shipping profile.
3. Run `npm --prefix ../backend/guidepup-api run verify:secrets:staging` and `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
4. Deploy the backend and public pages from the exact frozen source revision. Run `npm --prefix ../backend/guidepup-api run smoke:staging` and `npm --prefix ../backend/guidepup-api run smoke:production`, and require both smoke artifacts to name that revision. Production must show provider-backed analyze for both guidance and scene-query lanes.
5. Run the full local test matrix and `npm run release:preflight:preview` from `expo/`. The final TestFlight/store preflights intentionally remain red until signed-candidate and no-screen evidence exist.
6. Create the signed TestFlight candidate with either direct Xcode archive/export or EAS. EAS and `EXPO_TOKEN` are optional when the direct Xcode path is used; whichever path is selected must build the frozen revision with the production configuration.
7. Inspect the `.xcarchive`, exported IPA when present, signing identity class, entitlements, merged privacy manifests, production environment, and Sentry-disabled state. Generate `expo/release/candidate-build.latest.json` with `release-candidate-evidence.mjs`, passing the expected app version, build number, bundle identifier, team identifier, and source revision.
8. Install that exact local candidate on the physical iPhone. Bind `expo/release/no-screen-smoke.latest.json` to the candidate binary SHA-256, then complete the full no-screen hardware smoke and run `npm run check:no-screen-evidence`.
9. Run `npm run release:preflight:testflight` and `npm run release:preflight:store`. Both must validate the frozen source, production smoke, signed candidate, and binary-bound no-screen evidence before upload.
10. Upload the same candidate IPA/archive to App Store Connect using Xcode, Transporter, or EAS submit. Do not rebuild between local validation and upload.
11. After Apple finishes processing, record the App Store Connect app ID, uploaded build identity, processed build number, and binary association in release evidence. A valid local archive is signing/build proof only; it is not proof that Apple processed the same TestFlight build.
12. Install the processed build from TestFlight and repeat the no-screen validation against that installed build. Record the App Store Connect/TestFlight build identity and require it to match version, build, bundle, team, source revision, and candidate binary identity wherever Apple exposes those values.
13. Attach the validated processed TestFlight build to the App Store version only after the second smoke passes. Complete screenshots, privacy answers, support URL, review notes, agreements, export compliance, and release controls before submission.
14. If Expo metadata push is useful and the account/app are ready, run `npx eas-cli metadata:push --profile store`. Manual App Store Connect entry remains valid and must match the checked-in release inputs.

## TestFlight smoke plan

Use [No-Screen Smoke Evidence](./no-screen-smoke-evidence.md) as the required evidence packet for physical-device validation. The packet must not include raw images, raw audio, credentials, signed URLs, provider keys, or full device identifiers.

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
- Confirm diagnostics shows `Speech/listening invariant: PASS`, `Unexpected speech/listening overlap count: 0`, and native path evidence of `native-core` or `js-fallback` for the last analyze event.
- Capture the app name, version, and build number shown in diagnostics or device settings for reviewer notes.
- Record the candidate binary SHA-256 during local-candidate validation. After processing, repeat this plan from the TestFlight-installed build and bind the second evidence packet to the App Store Connect/TestFlight build identity.

## Release blockers

- Missing launch inputs in [Launch Inputs](./launch-inputs.md).
- Failed the matching `npm run release:preflight:<track>` command.
- Missing both a working direct Xcode signing/upload path and an authenticated EAS path. EAS credentials are not required when direct Xcode is used.
- Failed `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
- Missing staging `OPENAI_API_KEY` if you want preview validation to be provider-backed instead of warning-only.
- Missing backend production `OPENAI_API_KEY`, which hard-blocks `testflight` and `store`.
- Missing App Store screenshots and metadata.
- Missing or incorrect public website/privacy/support URLs in `store.config.js`.
- Missing or invalid `expo/release/no-screen-smoke.latest.json` for the physical iPhone build.
- Missing or invalid `expo/release/candidate-build.latest.json`, or no binary-hash binding between candidate evidence and the local no-screen smoke.
- Missing processed-TestFlight installation evidence after upload. Local archive evidence alone does not satisfy this gate.
