# Guide Pup Launch Inputs

This file is the single place to resolve launch identity and release inputs before Charlie finalizes TestFlight and App Store submission.

## Resolved Today

- App name: `Guide Pup: Vision Assistant`
- Expo slug: `guide-pup-vision-assist`
- Expo scheme: `guidepup`
- Production path: onboarding, home, navigation, settings
- Experimental tabs: disabled in shipping builds

## Unresolved Inputs

- iOS bundle identifier: `TODO_IOS_BUNDLE_IDENTIFIER`
- Android application id / package: `TODO_ANDROID_PACKAGE`
- Apple Team ID: `TODO_APPLE_TEAM_ID`
- App Store Connect App ID: `TODO_APP_STORE_CONNECT_APP_ID`
- Privacy policy URL: `TODO_PRIVACY_POLICY_URL`
- Support URL: `TODO_SUPPORT_URL`
- Website URL: `TODO_WEBSITE_URL`
- Support email: `TODO_SUPPORT_EMAIL`
- Emergency / safety disclaimer final copy: `TODO_EMERGENCY_SAFETY_DISCLAIMER`
- Production API base URL: `EXPO_PUBLIC_API_BASE_URL`
- Production Sentry DSN: `EXPO_PUBLIC_SENTRY_DSN`
- Sentry release upload credentials: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`

## Release Notes

- The shipping client does not request microphone access.
- Camera frames are sent to the backend and may be processed by third-party AI providers.
- Anonymous device/session bootstrap is used for authenticated vision requests.
- Optional crash reporting may be enabled in release builds.
- The app degrades to `STOP` on invalid or unavailable vision responses.

## Finalize Order

1. Fill the unresolved inputs above.
2. Verify the public URLs in App Review notes and the app info screens.
3. Confirm the App Store Connect metadata and submission placeholders.
4. Re-run the preview build, then the production build, then submit to TestFlight.
