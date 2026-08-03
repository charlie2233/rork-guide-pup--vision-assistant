# phase-launch1-internal-testflight-smoke

Date: 2026-05-22
Branch: `codex/guidepup-credentialed-launch`
Commit at phase start: `c2b8781`

## Current gate on 2026-08-02

Decision: **do not upload to TestFlight, submit to App Review, or merge to
`main`**.

- Apple identity is authenticated and confirmed: app `6756947790`, bundle
  `app.rork.guide-pup-vision-assist`, version/build `1.0.0 (4)`, team
  `K99RADPB9G`, SKU `EX1766553072106`, copyright `2026 XIANMIN CHEN`, and
  support email `charliehan112@gmail.com`.
- App Store Connect accepted all four truthful direct-capture iPhone screenshots
  at `1284 x 2778`: `01-welcome.png`, `02-how-to-use.png`, `03-voice-settings.png`, `04-safe-stop-fallback.png`.
  No current build is selected. TestFlight contains only expired build `2`.
  Current review metadata uses `charliehan112@gmail.com`, requires no account
  login, and uses manual release. App Privacy is an unpublished draft. No upload, TestFlight
  processing, build attachment, App Review submission, or Apple acceptance is
  claimed.
- Independent privacy review found a P0 mismatch before publication. The source
  now removes Guide Pup Audio Data because raw Apple Speech audio is not
  collected or retained by Guide Pup. It adds Name, Email Address, and Customer
  Support for support email, all linked, App Functionality, and no tracking.
  Together with Photos or Videos, Environment Scanning, Device ID, Product
  Interaction, Performance Data, and Other Diagnostic Data, the corrected
  manifest has nine collected-data types.
- The public privacy and support source now discloses support mailbox retention
  and that Guide Pup does not collect raw Apple Speech audio. Store preflight
  requires those exact live markers. The live Pages deployment is still the old
  policy until the corrected commit is deployed; the App Privacy draft must not
  be published before that verification.
- The clean signed Store IPA and device-authorized validation IPA from `064cf7f`
  passed local signing, normalized-payload, production-config, and forbidden
  client-secret inspection. They are superseded by the privacy correction and
  must not be uploaded or used as physical evidence.
- Staging and production remain healthy, provider-backed on `gpt-5.6-sol`,
  prompt `2026-07-18.v1`, and strict Structured Outputs, but both report source
  `14747bb`. No existing request ID is launch-valid for the pending replacement
  commit.
- `wrangler whoami` is unauthenticated. The browser callback arrived after the
  CLI listener expired. A fresh CLI OAuth round is required, followed by a
  names-only check for `OPENAI_API_KEY`, `BOOTSTRAP_SIGNING_SECRET`, and absence
  of `SENTRY_DSN`. No value may be read or logged.
- The iPhone is paired, trusted, in Developer Mode, physically USB-visible, and
  visible to `xctrace`, but CoreDevice/DDI services, the tunnel, active process
  probe, and runnable Xcode destination fail. No physical voice, VoiceOver,
  audible-cue, haptic, camera, interruption, persistence, internal-tester, or
  blind-participant result is claimed.
- EAS is logged out and `EXPO_TOKEN` is absent. EAS requires Expo authentication
  only if selected; direct Xcode/App Store upload remains an alternative after
  every earlier gate passes.
- Independent reviewers found no remaining privacy-taxonomy P0/P1 after the
  unverified backend-secret statement was corrected. Current local validation:
  Expo contracts `304/304`, focused privacy/release tests `23/23`, backend
  privacy/runtime `58/58`, backend smoke/provenance `32/32`, both typechecks,
  Expo lint, Expo Doctor `17/17`, staging and production Worker dry-runs,
  `plutil -lint`, and `git diff --check` pass. A new clean signed archive/export
  remains required after commit.

Commands:

```bash
plutil -lint expo/ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy
node --test expo/scripts/*.test.mjs
npm --prefix expo run typecheck
npm --prefix expo run lint
(cd expo && npx --yes expo-doctor)
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run test:smoke
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npm --prefix backend/guidepup-api run deploy:dry-run -- --env production
npm --prefix expo run release:preflight:preview
git diff --check
```

Required remaining order: commit and push the corrected source -> authenticate
Cloudflare -> verify secret names -> deploy and strictly smoke the exact revision
-> deploy and verify public policy/support -> rebuild and inspect normalized
Store/validation twins -> complete distinct internal and blind no-screen v3 runs
on the validation IPA -> upload/process/install through TestFlight -> complete
the blind TestFlight repeat -> publish App Privacy -> select the build and recheck
agreements/compliance/review metadata -> submit. The optional Apple accessibility
label is prepared from blind evidence and published after version `1.0` is live;
it is not a substitute for blind validation or an App Review blocker.

## Current gate on 2026-07-20

- Apple identifiers are resolved: app `6756947790`, bundle `app.rork.guide-pup-vision-assist`, version `1.0.0`, build `4`, team `K99RADPB9G`, and copyright `2026 XIANMIN CHEN`. App Store Connect authentication must be rechecked before any metadata mutation; no upload or submission is claimed.
- Apple Developer remains authenticated. Distribution signing, the App Store profile, and a newly generated one-device Ad Hoc profile are present. The Ad Hoc profile permits exact archive installation for blind validation while retaining `get-task-allow=false` and the Apple Distribution identity.
- A signed build `4` archive and exported App Store IPA were produced from commit `da95d8e`; deep codesign, App Store and Ad Hoc entitlements, privacy manifests, production API routing, and client secret/direct-provider scans passed. They are superseded because the final source now adds Apple's required Environment Scanning disclosure and an explicit VoiceOver-accessible JS fallback validation route; a new exact-revision archive and IPA are required.
- Exact-commit staging and production Workers from `da95d8e` passed strict provider-backed guidance and scene-query smoke with `gpt-5.6-sol` and prompt `2026-07-18.v1`. Any new tracked revision must be redeployed and re-smoked before candidate evidence is regenerated.
- Two superseded 6.9-inch simulator screenshot candidates exist at `expo/store-assets/screenshots/01-home-6.9.jpg` and `02-settings-6.9.jpg`, both `1320x2868`. They do not match the currently observed 6.5-inch portrait sizes, are not final store-quality assets, and are not proof of the physical no-screen flow.
- App Store Connect still has no current candidate build attached, App Privacy is not completed, and Support URL/build/screenshots need final authenticated review. Submission remains blocked until the real-iPhone no-screen artifact passes on the rebuilt candidate, the same archive is uploaded and processed in TestFlight, and the processed build passes the no-screen smoke again.

All later dated evidence is retained as phase history. Older authentication, model, device, and unresolved-input statements below do not override the current gate above.

## Scope

This phase advances internal TestFlight readiness without claiming external gates are solved. It fixes launch-facing disclosure copy so the public site, App Review notes, and release docs match the current iOS behavior: Guide Pup uses camera frames for scene guidance, and optional hands-free voice commands request microphone and iOS speech-recognition permissions for a bounded deterministic command lane.

No provider keys, raw images, raw audio, credentials, or signed URLs were logged. No direct model calls or provider secrets were added to the shipping client.

## Code and docs changed

- Updated public home and privacy copy to disclose optional microphone and iOS speech-recognition use for voice commands.
- Updated public site README behavior notes to remove the stale "no microphone" claim.
- Updated App Review notes with microphone/speech-recognition permission explanation and bounded-command language.
- Updated privacy answer matrix so Apple privacy answers do not incorrectly say microphone is not requested.
- Updated TestFlight checklist to validate microphone and speech-recognition permission prompts during hands-free command smoke.
- Updated launch inputs release notes to match the current shipping behavior.
- Updated the in-app camera-permission fallback copy to say "iOS speech recognition" rather than overclaiming on-device speech recognition.
- Added a versioned Xcode env guard for local simulator validation. This historical behavior was superseded on 2026-07-17: simulator, device, and archive builds now default `SENTRY_DISABLE_AUTO_UPLOAD=true` while launch Sentry mode is disabled, and `SENTRY_ALLOW_FAILURE` is absent.
- Tightened release preflight so provider-backed smoke is not launch-valid unless staging/production evidence also matches the configured launch model and prompt, currently `gpt-5.6-sol` and `2026-07-18.v1`, plus sampled-frame envelope, structured output validity, and nullable `fallbackReason`.
- Hardened no-screen voice behavior for repeated commands, permission denial fallbacks, scene-query-in-progress responses, stale scene-query answers, and placeholder SOS copy.

## Evidence gathered

Repository state before edits:

```bash
git fetch --all --prune
git pull --ff-only
git status --short --branch
git log --oneline -5
```

Results:

- Branch was already up to date with `origin/codex/guidepup-credentialed-launch`.
- Latest commit before this phase: `c2b8781 Harden GuidePup voice command lane`.
- GitHub connector confirmed open PR #4, `Credentialed launch execution`, from `codex/guidepup-credentialed-launch`; it remains draft.

Auth and provider status:

```bash
for v in CLOUDFLARE_API_TOKEN OPENAI_API_KEY EXPO_TOKEN SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT HUGGINGFACE_HUB_TOKEN HF_TOKEN; do ...; done
gh auth status
npx wrangler whoami
```

Results:

- GitHub CLI is authenticated as `charlie2233`.
- Hugging Face connector is authenticated, but no MiniCPM production comparison was run in this phase.
- `CLOUDFLARE_API_TOKEN`, local `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN` are missing in this shell.
- `npx wrangler whoami` failed with `Not logged in`.

Device status:

```bash
xcrun devicectl list devices
xcrun xctrace list devices
xcrun devicectl device info details --device '<redacted-device-identifier>'
```

Results:

- `charlie的iPhone`, iPhone 15 Pro, is paired but `unavailable`.
- `xcrun xctrace list devices` shows `charlie的iPhone (26.4.2)` under `Devices Offline`.
- Device details showed Developer Mode `enabled`, pairing state `paired`, and tunnel state `unavailable`; full device identifiers are intentionally omitted from checked-in evidence.

Release gate status during this phase:

```bash
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
```

Results:

- Preview preflight failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`.
- TestFlight preflight failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`.
- Earlier runs warned that Sentry env values were not set in this shell; the later Sentry launch-mode gate makes disabled diagnostics explicit.

Validation during this phase:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run types
git diff --check
rg -n "does not request microphone|shipping path does not request|shipping navigation path does not request|microphone access: not|does not record audio|shipping client does not request microphone" site expo/docs expo/app.json expo/ios/GuidePupVisionAssistant/Info.plist
```

Results:

- Expo typecheck passed.
- Expo lint passed.
- Backend typecheck passed.
- Worker types regenerated for local `gpt-5.5`, low reasoning effort, and prompt version `2026-05-22.v1`.
- `git diff --check` passed.
- The stale "does not request microphone" disclosure grep returned no matches in launch-facing site/docs/config surfaces.

iOS build validation:

```bash
mcp__xcodebuildmcp__.session_show_defaults
mcp__xcodebuildmcp__.build_sim({"extraArgs":["-quiet"]})
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- Build iOS Apps plugin defaults resolved workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, configuration `Release`, simulator `iPhone 16e`.
- Build iOS Apps plugin compile timed out at the 120 second tool boundary, so the underlying process was checked before starting a shell fallback.
- Release simulator shell build passed for the `iPhone 16e` simulator with third-party warnings and `SENTRY_DISABLE_AUTO_UPLOAD=true`.

Continuation on `2026-05-22` after commit `390e372`:

```bash
git fetch --all --prune
git pull --ff-only
npx --yes wrangler whoami
node -e "for (const k of ['CLOUDFLARE_API_TOKEN','OPENAI_API_KEY','EXPO_TOKEN','SENTRY_AUTH_TOKEN','SENTRY_ORG','SENTRY_PROJECT','HUGGINGFACE_HUB_TOKEN','HF_TOKEN']) console.log(k + '=' + (process.env[k] ? 'set' : 'missing'))"
```

Results:

- Repo sync: already up to date with `origin/codex/guidepup-credentialed-launch`.
- Cloudflare remains blocked: Wrangler returned `Not logged in`.
- Local env remains missing `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN`.
- Hugging Face connector is authenticated as `Chargers`; no MiniCPM production comparison was run in this continuation.
- Prior Build iOS Apps plugin validation failed before app validation because the Sentry Xcode script attempted a simulator source-map upload without Sentry org/project env. That simulator-only workaround is historical and superseded: the versioned `.xcode.env` now defaults `SENTRY_DISABLE_AUTO_UPLOAD=true` for simulator, device, and archive builds while Sentry is disabled, and it does not set `SENTRY_ALLOW_FAILURE`.
- Preflight now treats checked-in live smoke as stale until it proves the launch backend contract, not just provider reachability.

Validation after the continuation:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix backend/guidepup-api run typecheck
git diff --check
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs -quiet CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
```

Results:

- Expo typecheck: passed.
- Expo lint: passed.
- Backend typecheck: passed.
- `git diff --check`: passed.
- Preview preflight: still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`; now warns that staging smoke is stale for the launch contract (`gpt-4.1` / `2026-03-31.v1`, missing sampled-frame envelope and nullable `fallbackReason`).
- TestFlight preflight: still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and stale production smoke contract (`gpt-4.1` / `2026-03-31.v1`, missing sampled-frame envelope and nullable `fallbackReason`).
- Build iOS Apps plugin Release simulator build passed for workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, simulator `iPhone 16e`. The simulator-only guard used for that historical run has since been superseded by the explicit all-build Sentry-disabled launch configuration.

## Backend request IDs

No new provider-backed live smoke was run in this phase because Cloudflare auth is missing. Last known live provider-backed request IDs remain from `phase-backend1-provider-backed-analyze-smoke`:

- Staging `/health`: `1135d81c-65d5-4910-af55-ec9ed7932869`
- Staging `/v1/device/bootstrap`: `6985c962-725b-4305-b316-2e923adb2bd8`
- Staging `/v1/vision/analyze`: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Production `/health`: `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
- Production `/v1/device/bootstrap`: `bc18b829-1200-4bee-a9f0-839010435a5a`
- Production `/v1/vision/analyze`: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`

Important: live Workers are still provider-backed but have not been redeployed with the local `gpt-5.5` / `2026-05-22.v1` structured-output contract.

## Submission review on 2026-05-23

Decision: do not submit to TestFlight or App Store yet.

Reasoning:

- TestFlight must be first, but TestFlight preflight still fails on unresolved release inputs: iOS bundle identifier, Apple Team ID, App Store Connect App ID, and copyright holder.
- `EXPO_TOKEN` is missing in this shell, so EAS build/submit cannot be authenticated.
- Live staging and production Workers are provider-backed, but still stale for the launch contract: `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, missing `fallbackReason`, and missing the new provider runtime-control health fields.
- Cloudflare deployment remains blocked because `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- Real iPhone no-screen smoke is still not validated because the paired device is unavailable/offline to Xcode.
- TestFlight/store preflight now also requires `expo/release/no-screen-smoke.latest.json`, a machine-readable real-iPhone no-screen artifact; static checks and simulator builds no longer satisfy this gate.
- The Diagnostics screen can now export a sanitized no-screen JSON draft that carries runtime diagnostics, health/bootstrap/analyze request IDs, haptic/audio counts, camera path evidence, and placeholder tester attestations for the real iPhone run.
- Sentry issue health remains unverified because Sentry auth/org/project env vars are missing.

Commands rerun for this submission review:

```bash
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run types
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npm --prefix backend/guidepup-api run deploy:dry-run -- --env production
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging-current.json --output-md /tmp/guidepup-smoke-staging-current.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production-current.json --output-md /tmp/guidepup-smoke-production-current.md
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npm --prefix backend/guidepup-api run verify:secrets:staging
npm --prefix backend/guidepup-api run verify:secrets:production
npx --yes wrangler whoami
git diff --check
```

Build iOS Apps plugin Release simulator build for `GuidePupVisionAssistant` on `iPhone 16e` also passed during this review with `CODE_SIGNING_ALLOWED=NO`, `ONLY_ACTIVE_ARCH=YES`, and `COMPILER_INDEX_STORE_ENABLE=NO`.

Expected failures in the submission review:

- `release:preflight:preview` fails on unresolved bundle identifier and stale staging smoke warnings.
- `release:preflight:testflight` and `release:preflight:store` fail on unresolved Apple release inputs, stale production smoke, and missing `release/no-screen-smoke.latest.json`.
- `check:no-screen-evidence` fails until real hardware validation produces the sanitized no-screen artifact.
- The Diagnostics export draft is intentionally not launch evidence by itself; the tester must fill the real no-screen, VoiceOver, haptic/audio, settings-persistence, device-readiness, and privacy attestations after the hardware run.
- `verify:secrets:staging`, `verify:secrets:production`, and `wrangler whoami` fail because `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.

Browser, Computer Use, ChatGPT Atlas, and App Store Connect were not used to submit because submission would be invalid before these gates pass. WhatsApp escalation was not needed for this review because the blockers are explicit release/auth/device inputs, not an ambiguous login screen.

## Public config gate continuation

The release preflight now fails TestFlight/store when final public support and safety inputs are still placeholders, not only when Apple identifiers are unresolved.

Changes:

- EAS preview, TestFlight, and store profiles now carry `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_SUPPORT_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, and `EXPO_PUBLIC_EMERGENCY_DISCLAIMER` from the launch-input contract.
- `release-preflight` now verifies public privacy, support, and safety pages exist in `site/`.
- `release-preflight` now checks iOS camera, microphone, and speech-recognition permission strings are present.
- TestFlight/store preflight now hard-block on unresolved `TODO_SUPPORT_EMAIL` and `TODO_EMERGENCY_SAFETY_DISCLAIMER`, so builds cannot silently ship fallback support/safety copy when final public launch copy is still missing.
- TestFlight/store preflight now also inspects `site/support/index.html` and blocks launch-internal placeholder phrases or a support page that does not include the configured support email from `expo/release/launch-inputs.js`.

Validation:

```bash
node --check expo/scripts/release-preflight.mjs
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
```

Results:

- Script syntax check passed.
- Preview preflight still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER` and stale staging smoke warnings.
- TestFlight/store preflight now also fail on public support-page readiness: the support page still contains launch-internal placeholder phrases and the configured support email is unresolved.
- TestFlight/store remain blocked on unresolved Apple identifiers, copyright holder, emergency/safety disclaimer, stale production smoke contract, and missing no-screen evidence.

## Historical identifier resolution continuation on 2026-05-23

App Store Connect was opened in the side-panel browser at `https://appstoreconnect.apple.com/apps`. The first attempt redirected to Apple sign-in, so a WhatsApp note was sent to Charlie.H requesting login / 2FA or the App Store Connect App ID. After Charlie logged in, the same side-panel browser showed the Guide Pup app record.

Apple and local Xcode evidence resolved the iOS release identifiers without using secrets:

- iOS bundle identifier: `app.rork.guide-pup-vision-assist`
  - Evidence: App Store Connect App Information shows bundle ID `app.rork.guide-pup-vision-assist`; the repo now mirrors it in `expo/app.config.ts`, `expo/app.json`, `expo/ios/GuidePupVisionAssistant.xcodeproj/project.pbxproj`, and `expo/ios/GuidePupVisionAssistant/Info.plist`.
- Historical local Apple Team ID: `SBSJ3MX9GZ`
  - Evidence at that time: `security find-identity -v -p codesigning` returned `Apple Development: XIANMIN CHEN (SBSJ3MX9GZ)`. That identity is historical and is superseded by the current authenticated team recorded below.
- App Store Connect App ID: `6756947790`
  - Evidence: App Store Connect app list links `Guide Pup: Vision Assistant` to `/apps/6756947790/distribution`; App Information lists Apple ID `6756947790`.

The release source of truth was updated for those values at that time; the historical team value is superseded below. App Store Connect also showed SKU `EX1766553072106`, primary category `Navigation`, version `1.0 Prepare for Submission`, empty copyright/support metadata, no build selected, and `Sign-in required` checked in App Review Information even though the app has no account flow; those were submission-readiness gaps.

Validation after resolving local identifiers:

```bash
npx expo config --type public
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run test:smoke-evidence
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
npx --yes eas-cli whoami
npx --yes wrangler whoami
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
```

Results:

- Evaluated Expo config now shows `ios.bundleIdentifier: app.rork.guide-pup-vision-assist`.
- Preview preflight now passes with warnings only; stale staging smoke and missing no-screen evidence remain warnings for preview.
- TestFlight/store preflight no longer fail on bundle identifier, Apple Team ID, or App Store Connect App ID.
- TestFlight/store still fail on copyright holder, support email, emergency/safety disclaimer, public support contact readiness, stale production smoke contract, and missing no-screen evidence.
- Expo typecheck, Expo lint, voice command contract, no-screen contract, no-screen evidence tests, smoke evidence tests, backend typecheck, and backend privacy tests passed.
- `check:no-screen-evidence` still fails because `expo/release/no-screen-smoke.latest.json` is missing.
- `check:ios-device` still reports `charlie的iPhone` blocked: paired and Developer Mode enabled, but unavailable to CoreDevice, DDI unavailable, tunnel disconnected, and no USB iPhone present.
- EAS remains blocked: `npx --yes eas-cli whoami` returns `Not logged in`.
- Cloudflare remains blocked locally: `npx --yes wrangler whoami` returns `Not logged in`.
- Build iOS Apps plugin Release simulator build passed for `GuidePupVisionAssistant` on `iPhone 16e`.

## Smoke evidence privacy continuation

Release preflight now also scans provider-backed smoke artifacts for raw media and secret-bearing fields before they can support TestFlight/store readiness. The shared privacy scanner flags provider keys, bearer tokens, session tokens, raw image/audio fields, signed URLs, data-URL media, and long base64-like payloads.

Validation:

```bash
npm --prefix expo run test:smoke-evidence
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npx wrangler whoami
npx eas-cli@latest whoami
```

Results:

- Smoke evidence privacy tests passed for valid provider-backed artifacts and reject raw image payload fields, bootstrap session tokens, raw media snippets, bearer tokens, and signed URLs.
- Preview preflight failed as expected on unresolved bundle identifier and stale staging smoke evidence.
- TestFlight/store preflights failed as expected on unresolved Apple/support/safety inputs, stale production smoke evidence, and missing real-iPhone no-screen artifact.
- Cloudflare CLI reports `Not logged in`; EAS CLI reports `Not logged in`; local env presence checks show `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `EXPO_TOKEN`, Sentry envs, and Hugging Face env tokens are missing.
- App Store Connect / TestFlight submission was not attempted because the preflight gates prove the build is not submission-ready.

## Help and smoke semantics continuation

- The real-iPhone no-screen evidence sequence now includes `help` after `status`, with schema proof that it speaks the bounded command list and leaves settings unchanged.
- STOP barge-in diagnostics reset when a new navigation run starts, preventing stale STOP cut-through proof from carrying into another smoke draft.
- Live backend smoke now separates `providerBacked` from `launchContract.valid`; release preflight requires both, so stale-but-provider-backed Workers are represented accurately without weakening submission gates.

## Historical P0 snapshot before later continuations

This snapshot predates the later May and July evidence below. It is retained for chronology and must not be read as the current blocker list.

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Machine-readable real-iPhone no-screen evidence is missing: `expo/release/no-screen-smoke.latest.json`.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- TestFlight execution is blocked: `EXPO_TOKEN` is missing and release inputs remain unresolved.
- Sentry issue health could not be queried because Sentry auth/org/project env vars are missing.
- Privacy manifest/App Store Connect privacy answers still need a final release-owner review before App Store submission.

## Next quality gap

The guidance reliability audit found that live smoke/eval scripts do not yet prove the full sampled-frame envelope (`sessionId`, `frameId`, timestamp, prior guidance, native path, dimensions) and client diagnostics omit some structured output fields (`lighting`, `surfaceType`, `sceneDescription`, `fallbackReason`). That should be handled in `phase-quality1-guidance-reliability`.

## Privacy and App Store readiness continuation on 2026-05-23

This continuation tightened App Store-facing privacy and identifier evidence after App Store Connect login became available.

Code/config changes:

- Mirrored App Store Connect bundle ID `app.rork.guide-pup-vision-assist` and Apple ID / ASC app ID `6756947790` into `expo/release/launch-inputs.js`, `expo/app.json`, `expo/eas.json`, and the native Xcode project.
- Removed unused `expo-location` and `expo-image-picker` dependencies from the shipping Expo package and refreshed `expo/ios/Podfile.lock`; `pod install` removed `ExpoLocation` and `ExpoImagePicker`.
- Removed unused native location and photo-library permission copy from `Info.plist`.
- Updated `PrivacyInfo.xcprivacy` to disclose sampled camera frames as `NSPrivacyCollectedDataTypePhotosorVideos` and anonymous device/session bootstrap as `NSPrivacyCollectedDataTypeDeviceID`, both not linked, not tracking, and for app functionality.
- Added release-preflight checks so iOS tracks fail if the privacy manifest omits those collected data types or if native `Info.plist` regains unused location/photo-library permission keys.

Commands and results:

```bash
pod install
npx expo config --type public
plutil -p expo/ios/GuidePupVisionAssistant/Info.plist
plutil -p expo/ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run test:smoke-evidence
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
npx --yes eas-cli whoami
npx --yes wrangler whoami
git diff --check
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- Expo config now evaluates to `ios.bundleIdentifier: app.rork.guide-pup-vision-assist`.
- `Info.plist` contains camera, microphone, and speech-recognition copy, and no unused location/photo-library permission copy.
- `PrivacyInfo.xcprivacy` contains `PhotosorVideos` and `DeviceID` collected data entries for app functionality, not linked and not tracking.
- Preview preflight passes with warnings for stale staging smoke and missing no-screen evidence.
- TestFlight/store preflights no longer fail on bundle identifier, Apple Team ID, or App Store Connect App ID.
- TestFlight/store still fail on copyright holder, support email, emergency/safety disclaimer, public support page readiness, stale production smoke contract, and missing real-iPhone no-screen evidence.
- Typecheck, lint, voice-command contract, no-screen smoke contract, no-screen evidence tests, smoke-evidence tests, backend typecheck, backend privacy/runtime/prompt tests, and `git diff --check` passed.
- `check:no-screen-evidence` still fails because `release/no-screen-smoke.latest.json` has not been produced by a real iPhone run.
- Before the wired/unlocked retry, `check:ios-device` still reported `charlie的iPhone` unavailable to CoreDevice. After the retry below, the device-readiness signal moved to Xcode/account provisioning rather than hardware connectivity.
- EAS remains blocked with `Not logged in`; Wrangler remains blocked with `Not logged in`.
- Build iOS Apps plugin `build_sim` timed out at the tool limit; the underlying process was allowed to finish, then the explicit shell fallback Release simulator build passed with third-party warnings and `SENTRY_DISABLE_AUTO_UPLOAD=true`.

Real-device retry after Charlie wired the iPhone:

```bash
npm --prefix expo run check:ios-device
xcrun devicectl list devices
xcrun xctrace list devices
security find-identity -v -p codesigning
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -destination 'platform=iOS,name=charlie的iPhone' -derivedDataPath /tmp/guidepup-device-build -allowProvisioningUpdates DEVELOPMENT_TEAM=SBSJ3MX9GZ CODE_SIGN_STYLE=Automatic ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build
xcrun devicectl device info details --device 'charlie的iPhone'
xcrun devicectl device info ddiServices --device 'charlie的iPhone'
```

Results:

- `xcrun devicectl list devices` now shows `charlie的iPhone` as `available (paired)`.
- `xcrun xctrace list devices` showed the physical iPhone; the full hardware identifier is intentionally omitted from checked-in evidence.
- At that time, the Mac reported `Apple Development: XIANMIN CHEN (SBSJ3MX9GZ)`; this is historical evidence and is not current release configuration.
- `xcodebuild` reached the device but failed before build/install because the developer disk image could not be mounted.
- `devicectl device info ddiServices` returned `kAMDMobileImageMounterDeviceLocked: The device is locked`.
- `devicectl device info details` shows Developer Mode enabled, pairing state paired, tunnel connected, and `ddiServicesAvailable: false`.
- After unlocking, `devicectl device info ddiServices` succeeded and reports the developer disk image `isUsable: true`.
- `npm --prefix expo run check:ios-device` now returns `READY`; it reports DDI services available, tunnel connected, USB present, xctrace visibility, and Xcode destination visibility. The readiness script was adjusted to accept that execution-ready signal when JSON-only `devicectl` output leaves table state `unknown`.
- The second signed Release device build now reaches signing/provisioning and fails with:
  - `No Accounts: Add a new account in Accounts settings.`
  - `No profiles for 'app.rork.guide-pup-vision-assist' were found: Xcode couldn't find any iOS App Development provisioning profiles matching 'app.rork.guide-pup-vision-assist'.`
- The historical next action was to sign Xcode in for `SBSJ3MX9GZ`; that instruction is superseded by the current active team below.

## Release identity and version alignment on 2026-07-17

- Authenticated Apple Developer portal team: `K99RADPB9G`.
- Live App Store Connect app: `6756947790`; bundle ID: `app.rork.guide-pup-vision-assist`; editable distribution version saved as `1.0.0`; status `Prepare for Submission`.
- The only existing TestFlight build is expired build `2`, so Expo and native Xcode configuration use version `1.0.0` and build `3` as the next explicit local candidate. EAS uses local version ownership and store-backed auto-increment is disabled.
- The old team `SBSJ3MX9GZ` and its local identity remain in the command/error transcript above only as historical evidence, not current configuration.
- The first corrected-team build compiled and provisioned through the final React Native bundle, then failed only because the Sentry script attempted upload while launch Sentry mode was disabled.
- A fresh clean signed Debug build with the checked-in Sentry-disabled default succeeded. The resulting version `1.0.0` build `3` app reported `TeamIdentifier` `K99RADPB9G`, application-identifier prefix `K99RADPB9G`, and bundle `app.rork.guide-pup-vision-assist`, installed and launched successfully on the paired iPhone, and remained running.
- This proves signing, installation, launch, and process liveness only. It does not prove physical speech input, haptics, earcons, VoiceOver, interruption handling, settings persistence, camera behavior, no-screen operation, archive or distribution signing, TestFlight upload, or submission.
- Saving the App Store Connect version as `1.0.0` changed editable metadata only; no build was uploaded and no submission occurred.

## App Store metadata continuation on 2026-07-17

- App Information saved subtitle `Assistive scene guidance`; bundle ID, SKU, Apple ID, category, age rating `4+`, and Individual membership identity were verified in authenticated Apple pages.
- The version record saved the description, keywords, marketing URL, copyright `2026 XIANMIN CHEN`, and manual release selection. Manual release prevents an approval from becoming a public release before blind-user sign-off.
- Apple Developer identifies the membership as Individual under `XIANMIN CHEN`. The authenticated membership phone and user-provided support email resolve the release-source App Review contact values without inventing identity details.
- Before a build was attached, App Store Connect retained copyright and manual release after save and full page reload. The no-sign-in selection, App Review contact, and review notes appeared saved but reverted on reload, so live persistence remains unresolved and those fields must be re-entered and rechecked after a build is attached.
- App Privacy has not been started in App Store Connect. Its privacy-policy URL is saved as `https://guidepup-site.pages.dev/privacy`, but no privacy responses were published; the code and provider-retention audit must finish first.
- No screenshots or candidate build are attached, and `Add for Review` was not used.

Fresh signed candidate status:

- A clean signed Debug device build for version `1.0.0` build `3` completed successfully against the paired iPhone with the checked-in Xcode Sentry-upload default and no one-off shell override.
- The resulting bundle reports `app.rork.guide-pup-vision-assist`, version `1.0.0`, build `3`, application/team prefix `K99RADPB9G`; it installed, launched, and remained running on the connected iPhone.
- This proves build, signing, provisioning, installation, launch, and process liveness only. Physical voice, haptic, earcon, VoiceOver, interruption, settings-persistence, native-camera, JS-fallback, and no-screen behavior remain unclaimed until the human-observed sequence is completed.

## Public support-copy continuation on 2026-05-23

This continuation removed public-site wording that was still written as an internal launch checklist without inventing the unresolved support email or safety metadata.

Changes:

- Replaced the support page's launch-rehearsal notice with public-safe guidance to use the support contact from TestFlight or the App Store listing and to avoid sending raw camera frames, raw audio, credentials, signed URLs, or emergency details.
- Reworded the home page label and support/safety card so the public site no longer says "Public launch surface" or "What to verify before launch."
- Reworded the safety page's "Launch note" heading to "Behavior note."

Commands and results:

```bash
npm --prefix expo run release:preflight:testflight
rg -n "launch rehearsal|before submitting|finalized during launch|What to verify before launch|Public launch surface|Launch note" site -S
```

Results:

- TestFlight preflight no longer fails on public support page placeholder phrases.
- The support email, copyright holder, and emergency/safety disclaimer remain intentionally unresolved in `expo/release/launch-inputs.js`; those still block TestFlight/store.
- Production smoke evidence, real-iPhone no-screen evidence, EAS auth, and Apple provisioning remain blockers.

## Final readiness recheck on 2026-05-23

Commands:

```bash
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run check:ios-device
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npx --yes wrangler whoami
npx --yes eas-cli whoami
```

Results:

- Preview preflight passed with warnings for stale staging smoke (`gpt-4.1` / `2026-03-31.v1`), missing sampled-frame/runtime/structured launch evidence, and missing no-screen evidence.
- TestFlight preflight failed, as intended, on unresolved copyright holder, support email, emergency/safety disclaimer, support-page contact readiness, stale production smoke (`gpt-4.1` / `2026-03-31.v1`), missing sampled-frame/runtime/structured launch evidence, and missing `release/no-screen-smoke.latest.json`.
- iPhone readiness check returned `BLOCKED`: `charlie的iPhone` is paired with Developer Mode enabled, but CoreDevice reports it unavailable, DDI services are unavailable, the tunnel is unavailable, USB is not present, and Xcode does not list it as a runnable destination.
- Staging Worker dry-run passed and shows the local bundle would use `OPENAI_MODEL=gpt-5.5`, `PROMPT_VERSION=2026-05-22.v1`, and bounded runtime controls.
- Wrangler and EAS both returned `Not logged in`; no deploy, build upload, TestFlight submission, or App Store submission was attempted.

## App Review metadata gate on 2026-05-23

Expo EAS Metadata supports App Review Information through `apple.review`, including `demoRequired`. The launch metadata now sets `demoRequired: false` from `expo/release/launch-inputs.js` because Guide Pup has no account sign-in flow, and release preflight rejects demo credentials for this shipping path. The gate also requires App Review contact name, email, and phone before TestFlight/store metadata can be considered ready.

## Support email resolution on 2026-07-17

Charlie provided the launch support email `charliehan112@gmail.com`.

Changes:

- Replaced `TODO_SUPPORT_EMAIL` in `expo/release/launch-inputs.js`.
- Mirrored the same value into preview, TestFlight, and store EAS profile envs.
- Updated `site/support/index.html` to expose the same mailto contact while preserving the no-raw-audio/images/secrets guidance.
- Updated launch-input and fill-these-now docs so support email is no longer listed as unresolved.

## Emergency disclaimer resolution on 2026-07-17

The emergency / safety disclaimer is now resolved from existing public safety and App Review copy:

`Guide Pup provides assistive guidance, not guaranteed hazard detection or emergency response. If the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient. If you are in immediate danger, stop using the app and contact local emergency services or nearby people directly.`

Changes:

- Replaced `TODO_EMERGENCY_SAFETY_DISCLAIMER` in `expo/release/launch-inputs.js`.
- Mirrored the same copy into preview, TestFlight, and store EAS profile envs.
- Updated launch-input, launch-status, and fill-these-now docs so the emergency disclaimer is no longer listed as unresolved.

This does not change App Store Connect directly; EAS and Apple authentication are still required before metadata can be pushed. It prevents the local release source of truth from silently preserving the previously observed App Store Connect mismatch where sign-in was checked despite no account flow.

Validation:

```bash
node --check expo/scripts/release-preflight.mjs
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
```

Results:

- Preview preflight still passes with warnings for stale staging smoke and missing no-screen evidence.
- TestFlight/store preflight now also fail on unresolved App Review contact first name, last name, email, and phone. This is intentional until the release owner supplies final App Review contact values.

## Sentry launch-mode gate on 2026-05-23

Sentry is now a deliberate release decision instead of an ambiguous optional warning.

Changes:

- Added `sentryMode: "disabled"` to `expo/release/launch-inputs.js` with a blank production DSN.
- Updated release preflight so selected EAS profiles must omit `EXPO_PUBLIC_SENTRY_DSN` while Sentry mode is disabled.
- Added the enabled-path gate: if Sentry mode changes to `enabled`, TestFlight/store preflight requires the production DSN to match the selected EAS profiles and requires `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`.
- Updated App Privacy, App Review, launch handoff, and public site copy so diagnostics are currently answered as disabled.

Expected impact:

- Missing Sentry env vars are no longer a blocker for the current disabled-diagnostics launch path.
- Production smoke evidence, real-iPhone no-screen evidence, EAS auth, Apple provisioning, and final store metadata still block TestFlight/App Store submission.

Validation:

```bash
node --check expo/scripts/release-preflight.mjs
node --check expo/scripts/check-no-screen-smoke-contract.mjs
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run test:smoke-evidence
npm --prefix expo run test:guideai-conversation-memory
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
Build iOS Apps plugin build_sim, Release, iPhone 16e, Sentry upload disabled for simulator
```

Results:

- Preview preflight passed with warnings only for stale staging smoke contract and missing real-iPhone no-screen evidence.
- TestFlight/store preflight failed as intended on unresolved store metadata, App Review contact fields, stale production smoke contract, and missing no-screen evidence.
- Expo typecheck, lint, no-screen smoke contract, no-screen evidence tests, smoke-evidence privacy tests, GuideAI conversation-memory test, backend typecheck, backend privacy tests, backend staging dry-run, and Build iOS Apps Release simulator build all passed.

## Structured iPhone readiness evidence on 2026-05-23

The real-iPhone evidence path now has a structured readiness output instead of relying only on human-readable terminal text.

Changes:

- Added `npm --prefix expo run check:ios-device -- --json` so the CoreDevice/Xcode readiness script emits suffix-only JSON for the `deviceReadiness` section of `expo/release/no-screen-smoke.latest.json`.
- Preserved the text output for humans and kept the command exit code strict: blocked hardware still exits nonzero.
- Added a privacy marker to the JSON output: `identifierHandling: "suffix-only"` and `containsFullDeviceIds: false`.
- Tightened no-screen evidence validation so device/provenance/backend identity fields must agree. A no-screen packet can no longer mix one bundle ID, build profile, or API environment in `device`, `provenance`, and `backendSmoke`.

Validation:

```bash
node --check expo/scripts/check-ios-device-ready.mjs
node --check expo/scripts/no-screen-smoke-evidence.mjs
node --check expo/scripts/no-screen-smoke-evidence.test.mjs
node --check expo/scripts/check-no-screen-smoke-contract.mjs
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:ios-device -- --json
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run test:smoke-evidence
npm --prefix backend/guidepup-api run typecheck
Build iOS Apps plugin build_sim, Release, iPhone 16e, Sentry upload disabled for simulator
```

Results:

- No-screen evidence tests passed: 15 tests, including the new mismatched provenance/device/backend identity rejection.
- `check:ios-device -- --json` still exits blocked and emits only suffix identifiers for `charlie的iPhone`; the current blocker is unchanged: CoreDevice unavailable, DDI services unavailable, USB/same-LAN execution unavailable, and no Xcode runnable destination.
- `check:no-screen-evidence` still exits blocked because the real hardware evidence artifact is missing.
- Preview preflight passes with warnings; TestFlight preflight fails on the intended unresolved store metadata, stale production launch-smoke contract, and missing no-screen evidence.
- Expo typecheck, lint, smoke-evidence privacy tests, backend typecheck, `git diff --check`, and Build iOS Apps Release simulator build passed.

## Submission readiness review continuation on 2026-05-23

Decision: still do not submit to TestFlight or App Store, and do not merge/update `main` as launch-ready yet.

Read-only App Store Connect browser evidence from `https://appstoreconnect.apple.com/apps/6756947790/distribution/info`:

- App name: `Guide Pup: Vision Assistant`
- iOS bundle identifier: `app.rork.guide-pup-vision-assist`
- SKU: `EX1766553072106`
- Apple ID / App Store Connect App ID: `6756947790`
- Category: `Navigation`

Fresh volatile status checks:

```bash
npm --prefix expo run check:ios-device -- --json
npx --yes eas-cli whoami
npx --yes wrangler whoami
```

Results:

- `check:ios-device -- --json` still exits blocked. It reports suffix-only device identifiers for `charlie的iPhone`, paired/trusted `true`, Developer Mode `true`, last connection `2026-05-23T19:58:57.734Z`, but `ddiServicesAvailable: false`, `tunnelConnected: false`, `usbOrSameLan: false`, and `xcodeDestinationAvailable: false`.
- `npx --yes eas-cli whoami`: `Not logged in`, so no EAS build/submit can be started.
- `npx --yes wrangler whoami`: `Not logged in`, so staging/production Workers cannot be redeployed from this shell.

Validation in this continuation:

```bash
node --check backend/guidepup-api/eval/run-live-smoke.mjs
node --check expo/scripts/release-preflight.mjs
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
git diff --check
Build iOS Apps plugin build_sim, Release, iPhone 16e
```

Results:

- Backend typecheck/tests, staging dry-run, Expo static checks, preview preflight, and Release simulator build passed.
- TestFlight preflight still fails on unresolved copyright holder, App Review contact fields, stale production smoke contract, and missing real-iPhone no-screen evidence.
- The stale smoke contract now explicitly blocks missing strict Structured Outputs proof: `health.structuredOutputMode` and `launchContract.strictStructuredOutputsPresent`.

## 2026-07-18 submission decision

Decision: **not ready to submit yet**. App Store Connect identity is resolved from prior authenticated evidence, but no build should be attached or submitted until the candidate itself clears the cloud and hardware gates. The current controllable in-app Browser tab redirects to Apple sign-in with `authResult=FAILED`, so live metadata persistence has not been reverified in this continuation.

Current verified identity:

- App Store Connect app `6756947790`, bundle `app.rork.guide-pup-vision-assist`, version `1.0.0`, next candidate build `3`, team `K99RADPB9G`, copyright `2026 XIANMIN CHEN`.
- Support and App Review email: `charliehan112@gmail.com`; no account or demo credentials are required.
- Sentry remains intentionally disabled and is not an authentication blocker.

Current blockers:

- Deploy and strictly smoke the current staging and production Workers; no launch-valid current request IDs exist yet.
- Restore the paired iPhone as a runnable Xcode destination and produce the sanitized real no-screen evidence artifact.
- Finish and inspect the exact distribution archive/TestFlight build, validate it through TestFlight, capture real screenshots, publish matching privacy answers, attach the build, and reverify App Review fields.

Current local evidence:

- Expo scripted tests passed `42/42`; backend tests passed `17/17`; the adversarial release-preflight suite passed `10/10`; both typechecks, Expo lint, and Expo Doctor `17/17` passed.
- The exact Release simulator build for workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, and `iPhone 17 Pro Max` exited `0`. Bundle ID `app.rork.guide-pup-vision-assist`, version `1.0.0`, build `3`, and permission copy were present in the built artifact.
- The Release artifact installed and launched. Runtime snapshots exposed named accessibility targets for onboarding, privacy, support, safety, Home, and Settings; settings persisted across a stop/relaunch cycle.
- Preview preflight passes with stale-smoke and missing-device-evidence warnings. TestFlight and store preflights fail on the stale production launch contract and missing `release/no-screen-smoke.latest.json`, as intended.
- This simulator evidence is not a signed distribution archive, TestFlight install, real camera/haptic/audio/VoiceOver validation, or App Store screenshot set.

No App Store submission, TestFlight upload, or `main` launch-ready merge is claimed in this section.

## 2026-07-24 current submission decision

Decision: **not ready to upload or submit yet**.

Verified local/account state:

- Branch: `codex/guidepup-credentialed-launch`; pre-commit HEAD remains `80c6e7a10f03b8358fd34a19501ce8838f87fbde`.
- Configured Apple identity is app `6756947790`, bundle `app.rork.guide-pup-vision-assist`, team `K99RADPB9G`, version/build `1.0.0 (4)`, and support email `charliehan112@gmail.com`.
- Cloudflare authentication and required secret-name checks pass for staging and production. The wired iPhone transport/readiness probe passes.
- Expo tests pass `241/241`; release-evidence tests pass `48/48`; backend privacy/runtime/safety tests pass `50/50`; backend smoke/provenance tests pass `20/20`; both typechecks, Expo lint, Expo Doctor `17/17`, voice/no-screen contracts, and `git diff --check` pass.

Release-integrity changes:

- EAS requires a commit and validated build scripts require the same completely clean revision before and after each iOS build.
- Candidate evidence freshly inspects the archive, Store IPA, and device-authorized validation IPA; it requires one normalized unsigned payload and signed runtime binding while allowing only the signing differences required by each distribution method.
- The submit wrapper gives EAS only a read-only private copy of the Store IPA, verifies that local copy before and after the CLI returns, deletes it, and writes a closed privacy-safe local attempt record. This is not an Apple receipt or Apple-provided IPA digest.
- Store preflight authenticates to App Store Connect, requires one unexpired `VALID` matching iOS build, and corroborates the local attempt using Apple's independent app/version/build and `uploadedAt` record without claiming cryptographic byte identity.

Current blockers:

- Independent final reviews must close, then the changes must be committed/pushed and the exact Release simulator/device build rerun. The uncommitted Release build correctly failed the new clean-source guard.
- Deploy exact-revision staging/production Workers and capture current dual-lane provider-backed request IDs.
- Export a normalized-payload-equivalent validation IPA and Store IPA from the exact clean revision, produce separate physical-iPhone internal and blind-participant v3 artifacts from the validation IPA, upload the Store IPA, install the matching processed build from TestFlight, and complete a later blind-participant repeat.
- The controllable App Store Connect tab currently redirects to `authResult=FAILED`; live metadata, screenshots, build attachment, agreements/compliance, and submission cannot be claimed until sign-in is restored.

No TestFlight upload, App Review submission, or `main` merge is claimed.

## 2026-07-24 live App Store Connect and remediation update

Decision: **still not ready to upload or submit**.

Authenticated, read-only App Store Connect browser evidence now confirms:

- App `Guide Pup: Vision Assistant`, Apple ID `6756947790`, bundle ID `app.rork.guide-pup-vision-assist`, SKU `EX1766553072106`, primary category `Navigation`, and age rating `4+`.
- iOS version `1.0.0` remains `Prepare for Submission`.
- Four 6.5-inch iPhone screenshots are already present.
- App Review email is `charliehan112@gmail.com`; sign-in is not required.
- Manual release is selected.
- No build is attached to version `1.0.0`; the version page still presents `Add Build`.

The TestFlight page later returned to Apple sign-in before its build list loaded, so no TestFlight build availability or processing state is claimed.

Runtime remediation completed in this continuation:

- Native speech cancellation, supersession, and immediate stop reject the exact pending utterance instead of reporting delivery success.
- Shared recognition rearm debt is drained by a superseding keep-listening response; rearm failure pauses guidance and stops the camera.
- Every camera interruption pauses guidance and requires an explicit `start guidance`; recovery no longer schedules analysis automatically.
- VoiceOver can inspect a separate current-guidance summary while the STOP/Return Home control remains independently actionable.
- No-screen evidence v3 requires unique per-step event IDs/timestamps and per-camera-path STOP evidence. STOP cue and haptic success must come from the same bound STOP event, not earlier global counters.

Fresh focused validation:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
node --test expo/scripts/native-speech-delivery-contract.test.mjs
node --test expo/scripts/ios-runtime-safety-behavior.test.mjs expo/scripts/ios-runtime-safety-contract.test.mjs
node --test expo/scripts/no-screen-smoke-evidence.test.mjs expo/scripts/no-screen-diagnostics-draft.test.mjs
npm --prefix expo run check:no-screen-smoke
git diff --check
```

These checks pass. They are source/simulator contracts only and do not replace an installed physical-iPhone blind run, audible/felt feedback confirmation, TestFlight processing, or the later blind-participant TestFlight repeat.
