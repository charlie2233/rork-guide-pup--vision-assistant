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

## Unresolved Inputs

- iOS bundle identifier: `TODO_IOS_BUNDLE_IDENTIFIER`
- Android application id / package: `TODO_ANDROID_PACKAGE`
- Apple Team ID: `TODO_APPLE_TEAM_ID`
- App Store Connect App ID: `TODO_APP_STORE_CONNECT_APP_ID`
- Website URL override / custom domain: optional
- Derived privacy policy URL: `${WEBSITE_URL}/privacy`
- Derived support URL: `${WEBSITE_URL}/support`
- Derived safety URL: `${WEBSITE_URL}/safety`
- Support email: `TODO_SUPPORT_EMAIL`
- Copyright holder: `TODO_COPYRIGHT_HOLDER`
- Emergency / safety disclaimer final copy: `TODO_EMERGENCY_SAFETY_DISCLAIMER`
- Production API base URL: `TODO_PRODUCTION_API_BASE_URL`
- Production Sentry DSN: optional, currently blank
- Sentry release upload credentials: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Backend secrets: `BOOTSTRAP_SIGNING_SECRET`, `OPENAI_API_KEY`

## Final Values To Mirror

When Charlie fills these in, mirror the same value in the matching release docs and build config:

- App name
- Expo slug
- Expo scheme
- iOS bundle identifier
- Android package name
- Website URL or custom domain
- Privacy policy URL
- Support URL
- Support email
- Copyright holder
- Emergency / safety disclaimer copy
- Apple Team ID
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

- The shipping client does not request microphone access.
- Camera frames are sent to the backend and may be processed by third-party AI providers.
- Anonymous device/session bootstrap is used for authenticated vision requests.
- Optional crash reporting may be enabled in release builds.
- The app degrades to `STOP` on invalid or unavailable vision responses.

## Finalize Order

1. Fill the unresolved inputs above.
2. Run `npm run release:preflight` from `expo/` and clear every failure.
3. Verify the public URLs in App Review notes, `store.config.js`, and the app info screens.
4. Push App Store metadata with `npx eas-cli metadata:push --profile store --platform ios`.
5. Run the internal preview build, then the true TestFlight build, then submit the TestFlight build.
6. Run the final `store` build only when you are ready for App Store submission.
