# Guide Pup Fill These Now

## Current hard blockers on 2026-07-19

- Complete Wrangler OAuth, deploy this exact committed source to staging and production, verify required secret names without exposing values, and produce fresh strict provider-backed smoke artifacts for `gpt-5.6-sol` / `2026-07-18.v1`.
- Restore a runnable iPhone connection and complete the real no-screen sequence, including STOP barge-in, VoiceOver, physical haptics/earcons, settings persistence, native camera capture, and forced JS fallback. The sanitized evidence file does not exist yet.
- Produce and inspect version `1.0.0` build `4`, upload it to TestFlight, and validate that exact build before attaching it to the App Store version record.
- In App Store Connect, attach the validated build, add real app screenshots, publish matching App Privacy answers, and reverify App Review contact/no-sign-in/review-note fields.
- Authenticate Expo/EAS only if EAS is chosen for build or submission. A direct Xcode archive and Apple upload path does not require `EXPO_TOKEN`.

## Optional or post-beta inputs

- Website custom-domain override; the current Pages URL and derived privacy/support/safety URLs are already configured.
- Sentry DSN and release-upload credentials. Launch mode is deliberately `disabled`; enabling Sentry is a separate decision that requires updated privacy answers.
- Final Android package name for a later Android release.

## Resolved locally and in Apple portals by 2026-07-19

- iOS bundle identifier: `app.rork.guide-pup-vision-assist`
  - Evidence: App Store Connect App Information, `expo/app.config.ts`, `expo/app.json`, and `expo/ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj`.
- Apple Team ID: `K99RADPB9G`
  - Evidence: the authenticated Apple Developer portal showed active team `K99RADPB9G` on 2026-07-17. The prior `SBSJ3MX9GZ` identity is historical evidence, not current configuration.
- App Store Connect App ID: `6756947790`
  - Evidence: App Store Connect app list and App Information page for `Guide Pup: Vision Assistant`.
- App Store version and next distribution candidate: version `1.0.0`, build `4`
  - Evidence: the authenticated App Store Connect version remains `Prepare for Submission`; its only TestFlight build is expired build `2`. Build `4` is explicit in Expo, Xcode, and release inputs. No build `4` upload or submission has occurred.
- Distribution signing identity and profile: resolved for team `K99RADPB9G`
  - Evidence: Keychain has a valid `Apple Distribution: XIANMIN CHEN (K99RADPB9G)` identity. The App Store profile for `app.rork.guide-pup-vision-assist` was renewed against that certificate, installed as UUID `808b8553-e7b4-495f-83cd-4eae9f8420db`, expires 2027-07-19, has `get-task-allow=false`, and matches the installed certificate fingerprint.
- Corrected-team signing, install, and launch baseline: resolved for version `1.0.0` build `3`
  - Evidence: a clean signed device build succeeded with the checked-in Sentry-disabled Xcode default and no one-off shell override. Signature/provisioning reported `TeamIdentifier` `K99RADPB9G`, application-identifier prefix `K99RADPB9G`, and bundle `app.rork.guide-pup-vision-assist`; the app installed, launched, and remained running.
  - Limit: no physical voice, haptic, earcon, VoiceOver, interruption, settings-persistence, native-camera, JS-fallback, or no-screen behavior has been validated.
- App Review sign-in requirement: `false`
  - Evidence: Guide Pup has no account sign-in flow; `expo/store.config.js` now sets `apple.review.demoRequired` from `expo/release/launch-inputs.js`.
- Copyright and App Review contact: resolved from authenticated Apple records on 2026-07-17
  - Evidence: Apple Developer shows an Individual membership under `XIANMIN CHEN` and the membership phone used in release inputs; the user-provided support email is the review email. App Store Connect retained `2026 XIANMIN CHEN` as copyright and manual release after reload.
  - Live evidence: before a build was attached, App Store Connect retained copyright and manual release after reload. The no-sign-in selection, contact fields, and review notes reverted, so they must be re-entered and rechecked after a build is attached.
- Sentry mode: `disabled`
  - Evidence: `expo/release/launch-inputs.js` carries `sentryMode: "disabled"` and `productionSentryDsn: ""`; release preflight requires preview/TestFlight/store to set `SENTRY_DISABLE_AUTO_UPLOAD=true`, keeps `EXPO_PUBLIC_SENTRY_DSN` blank, and verifies the local Xcode default.
- Support email: `charliehan112@gmail.com`
  - Evidence: provided by Charlie on 2026-07-17 and mirrored into `expo/release/launch-inputs.js`, `expo/eas.json`, and `site/support/index.html`.
- Emergency / safety disclaimer: resolved on 2026-07-17
  - Evidence: final copy is derived from the existing app fallback, public safety page, and App Review notes, then mirrored into `expo/release/launch-inputs.js` and `expo/eas.json`.

## Authenticated App Store Connect state on 2026-07-19

- App: `Guide Pup: Vision Assistant`; Apple ID `6756947790`; bundle `app.rork.guide-pup-vision-assist`; SKU `EX1766553072106`; category `Navigation`.
- Version `1.0.0` is `Prepare for Submission`, has no selected build and no uploaded screenshots. The screenshot manager currently reports `0 of 10 Screenshots`.
- App Privacy is `Get Started`; no answers were published before archive/provider verification.
- The version Support URL is blank. Use `https://guidepup-site.pages.dev/support` only after the current public site is deployed and rechecked.
- Copyright `2026 XIANMIN CHEN`, manual release, App Review contact, no-sign-in state, and review notes were saved. They still require a final reload check after the candidate build is attached.

## Historical backend evidence by environment

- Staging Worker, last provider-backed evidence before the current launch contract
  - Live URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
  - `BOOTSTRAP_SIGNING_SECRET`: configured on `2026-04-01`
  - `OPENAI_API_KEY`: configured remotely; live smoke on `2026-05-22` returned provider-backed analyze
  - Latest analyze request ID: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Production Worker, last provider-backed evidence before the current launch contract
  - Live URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
  - `BOOTSTRAP_SIGNING_SECRET`: configured on `2026-04-01`
  - `OPENAI_API_KEY`: configured remotely; live smoke on `2026-05-22` returned provider-backed analyze
  - Latest analyze request ID: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`

## Current local auth status

- `CLOUDFLARE_API_TOKEN` is not set locally and Wrangler is not yet authenticated. OAuth reached GitHub sign-in in the in-app Browser; deployment and secret-name verification remain blocked until that login/authorization completes.
- `EXPO_TOKEN` is not set locally and EAS is not authenticated. This blocks the EAS path, not direct Xcode/App Store upload.
- Sentry is intentionally disabled for launch; missing Sentry credentials are not a blocker unless that decision changes.

After updating them, rerun the matching iOS track gate from `expo/`, for example `npm run release:preflight:testflight`.
