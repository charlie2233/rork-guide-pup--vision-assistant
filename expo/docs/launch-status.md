# Guide Pup Launch Status

Last updated: 2026-04-29

## Public site

- Pages project: `guidepup-site`
- Live URL: `https://guidepup-site.pages.dev`
- Privacy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Safety URL: `https://guidepup-site.pages.dev/safety`

## Staging backend

- Worker env: `staging`
- Live API URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- Current Worker version: `eafec4a6-c543-4406-9c13-d23077034321`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: set as a Wrangler secret on `2026-04-29`
- Required-secret gate:
  - `npm run verify:secrets:staging`: passes
- Latest smoke run:
  - `/health`: `200 OK`, request ID `c9aa8993-902d-4dd8-9f58-92006449dd24`
  - `/v1/device/bootstrap`: `200 OK`, request ID `2b3dde3a-4543-489a-88e2-f672faf5b3d7`
  - `/v1/vision/analyze`: `200 OK`, request ID `1641e817-2f16-40ad-9167-82832db82c9e`
- Analyze result: provider-backed response from `openai-compatible` / `gpt-4.1-2025-04-14`, prompt version `2026-03-31.v1`, provider latency `1989ms`, round-trip latency `2715ms`
- Latest machine artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.json`
- Latest markdown artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.md`

## Production backend

- Worker env: `production`
- Live API URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- Current Worker version: `3bcc4095-53d2-4bf3-a5a2-5fee367f8a7d`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: set as a Wrangler secret on `2026-04-29`
- Required-secret gate:
  - `npm run verify:secrets:production`: passes
- Latest smoke run:
  - `/health`: `200 OK`, request ID `e46ed2f5-0bd1-48bb-ab37-2c95f0f28821`
  - `/v1/device/bootstrap`: `200 OK`, request ID `6dafa3da-9abb-4c4d-b9c3-4669c924a056`
  - `/v1/vision/analyze`: `200 OK`, request ID `cebf5445-7923-4a87-8953-124f824914ef`
- Analyze result: provider-backed response from `openai-compatible` / `gpt-4.1-2025-04-14`, prompt version `2026-03-31.v1`, provider latency `3076ms`, round-trip latency `3822ms`
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
  - `preview`: still blocked by `TODO_IOS_BUNDLE_IDENTIFIER`; staging smoke is now provider-backed
  - `testflight`: still blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`; production provider-backed smoke gate is now satisfied
  - `store`: still blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`; production provider-backed smoke gate is now satisfied
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
- Re-ran `pod install` in `expo/ios`; it still completes successfully on this machine with `Pod installation complete! There are 102 dependencies from the Podfile and 110 total pods installed.`
- Re-launched the currently installed simulator app on `iPhone 16e` and confirmed the existing runtime shell is still reachable:
  - the Home screen still renders the large `Start Guidance` affordance and the visible `Settings` fallback button
  - navigation mode can still be entered in the simulator without changing the backend request/response contract
- Because the device is unavailable before app launch, no fresh real-iPhone runtime evidence was created in this pass for:
  - native voice recognition end-to-end
  - spoken settings changes through live speech input
  - `stop guidance` / `repeat` by real voice
  - VoiceOver announcement behavior on hardware
  - hardware haptics
  - native camera capture on device

## Actions taken on 2026-04-29

- Set `OPENAI_API_KEY` as a Wrangler secret for both `staging` and `production`.
- Re-ran `npm run verify:secrets:staging`; it passed for `BOOTSTRAP_SIGNING_SECRET` and `OPENAI_API_KEY`.
- Re-ran `npm run verify:secrets:production`; it passed for `BOOTSTRAP_SIGNING_SECRET` and `OPENAI_API_KEY`.
- Re-ran `npm run smoke:staging`; staging `/v1/vision/analyze` returned `200 OK` with provider-backed execution.
- Re-ran `npm run smoke:production`; production `/v1/vision/analyze` returned `200 OK` with provider-backed execution.
- Upgraded the default OpenAI-compatible shipping model from `gpt-4.1-mini` to `gpt-4.1` in `wrangler.jsonc`, regenerated Worker types, and deployed the change to staging and production.
- Latest staging provider-backed evidence:
  - Worker version: `eafec4a6-c543-4406-9c13-d23077034321`
  - health request ID: `c9aa8993-902d-4dd8-9f58-92006449dd24`
  - bootstrap request ID: `2b3dde3a-4543-489a-88e2-f672faf5b3d7`
  - analyze request ID: `1641e817-2f16-40ad-9167-82832db82c9e`
  - provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
  - provider latency: `1989ms`
  - round-trip latency: `2715ms`
- Latest production provider-backed evidence:
  - Worker version: `3bcc4095-53d2-4bf3-a5a2-5fee367f8a7d`
  - health request ID: `e46ed2f5-0bd1-48bb-ab37-2c95f0f28821`
  - bootstrap request ID: `6dafa3da-9abb-4c4d-b9c3-4669c924a056`
  - analyze request ID: `cebf5445-7923-4a87-8953-124f824914ef`
  - provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
  - provider latency: `3076ms`
  - round-trip latency: `3822ms`
- Reconnected `charlie的iPhone`; `xcrun xcdevice list` reports `available: true`, `interface: usb`, iOS `26.3.1`, and `xcrun devicectl device info details` reports Developer Mode enabled, pairing state `paired`, and transport `wired`.
- Confirmed the Mac has one Apple Development signing identity: `Apple Development: XIANMIN CHEN (SBSJ3MX9GZ)`.
- Attempted a direct signed Release device build with:
  - `SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -destination 'id=00008130-000A001A1178001C' -derivedDataPath /tmp/guidepup-device-build -allowProvisioningUpdates DEVELOPMENT_TEAM=SBSJ3MX9GZ CODE_SIGN_STYLE=Automatic ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build`
- The device install path is now blocked by Apple signing account/provisioning, not by device connectivity:
  - `No Account for Team "SBSJ3MX9GZ". Add a new account in Accounts settings or verify that your accounts have valid credentials.`
  - `No profiles for 'dev.guidepup.visionassist' were found: Xcode couldn't find any iOS App Development provisioning profiles matching 'dev.guidepup.visionassist'.`
- Rechecked EAS auth with `npx --yes eas-cli whoami`; it still returns `Not logged in`, so an EAS installable build link cannot be created from this machine yet.

## Blockers

- iOS bundle identifier is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
- Real device app install has not happened yet, so native frame capture, VoiceOver announcement delivery, and haptic delivery are still unverified on actual iPhone hardware.
- The simulator run currently reports `execution path: js-fallback`, which is expected for this pass; the native module is linked, but native frame capture on simulator remains unverified because there is no reliable simulator back-camera path for this spike.
- The immediate blocker for real blind-user validation is Apple signing/provisioning for the connected iPhone: Xcode needs a signed-in account for team `SBSJ3MX9GZ` and an iOS App Development provisioning profile for `dev.guidepup.visionassist`.
