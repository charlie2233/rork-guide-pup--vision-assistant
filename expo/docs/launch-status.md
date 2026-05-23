# Guide Pup Launch Status

Last updated: 2026-05-23

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
- iOS bundle identifier: `app.rork.guide-pup-vision-assist`
- Apple Team ID: `SBSJ3MX9GZ`
- App Store Connect App ID: `6756947790`
- Expo auth status:
  - `printenv EXPO_TOKEN`: empty
  - `npx --yes eas-cli whoami`: `Not logged in`
- Current preflight results:
  - `preview`: no longer blocked by the iOS bundle identifier; staging smoke still warns until it proves `gpt-5.5`, `2026-05-22.v1`, sampled-frame envelope fields, and nullable `fallbackReason`
  - `testflight`: still blocked by `TODO_COPYRIGHT_HOLDER`, unresolved support email and emergency/safety disclaimer, stale production smoke contract, missing no-screen evidence, and missing Sentry env
  - `store`: still blocked by `TODO_COPYRIGHT_HOLDER`, unresolved support email and emergency/safety disclaimer, stale production smoke contract, missing no-screen evidence, and missing Sentry env
- Current Expo command results:
  - `npx --yes eas-cli whoami`: blocked immediately because Expo auth is missing
  - Preview/TestFlight build and submit were not attempted after the auth check because the first real Expo blocker was already hit
- Latest local validation on 2026-05-23:
  - `npx expo config --type public` shows `ios.bundleIdentifier: app.rork.guide-pup-vision-assist`
  - `npm run release:preflight:preview`: passed with warnings for stale staging smoke, missing no-screen evidence, and missing Sentry env
  - `npm run release:preflight:testflight`: failed on copyright holder, support email, emergency/safety disclaimer, stale production smoke contract, missing no-screen evidence, and missing Sentry env
  - `npm run release:preflight:store`: failed on the same store-backed blockers as TestFlight
  - Strict staging smoke wrote fresh `/tmp` artifacts and exited nonzero as intended because the live Worker is still stale for the launch contract
  - Strict production smoke wrote fresh `/tmp` artifacts and exited nonzero as intended because the live Worker is still stale for the launch contract
  - Build iOS Apps plugin Release simulator build passed for `GuidePupVisionAssistant` on `iPhone 16e`

## Strict smoke command update on 2026-05-23

- `npm --prefix backend/guidepup-api run smoke:staging` and `smoke:production` now write evidence first, then fail if the smoke artifact is not launch-valid.
- Fresh strict staging request IDs: `/health` `d8e0a68d-74d8-4214-bad4-8288dfe885b7`, `/v1/device/bootstrap` `f0e42eec-5732-4288-af55-d0dd34f28bc1`, `/v1/vision/analyze` `fec32c44-691c-4e9a-92fc-2b891316fd65`.
- Fresh strict production request IDs: `/health` `6b849601-987f-4ab2-b9af-682533fb67e7`, `/v1/device/bootstrap` `658e9b09-49d6-4272-a62c-ef377dec94b2`, `/v1/vision/analyze` `4e436b40-8cb4-424d-9bcc-7cac46b72660`.
- Both strict runs remained provider-backed but launch-invalid on stale `gpt-4.1` / `2026-03-31.v1`, missing runtime-control health fields, and missing structured `walkability` / `fallbackReason`.

## Public site copy update on 2026-05-23

- Removed launch-internal wording from the public home, support, and safety pages.
- Re-ran `npm --prefix expo run release:preflight:testflight`; the previous support-page placeholder phrase failures are gone.
- The support page still cannot be considered App Store-ready until the real support email is provided in `expo/release/launch-inputs.js`.

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
  - `No profiles for 'dev.guidepup.visionassist' were found: Xcode couldn't find any iOS App Development provisioning profiles matching the old local bundle identifier.`
- Rechecked EAS auth with `npx --yes eas-cli whoami`; it still returns `Not logged in`, so an EAS installable build link cannot be created from this machine yet.

## Blockers

- iOS bundle identifier is resolved to the App Store Connect bundle ID `app.rork.guide-pup-vision-assist`.
- Apple Team ID is resolved to `SBSJ3MX9GZ`; App Store Connect App ID is resolved to `6756947790`.
- Store copyright holder is still unresolved.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
- Real device app install has not happened yet, so native frame capture, VoiceOver announcement delivery, and haptic delivery are still unverified on actual iPhone hardware.
- The simulator run currently reports `execution path: js-fallback`, which is expected for this pass; the native module is linked, but native frame capture on simulator remains unverified because there is no reliable simulator back-camera path for this spike.
- The immediate blocker for real blind-user validation is Apple signing/provisioning for the connected iPhone: Xcode needs a signed-in account for team `SBSJ3MX9GZ` and an iOS App Development provisioning profile for `app.rork.guide-pup-vision-assist`.

## Actions taken on 2026-05-23

- Confirmed App Store Connect identifiers from the logged-in app record:
  - Apple/App Store Connect app ID: `6756947790`
  - Bundle ID: `app.rork.guide-pup-vision-assist`
  - SKU: `EX1766553072106`
  - Category: `Navigation`
- Retried the real-device path after `charlie的iPhone` was wired and unlocked:
  - `xcrun devicectl device info ddiServices --device E5786BB6-0095-5509-8B85-110C0B5CE6D3` now succeeds and reports the developer disk image `isUsable: true`.
  - `npm --prefix expo run check:ios-device` now returns `READY`; it reports DDI services available, tunnel connected, USB present, xctrace visibility, and Xcode destination visibility. The script now treats that JSON-only execution-ready state as ready even when the devicectl table state is `unknown`.
  - The signed Release device build now stops at Apple account/provisioning, not device connectivity: Xcode reports no configured accounts and no iOS App Development provisioning profile for `app.rork.guide-pup-vision-assist`.
- Real iPhone no-screen validation is still not complete because the app has not been installed/launched on the physical device.

## Actions taken on 2026-05-22

- Re-ran live staging smoke:
  - `/health`: `200 OK`, request ID `1135d81c-65d5-4910-af55-ec9ed7932869`
  - `/v1/device/bootstrap`: `200 OK`, request ID `6985c962-725b-4305-b316-2e923adb2bd8`
  - `/v1/vision/analyze`: `200 OK`, request ID `372a702d-de22-4df9-ad74-19ef7d8b7de3`
  - provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
  - execution path: `provider-backed`
- Re-ran live production smoke:
  - `/health`: `200 OK`, request ID `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
  - `/v1/device/bootstrap`: `200 OK`, request ID `bc18b829-1200-4bee-a9f0-839010435a5a`
  - `/v1/vision/analyze`: `200 OK`, request ID `09ff3bf0-1ab7-4fdd-a525-4007328cc731`
  - provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
  - execution path: `provider-backed`
- Prepared the Worker code for strict JSON Schema Structured Outputs, compact frame context, `fallbackReason`, `gpt-5.5`, low reasoning effort, and prompt version `2026-05-22.v1`.
- Confirmed the new Worker contract has not been deployed yet because this shell lacks Cloudflare auth: `CLOUDFLARE_API_TOKEN` is missing and `npx wrangler whoami` reports `Not logged in`.
- Rechecked physical iPhone status:
  - `charlie的iPhone` is paired and Developer Mode is enabled, but Xcode reports it unavailable/offline.
  - `xcrun xcdevice list` reports deviceprep code `-27` with LAN/cable recovery guidance.
  - `system_profiler SPUSBDataType` does not show the iPhone on the USB bus.
- Re-ran `npm run release:preflight:preview`; it remains blocked by unresolved `TODO_IOS_BUNDLE_IDENTIFIER`.
- Re-ran `npm run release:preflight:testflight`; it remains blocked by unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`.

## Actions taken on 2026-05-23 final launch recheck

- Re-ran `npm --prefix expo run release:preflight:preview`; it passed with warnings for stale staging smoke, missing launch-contract/sampled-frame/runtime/structured evidence, missing no-screen evidence, and missing Sentry env.
- Re-ran `npm --prefix expo run release:preflight:testflight`; it failed on unresolved copyright holder, support email, emergency/safety disclaimer, public support contact readiness, stale production smoke, missing launch-contract/sampled-frame/runtime/structured evidence, and missing real-iPhone no-screen evidence.
- Re-ran `npm --prefix expo run check:ios-device`; it reports `charlie的iPhone` is paired with Developer Mode enabled, but currently CoreDevice state is `unavailable`, DDI services are unavailable, the tunnel is unavailable, USB is not present, and Xcode destination visibility is `no`.
- Re-ran the staging Worker dry-run; it passed locally and still shows the intended launch values `gpt-5.5`, prompt `2026-05-22.v1`, and bounded runtime controls, but Wrangler auth is missing so nothing was deployed.
- Re-ran `npx --yes wrangler whoami` and `npx --yes eas-cli whoami`; both returned `Not logged in`.
- Submission remains blocked. Main was not merged because the required real-iPhone smoke, provider-backed launch smoke, EAS/TestFlight auth, Sentry env, and final store metadata are not complete.

## Actions taken on 2026-05-23 App Review metadata gate

- Added App Review metadata to `expo/store.config.js` so EAS Metadata can push `apple.review.demoRequired: false` when auth is available.
- Added release-preflight checks for App Review contact first name, last name, email, phone, no demo credentials, and review notes that explicitly state Guide Pup does not require account sign-in.
- This addresses the local source-of-truth gap for the App Store Connect sign-in-required checkbox, but EAS/App Store auth is still required before the dashboard can be updated.
- Preview preflight still passes with warnings. TestFlight/store preflight now also fail on unresolved App Review contact fields, as intended.

## Actions taken on 2026-05-23 no-screen evidence and scene-query gate

- Tightened `expo/release/no-screen-smoke.latest.json` validation so the required no-screen sequence must appear in the exact P0 order, not merely as an unordered set of passed steps.
- Updated Navigation scene-query speech so the final `what do you see` answer can interrupt the interim analyzing prompt and keep STOP barge-in armed when guidance is active and the spoken answer is safe for recognition overlap.
- Added static contract coverage for both behaviors.
- Validation passed: no-screen smoke contract, voice command contract, no-screen evidence tests, Expo typecheck, Expo lint, release preflight preview expected-pass, release preflight TestFlight expected-fail, and Build iOS Apps Release simulator build.

## Actions taken on 2026-05-22

- Hardened the Xcode simulator validation path after the Build iOS Apps plugin reached the native build but failed in Sentry upload before app validation.
- Added a simulator-only Sentry upload guard to `expo/ios/.xcode.env`:
  - `SENTRY_DISABLE_AUTO_UPLOAD=true`
  - `SENTRY_ALLOW_FAILURE=true`
- This guard applies only when `PLATFORM_NAME` contains `simulator`, so device/archive/TestFlight builds still require the real Sentry release environment for symbol/source-map upload.
- Re-ran Build iOS Apps plugin Release simulator build after the guard; it passed for the `iPhone 16e` simulator.
- Tightened release preflight so provider-backed smoke is not considered launch-valid unless the live Worker also proves the expected `gpt-5.5` model, `2026-05-22.v1` prompt version, sampled-frame envelope, structured output validity, and nullable `fallbackReason`.
- Hardened no-screen voice flows locally:
  - Repeated identical spoken commands are only suppressed inside a short duplicate-recognition window.
  - The native voice controller clears its transcript de-dupe state on command-session start/stop.
  - `what do you see` no longer reuses stale scene text and now speaks a deterministic "already analyzing" response instead of promising a scene query that cannot start.
  - Microphone, speech-recognition, and camera permission denial paths now speak short no-screen fallbacks.
  - The placeholder SOS copy no longer claims emergency services are connected.
- Reconfirmed Cloudflare remains blocked locally: `npx wrangler whoami` reports `Not logged in`.
- Reconfirmed this shell still lacks `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN`.
- Hugging Face connector is authenticated as `Chargers`; no MiniCPM/GPT comparison was run in this pass.
