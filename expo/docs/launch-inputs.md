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
- iOS bundle identifier: `dev.guidepup.visionassist`
- Apple Team ID: `SBSJ3MX9GZ`

## Unresolved Inputs

- Android application id / package: `TODO_ANDROID_PACKAGE`
- App Store Connect App ID: `TODO_APP_STORE_CONNECT_APP_ID`
- Website URL override / custom domain: optional
- Privacy policy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Derived safety URL: `${WEBSITE_URL}/safety`
- Support email: `TODO_SUPPORT_EMAIL`
- Copyright holder: `TODO_COPYRIGHT_HOLDER`
- Emergency / safety disclaimer final copy: `TODO_EMERGENCY_SAFETY_DISCLAIMER`
- Preview API base URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- Staging bootstrap secret: configured as a Wrangler secret on `2026-04-01`
- Staging provider key: `OPENAI_API_KEY` still missing
- Production Sentry DSN: optional, currently blank
- Sentry release upload credentials: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Production backend bootstrap secret: configured as a Wrangler secret on `2026-04-01`
- Production backend provider key: `OPENAI_API_KEY`

## Identifier Evidence

- iOS bundle identifier `dev.guidepup.visionassist` is present in `expo/app.config.ts`, the generated native Xcode project `PRODUCT_BUNDLE_IDENTIFIER`, and the iOS URL schemes in `Info.plist`.
- Apple Team ID `SBSJ3MX9GZ` is present in the local Apple Development signing identity `Apple Development: XIANMIN CHEN (SBSJ3MX9GZ)`.
- App Store Connect was checked in the side-panel browser on 2026-05-23, but it redirected to Apple sign-in. The App Store Connect App ID still requires Apple login / 2FA or a value from Charlie.

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
- App Store Connect App ID
- Production API base URL
- Production Sentry DSN

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
- Anonymous device/session bootstrap is used for authenticated vision requests.
- Optional crash reporting may be enabled in release builds.
- The app degrades to `STOP` on invalid or unavailable vision responses.

## Finalize Order

1. Fill the unresolved inputs above.
2. Run `npm run release:preflight:preview`, `npm run release:preflight:testflight`, and `npm run release:preflight:store` from `expo/` and clear every failure for the target track.
3. Verify the public URLs in App Review notes, `store.config.js`, and the app info screens.
4. Confirm preview stays on staging while TestFlight/store target the production API URL.
5. Push App Store metadata with `npx eas-cli metadata:push --profile store`.
6. Run the internal preview build, then the true TestFlight build, then submit the TestFlight build.
7. Run the final `store` build only when you are ready for App Store submission.
