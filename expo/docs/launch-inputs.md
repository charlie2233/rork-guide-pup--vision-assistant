# Guide Pup Launch Inputs

This doc mirrors the machine-readable release source of truth in [../release/launch-inputs.js](../release/launch-inputs.js).
Update that file first, then mirror the same values here for reviewer-facing docs.

## Resolved Today

- App name: `Guide Pup: Vision Assistant`
- Expo slug: `guide-pup-vision-assist`
- Expo scheme: `guidepup`
- Package name: `guidepup-app`
- Production path: onboarding, home, navigation, settings
- Experimental tabs: disabled in shipping builds
- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- App Store profile: `store`
- Store-upload iOS image: `macos-sequoia-15.6-xcode-26.2`
- Metadata config path: `expo/store.config.js`
- Public site base URL: `https://guidepup-site.pages.dev`
- Staging API base URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- Production API base URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- Production Worker name: `guidepup-api-production`
- iOS bundle identifier: `app.rork.guide-pup-vision-assist`
- Apple Team ID: `K99RADPB9G`
- App Store Connect App ID: `6756947790`
- iOS marketing version / App Store version record: `1.0.0`
- Explicit local iOS distribution candidate: `4`
- EAS app version source: `local`; preview/TestFlight/store auto-increment: `false`
- App Review sign-in required / demo account required: `false`
- Copyright: `2026 XIANMIN CHEN`
- App Review contact: `XIANMIN CHEN`; email `charliehan112@gmail.com`; phone configured from the authenticated Individual membership record
- Sentry mode: `disabled`; no client SDK vendored
- Support email: `charliehan112@gmail.com`
- Emergency / safety disclaimer: `Guide Pup provides assistive guidance, not guaranteed hazard detection or emergency response. If the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient. If you are in immediate danger, stop using the app and contact local emergency services or nearby people directly.`

## External Revalidation And Optional Inputs

- Android application id / package: `TODO_ANDROID_PACKAGE`
- Website URL override / custom domain: optional
- Privacy policy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Derived safety URL: `${WEBSITE_URL}/safety`
- Preview API base URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`; deploy and smoke the current source before launch
- Staging bootstrap secret: last verified configured as a Wrangler secret on `2026-04-01`; current presence requires authenticated revalidation
- Staging provider key: `OPENAI_API_KEY` was last verified configured by a provider-backed smoke on `2026-04-29`; current presence requires authenticated revalidation
- Production Sentry DSN: blank; the launch client contains no Sentry SDK
- Production backend bootstrap secret: last verified configured as a Wrangler secret on `2026-04-01`; current presence requires authenticated revalidation
- Production backend provider key: `OPENAI_API_KEY` was last verified configured by a provider-backed smoke on `2026-04-29`; current presence requires authenticated revalidation

## Identifier Evidence

- App Store Connect App Information was verified in the side-panel browser on 2026-05-23 and shows bundle ID `app.rork.guide-pup-vision-assist`, SKU `EX1766553072106`, Apple ID `6756947790`, and primary category `Navigation`.
- iOS bundle identifier `app.rork.guide-pup-vision-assist` is present in `expo/app.config.ts`, `expo/app.json`, the native Xcode project `PRODUCT_BUNDLE_IDENTIFIER`, and the iOS URL schemes in `Info.plist`.
- Active Apple Team ID `K99RADPB9G` was verified in the authenticated Apple Developer portal on 2026-07-17. The old local identity for `SBSJ3MX9GZ` is historical evidence and is not current release configuration.
- The authenticated App Store Connect distribution record remains version `1.0.0` and `Prepare for Submission` on 2026-07-19. Its only TestFlight build is expired build `2`, so app, native configuration, and release inputs use version `1.0.0` and build `4` as the next explicit candidate. No build `4` upload or submission occurred.
- The current Apple Distribution identity is `XIANMIN CHEN (K99RADPB9G)`. The bundle's App Store provisioning profile was renewed on 2026-07-19 against that identity, installed as UUID `808b8553-e7b4-495f-83cd-4eae9f8420db`, expires 2027-07-19, and has distribution entitlements (`get-task-allow=false`).
- Historical builds contained a dormant Sentry wrapper. The current launch source removes the SDK, Expo plugin, pods, native wrapper, and upload phase instead of relying on a disabled runtime.
- The prior signed-device baseline reports `TeamIdentifier` `K99RADPB9G`, application-identifier prefix `K99RADPB9G`, bundle `app.rork.guide-pup-vision-assist`, version `1.0.0`, and build `3`. It installed, launched, and remained running on the paired iPhone. This does not establish build `4`, voice, haptic, earcon, VoiceOver, interruption, settings-persistence, camera, no-screen, TestFlight, or submission behavior.
- App Review sign-in required must be false because Guide Pup uses an installation-scoped identifier and session bootstrap with no account flow. `store.config.js` now carries `apple.review.demoRequired: false`, and release preflight rejects demo credentials for this shipping path.
- The Apple Developer membership is enrolled as Individual under `XIANMIN CHEN`. Its authenticated membership phone and the user-provided support email resolve the App Review contact. On 2026-07-19 App Store Connect saved `2026 XIANMIN CHEN`, manual release, the no-sign-in selection, contact fields, and review notes. Recheck them after attaching the candidate build.
- Sentry mode is explicit in `expo/release/launch-inputs.js`. While it is `disabled`, preflight requires the client dependency, plugin, pods, upload phase, DSN variables, framework/bundle payload, and Crash Data manifest declaration to be absent. Reintroducing crash reporting requires a deliberate new source/binary and privacy review.

## Final Values To Mirror

When Charlie fills these in, mirror the same value in the matching release docs and build config:

- App name
- Expo slug
- Expo scheme
- Android package name
- Website URL or custom domain
- Privacy policy URL
- Support URL
- Support email
- Copyright holder
- Emergency / safety disclaimer copy
- App Review contact name, email, and phone
- Production API base URL
- Crash-reporting SDK and privacy disclosures, only if diagnostics are introduced later

## Public URL Mapping

If the public site is deployed at one base URL, the app and store config can derive:

- Privacy policy: `${WEBSITE_URL}/privacy`
- Support page: `${WEBSITE_URL}/support`
- Safety page: `${WEBSITE_URL}/safety`

Override the individual URLs only if they live somewhere else.

## Release Notes

- Camera frames are sent to the backend and may be processed by third-party AI providers.
- Optional voice commands request microphone and iOS speech-recognition access for a bounded command set.
- Raw voice audio is not intentionally logged or sent to AI providers by Guide Pup.
- An installation-scoped identifier and session bootstrap are used for authenticated vision requests.
- The launch iOS client contains no crash-reporting SDK. Adding one later requires a new binary and App Privacy review.
- The app degrades to `STOP` on invalid or unavailable vision responses.

## Finalize Order

1. Resolve the optional input and revalidate the external credentials above.
2. Run `npm run release:preflight:preview`, `npm run release:preflight:testflight`, and `npm run release:preflight:store` from `expo/` and clear every failure for the target track.
3. Verify the public URLs in App Review notes, `store.config.js`, and the app info screens.
4. Confirm preview stays on staging while TestFlight/store target the production API URL.
5. Push App Store metadata with EAS only if that authenticated path is selected; otherwise persist the same values directly in App Store Connect.
6. Archive, inspect, upload, and validate build `4` in TestFlight.
7. Attach the validated build and submit only after cloud, real-iPhone, screenshots, privacy, and metadata gates all pass.
