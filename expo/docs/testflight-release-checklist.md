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

1. Freeze the release source, commit every intended source/config/test change, push the candidate revision, and run `node scripts/release-source-state.mjs` from `expo/`. EAS has `cli.requireCommit=true`, and every `npm run build:*:ios` command uses the validated wrapper that requires a completely clean commit before and after the build. Only explicitly enumerated generated evidence and final screenshot paths may be dirty during later validation.
2. Confirm TestFlight/store use the production API URL, `EXPO_PUBLIC_WEBSITE_URL` points to the live site, and `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS=false` for every shipping profile.
3. Run `npm --prefix ../backend/guidepup-api run verify:secrets:staging` and `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
4. Deploy the backend and public pages from the exact frozen source revision. Run `npm --prefix ../backend/guidepup-api run smoke:staging` and `npm --prefix ../backend/guidepup-api run smoke:production`, and require both smoke artifacts to name that revision. Production must show provider-backed analyze for both guidance and scene-query lanes.
5. Run the full local test matrix and `npm run release:preflight:preview` from `expo/`. The final TestFlight/store preflights intentionally remain red until signed-candidate and no-screen evidence exist.
6. Build the Store IPA with `npm run build:store:ios` and the installable production-configured validation twin with `npm run build:store-validation:ios`. Both wrappers require the exact clean commit, use pinned `eas-cli@21.2.0`, and let the remote frozen-lockfile build exclude ignored local `node_modules` and `ios/Pods`. A direct Xcode alternative is acceptable only from a fresh detached checkout after `bun install --frozen-lockfile` and `pod install --deployment`; never use an ordinary working-copy archive as source-revision proof.
7. Export and inspect the Store `.ipa` alongside the `.xcarchive`, signing identity class, entitlements, merged privacy manifests, production environment, and absence of a Sentry SDK/DSN/Crash Data manifest. Separately export a development- or ad-hoc-signed validation IPA authorized for the evidence iPhone. Generate `expo/release/candidate-build.latest.json` with `release-candidate-evidence.mjs`, passing mandatory `--archive`, `--ipa`, and `--validation-ipa` paths plus the expected app version, build number, bundle identifier, team identifier, and source revision. Fresh inspection must require the archive, Store IPA, and validation IPA to share one normalized unsigned app payload and signed-config `candidateIdentifier`. The Store IPA must retain only the approved App Store entitlements; the validation IPA must have a verified device-authorized profile and the signing class required by its distribution method.
8. Install the inspected validation IPA on the physical iPhone. Complete separate pre-upload v3 runs at `expo/release/no-screen-smoke.internal.latest.json` and `expo/release/no-screen-smoke.blind-participant.latest.json`. Use no visual screen inspection, record explicit sanitized human attestations, require a fresh successful `devicectl-process-info` CoreDevice probe and distinct timed native/fallback executions, analyze request IDs, and per-step event IDs, and use only the fixed privacy-safe native/fallback frame-summary markers. Each successful frame must be no more than 2 seconds old, capture within 5 seconds, use 32-768 pixel upload edges, and share its path's analyze request ID. Same-event STOP cue/haptic success must occur within 1 second and confirmed runtime shutdown within 3 seconds. Bind both runs to candidate `validationIpa.sha256`, the candidate binary SHA-256, and signed-config `candidateIdentifier`, then run `npm run check:no-screen-evidence` plus `npm run check:no-screen-evidence:blind`.
9. Run `npm run release:preflight:testflight -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa`. It must freshly reinspect all three artifacts, derive the no-screen evidence profile from the candidate, and validate the frozen source, production smoke, signed candidate, distinct internal/blind runs, both camera-path sequences, and interruption recovery before upload. Store preflight remains red until the processed TestFlight repeat exists.
10. Upload with `npm run submit:testflight:ios -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa`. This wrapper creates a read-only private copy of the Store IPA, reruns preflight against it and the validation IPA, gives only that private copy to EAS, verifies the local copy after the CLI returns, removes it, and writes `expo/release/ios-submission.latest.json`. That file is a candidate-bound local attempt record, not an Apple receipt or Apple-provided IPA digest. Do not rebuild or re-export between candidate generation and upload.
11. After Apple finishes processing, authenticate the Store preflight to App Store Connect. The unique unexpired `VALID` iOS build must match the app/version/build, and its `uploadedAt` value must fall within the bounded local upload-attempt window. This independent Apple record corroborates the attempt but does not cryptographically prove an Apple-side IPA digest. A valid local archive and IPA are signing/build proof only; they are not proof that Apple processed the same TestFlight build.
12. Install the processed build from TestFlight on an iOS 16-or-newer evidence device and have a blind participant write the repeat to `expo/release/no-screen-smoke.testflight.latest.json`. It must begin after both pre-upload runs and the authenticated App Store Connect `uploadedAt` value, use `installationSource: "testflight"`, include the exact sanitized App Store Connect build record identifier, and contain `installationEvidence.appTransactionVerified: true`, `appIdentityMatched: true`, `appStoreAppIdMatched: true`, `bundleVersionMatched: true`, `distributionEnvironment: "apple-sandbox"`, `storeKitEvidencePurpose: "apple-signed-app-identity-only"`, and `uploadedIpaSha256` exactly matching candidate Store `ipa.sha256`. Apple sandbox is not unique to TestFlight, so this StoreKit signal is corroborating app-identity evidence only; the processed build record and explicit blind-participant installation attestation remain mandatory. Run `npm run check:no-screen-evidence:testflight` and `npm run release:preflight:store -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa`. Store preflight also authenticates to App Store Connect and requires exactly one unexpired `VALID` iOS build matching the configured app ID, marketing version, and build number.
13. Attach the validated processed TestFlight build to the App Store version only after Store preflight passes. Complete screenshots, privacy answers, support URL, review notes, agreements, export compliance, and release controls before submission.
14. If Expo metadata push is useful and the account/app are ready, run `npx eas-cli metadata:push --profile store`. Manual App Store Connect entry remains valid and must match the checked-in release inputs.

## TestFlight smoke plan

Use [No-Screen Smoke Evidence](./no-screen-smoke-evidence.md) as the required evidence packet for physical-device validation. The packet must not include raw images, raw audio, credentials, signed or tokenized URLs, provider keys, full device identifiers, or free-form scene/address prose.

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
- Confirm Diagnostics release track matches candidate evidence. A direct-Xcode `app-store` candidate remains `app-store` during local ad hoc validation and TestFlight processing; an EAS TestFlight candidate remains `testflight`.
- Confirm diagnostics shows `provider-backed` or `safe fallback` execution path with the last request ID.
- Confirm diagnostics shows `Speech/listening invariant: PASS`, `Unexpected speech/listening overlap count: 0`, and native path evidence of `native-core` or `js-fallback` for the last analyze event.
- Capture the app name, version, and build number shown in diagnostics or device settings for reviewer notes.
- Record the signed-config candidate identifier, candidate binary SHA-256, and exported IPA SHA-256 during local-candidate validation. After processing, repeat this plan from the TestFlight-installed build and bind the second evidence packet to the App Store Connect/TestFlight build identity and exact uploaded IPA hash.

## Release blockers

- Missing launch inputs in [Launch Inputs](./launch-inputs.md).
- Failed the matching `npm run release:preflight:<track>` command.
- Missing both a working direct Xcode signing/upload path and an authenticated EAS path. EAS credentials are not required when direct Xcode is used.
- Failed `npm --prefix ../backend/guidepup-api run verify:secrets:production`.
- Missing staging `OPENAI_API_KEY` if you want preview validation to be provider-backed instead of warning-only.
- Missing backend production `OPENAI_API_KEY`, which hard-blocks `testflight` and `store`.
- Missing App Store screenshots and metadata.
- Missing or incorrect public website/privacy/support URLs in `store.config.js`.
- Missing or invalid `expo/release/no-screen-smoke.internal.latest.json` or `expo/release/no-screen-smoke.blind-participant.latest.json` for the physical iPhone build.
- Missing or invalid `expo/release/candidate-build.latest.json`, missing mandatory archive/Store IPA/validation IPA SHA-256 evidence, wrong signing classes, extra Store entitlements, mismatched normalized app payloads, stale fresh inspection, or no validation-IPA hash binding between candidate evidence and the local no-screen smoke.
- Missing or invalid `expo/release/ios-submission.latest.json`, a changed local upload copy, or an authenticated Apple upload time outside the local attempt window.
- Missing authenticated App Store Connect API access for Store preflight or no unique unexpired `VALID` iOS build matching the configured app ID, marketing version, and build number.
- Missing or invalid blind-participant `expo/release/no-screen-smoke.testflight.latest.json` with a verified, identity-matched Apple sandbox app transaction, matching App Store app ID and embedded build number, exact authenticated App Store Connect `uploadedAt`/build record, and `uploadedIpaSha256` matching candidate `ipa.sha256` after the matching processed build is installed from TestFlight. Apple sandbox alone, local archive evidence, a local upload-attempt record, or a self-declared installation label does not satisfy this gate.
