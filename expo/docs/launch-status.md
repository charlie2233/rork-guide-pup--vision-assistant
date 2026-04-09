# Guide Pup Launch Status

Last updated: 2026-04-09

## Public site

- Pages project: `guidepup-site`
- Live URL: `https://guidepup-site.pages.dev`
- Privacy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Safety URL: `https://guidepup-site.pages.dev/safety`

## Staging backend

- Worker env: `staging`
- Live API URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- Current Worker version: `358c7f85-8266-406c-b343-7e1679f900db`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: still missing
- Required-secret gate:
  - `npm run verify:secrets:staging`: fails with `Missing required Cloudflare secrets for staging: OPENAI_API_KEY.`
  - `npm run check:staging`: now fails before deploy on the same missing secret
- Latest smoke run:
  - `/health`: `200 OK`, request ID `6d046c0b-9ada-42cf-bf66-46ee82e689c8`
  - `/v1/device/bootstrap`: `200 OK`, request ID `cc9fd5e7-84ee-417c-bcb5-72d27eb0776c`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `279e25d7-a56c-4af5-bd74-ecc87f33526b`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, prompt version `2026-03-31.v1`, not provider-backed, because staging `OPENAI_API_KEY` is still unset
- Latest machine artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.json`
- Latest markdown artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.md`

## Production backend

- Worker env: `production`
- Live API URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- Current Worker version: `fedabdcc-7c07-415d-825f-b4782f76ddc9`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: still missing
- Required-secret gate:
  - `npm run verify:secrets:production`: fails with `Missing required Cloudflare secrets for production: OPENAI_API_KEY.`
  - `npm run check`: now fails before deploy on the same missing secret
- Latest smoke run:
  - `/health`: `200 OK`, request ID `f98c9729-5e28-42b2-abcb-80305fc358f6`
  - `/v1/device/bootstrap`: `200 OK`, request ID `431ef41d-a856-44ac-81f8-74654bbe1443`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `51e5fcd8-e1ea-4eff-b180-fa5c033757a1`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, prompt version `2026-03-31.v1`, not provider-backed, because production `OPENAI_API_KEY` is still unset
- Latest machine artifact: `backend/guidepup-api/eval/smoke-results-production.latest.json`
- Latest markdown artifact: `backend/guidepup-api/eval/smoke-results-production.latest.md`

## Release gates

- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- Store profile: `store`
- Preview API target: staging
- TestFlight API target: production
- Store API target: production
- EAS Metadata config: `expo/store.config.js`
- Release preflight: track-aware, with preview warning on fallback-only staging smoke and a hard provider-backed gate for `testflight` and `store`
- Expo auth status:
  - `printenv EXPO_TOKEN`: empty
  - `npx --yes eas-cli whoami`: `Not logged in`
- Current preflight results:
  - `preview`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, with a warning that staging smoke is still `safe-fallback` because `OPENAI_API_KEY` is missing
  - `testflight`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
  - `store`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
- Current Expo command results:
  - `npx --yes eas-cli whoami`: blocked immediately because Expo auth is missing
  - Preview/TestFlight build and submit were not attempted after the auth check because the first real Expo blocker was already hit

## Actions taken on 2026-04-01

- Removed secret-like backend config from `wrangler.jsonc` vars so Wrangler secrets can be set correctly.
- Redeployed the staging Worker with the updated config and analyze-route error semantics.
- Set staging `BOOTSTRAP_SIGNING_SECRET` as a real Wrangler secret.
- Re-ran live staging smoke checks and recorded fresh request IDs.
- Deployed the production Worker, set production `BOOTSTRAP_SIGNING_SECRET`, and recorded production smoke results.
- Wired `testflight` and `store` to the live production API URL in `eas.json`.
- Made release preflight track-aware so iOS execution no longer blocks on the Android package placeholder.
- Added reusable live smoke commands that emit both JSON and markdown artifacts for staging and production.
- Re-ran staging and production smoke against the live Workers, confirming both envs are still `safe-fallback` because `OPENAI_API_KEY` is missing.
- Re-ran the track-specific preflights with the provider-backed ship gate enabled for `testflight` and `store`.
- Added `secrets.required` to `wrangler.jsonc` for top-level, `staging`, and `production`.
- Added a required-secret verification script and wrapped `check`, `check:staging`, `deploy`, and `deploy:staging` around it.
- Verified that staging and production now fail before deploy with the exact missing secret: `OPENAI_API_KEY`.
- Re-ran staging and production smoke after the new deploy gate landed, recording fresh request IDs and confirming both envs still return `safe-fallback`.
- Confirmed with `printenv EXPO_TOKEN` and `eas whoami` that Expo auth is still the first iOS release blocker, so no remote build or submit IDs were created this pass.

## Actions taken on 2026-04-02

- Added a checked-in local Expo module at `expo/modules/guidepup-navigation-core` for the first native iOS navigation seam.
- Implemented `GuidePupNavigationCore` on iOS with native camera-session ownership, frame capture, accessibility announcement bridging, and haptic hooks.
- Updated the JS boundary so `NavigationScreen` can start/stop a native session, capture frames through the native core, and fall back to the existing JS camera path when the module is unavailable.
- Added diagnostics for native-module availability, native session state, capture latency, total guidance-loop latency, and `native-core` vs `js-fallback` execution path.
- Added `expo/app.config.ts` so local prebuild uses syntactically valid dev bundle/package identifiers without replacing the unresolved release identifiers in launch docs.
- Ran `npx expo config --type public` successfully with the new dynamic config.
- Ran `npx expo-modules-autolinking search --platform apple` and `resolve --platform apple`; both confirmed `guidepup-navigation-core` resolves to the local Expo module and iOS podspec.
- Ran `npx expo prebuild --platform ios --no-install` successfully and generated `expo/ios/GuidePupVisionAssistant.xcodeproj`.
- Ran `xcodebuild -project GuidePupVisionAssistant.xcodeproj -list` successfully and confirmed the `GuidePupVisionAssistant` scheme exists.
- Ran `pod install` in `expo/ios`; it failed on CocoaPods CDN TLS validation: `SSL_connect returned=1 ... certificate verify failed (unable to get local issuer certificate)`.
- Ran `xcodebuild -project GuidePupVisionAssistant.xcodeproj -scheme GuidePupVisionAssistant -configuration Debug -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`; it failed at `[CP] Check Pods Manifest.lock` because `pod install` did not complete and no `Podfile.lock` was produced.

## Actions taken on 2026-04-03

- Reproduced the CocoaPods TLS failure locally and confirmed it was machine-local Homebrew Ruby/OpenSSL trust, not a repo `Podfile` issue.
- Fixed the local trust store by restoring Homebrew OpenSSL's missing `cert.pem`, then re-ran `pod install` successfully and generated `expo/ios/Podfile.lock`.
- Fixed ARC-invalid manual `CFRetain` / `CFRelease` calls in `GuidePupCameraSessionController.swift`, which were blocking native iOS compilation.
- Built the prebuilt iOS app successfully for the `iPhone 16e` simulator in both Debug and Release; Release required `SENTRY_DISABLE_AUTO_UPLOAD=true` because local Sentry org/project values were not configured on this machine.
- Installed and launched the Release simulator app successfully.
- Reached the hidden Diagnostics screen in the running simulator app and confirmed the runtime native seam is linked:
  - Native module available: `yes`
  - Execution path: `js-fallback`
  - Native session active: `yes`
  - Last capture latency: `5ms`
  - Last analyze latency: `11ms`
  - Last total guidance loop latency: `20ms`
- Fixed a runtime semantics bug where diagnostics treated "camera hardware unavailable" as "native module unavailable", and added a narrower capture fallback so native capture failures can fall back to the existing JS `CameraView` path.
- Confirmed the app still launches and the hidden diagnostics route still works after the runtime fix.

## Actions taken on 2026-04-06

- Added a checked-in local Expo module at `expo/modules/guidepup-voice-control` for the first bounded hands-free command lane.
- Added `GuidePupVoiceControl` as a JS-facing boundary with native iOS speech-permission, speech-recognition, speech-synthesis, and command-session hooks, while preserving a JS `expo-speech` fallback when the native module is unavailable.
- Added a deterministic command parser for `start guidance`, `stop guidance`, `repeat`, `help`, `slower speech`, `faster speech`, `more detail`, `less detail`, `haptics on`, `haptics off`, `status`, and `what do you see`.
- Added voice-driven settings changes for speech rate, detail level, and haptics, persisting them through the existing `@guidepup:settings` storage path.
- Added voice diagnostics for native module availability, execution path, microphone permission, speech-recognition permission, listening state, last recognized command, and last voice-module error.
- Re-ran `pod install` successfully after adding the new voice module; CocoaPods now installs `GuidePupVoiceControl (1.0.0)` and keeps `expo/ios/Podfile.lock` current.
- Ran `npm run typecheck`, `npm run lint`, `npx expo config --type public`, `npx expo-modules-autolinking search --platform apple`, and `npx expo-modules-autolinking resolve --platform apple`; all succeeded with the new voice module linked.
- Built the prebuilt iOS app successfully for the `iPhone 16e` simulator in `Release` with `SENTRY_DISABLE_AUTO_UPLOAD=true`; the app installed and launched in the simulator.
- The same simulator build in `Debug` still fails at link time on pre-existing React Native new-architecture symbols; the current blocker is not inside `GuidePupVoiceControl`.
- Runtime evidence from the simulator:
  - The app launches to the existing JS screens with the new native voice module linked.
  - The home screen triggers the real iOS microphone-permission prompt, proving the native voice boundary is loaded and executed at runtime.
  - The existing Settings screen remains reachable after the voice integration.
- Runtime evidence still missing:
  - End-to-end recognized voice commands through live speech recognition.
  - Audible spoken confirmations from the native speech path.
  - Native haptic confirmation on device hardware.
  - End-to-end spoken settings persistence validated through real recognition.
  - Real-device validation for microphone, speech recognition, VoiceOver announcements, and haptics.

## Actions taken on 2026-04-07

- Re-validated the current iOS blind-user spike after commit `24f6b2c` with `npm run typecheck`, `npm run lint`, and `npx expo config --type public`; all passed.
- Confirmed the physical validation target is still unavailable on this machine: `xcrun xctrace list devices` reports `charlie的iPhone (26.2.1) (00008130-000A001A1178001C)` under `Devices Offline`.
- Hardened the JS-to-native seam so blind-user control does not break when native helpers reject:
  - `GuidePupNavigationCore.announce()` now falls back to the JS accessibility announce path if the native bridge throws.
  - `GuidePupNavigationCore.playHaptic()` now falls back to Expo haptics if the native bridge throws.
  - Home and navigation voice-session startup now catch native voice startup failures and record a clean `js-fallback` diagnostics state instead of leaving an unhandled rejection.
  - Navigation now downgrades cleanly from `native-core` capture to the existing JS camera fallback if native capture fails before a `CameraView` ref is ready.
- No fresh real-iPhone runtime evidence was created in this pass because the only attached iPhone remained offline. The latest runtime evidence is still the simulator-linked validation recorded on `2026-04-03` and `2026-04-06`.

## Actions taken on 2026-04-09

- Re-checked real-device visibility before any more blind-user validation.
- `xcrun xctrace list devices` still reports `charlie的iPhone (26.2.1) (00008130-000A001A1178001C)` under `Devices Offline`.
- `xcrun devicectl list devices` reports the same phone as `unavailable` with hostname `charliedeiPhone.coredevice.local`.
- `xcrun xcdevice list` returns the concrete deviceprep failure for the iPhone:
  - code: `-27`
  - domain: `com.apple.dt.deviceprep`
  - description: `Browsing on the local area network for charlie的iPhone`
  - recovery suggestion: `Ensure the device is unlocked and attached with a cable or associated with the same local area network as this Mac. The device must be opted into Developer Mode to connect wirelessly.`
- `system_profiler SPUSBDataType` shows no connected iPhone on the USB bus on this Mac, so there is no active wired debugging path right now.
- Because the device is unavailable before app launch, no fresh real-iPhone runtime evidence was created in this pass for:
  - native voice recognition end-to-end
  - spoken settings changes through live speech input
  - `stop guidance` / `repeat` by real voice
  - VoiceOver announcement behavior on hardware
  - hardware haptics
  - native camera capture on device

## Blockers

- iOS bundle identifier is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet and staging deploy verification now fails before deploy.
- Production `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet and production deploy verification now fails before deploy. Without a real provider key or a fully configured AI Gateway path, the production backend only returns the safe `STOP` fallback instead of real scene guidance.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
- Real device validation has not happened yet, so native frame capture, VoiceOver announcement delivery, and haptic delivery are still unverified on actual iPhone hardware.
- The simulator run currently reports `execution path: js-fallback`, which is expected for this pass; the native module is linked, but native frame capture on simulator remains unverified because there is no reliable simulator back-camera path for this spike.
- The immediate blocker for real blind-user validation is the offline device state from `xcrun xctrace list devices`; until the iPhone reconnects, the branch cannot prove end-to-end spoken commands, spoken settings persistence, hardware haptics, or VoiceOver announcement behavior on real hardware.
- The concrete 2026-04-09 blocker is `com.apple.dt.deviceprep` error `-27`: Xcode can only browse for the iPhone over the local network, and there is no active USB connection visible on this Mac. Real blind-user validation cannot proceed until the phone is unlocked, trusted, Developer Mode-enabled, and either connected by cable or reachable on the same LAN for wireless debugging.
