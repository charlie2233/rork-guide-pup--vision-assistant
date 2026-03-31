# Guide Pup

Guide Pup is an Expo / React Native navigation prototype for blind and low-vision users. The production path for v1 is now:

1. Onboarding
2. Home
3. Navigation
4. Settings

The creative capture / inspiration tabs remain in the repo as experimental surfaces and are hidden by default.

## Launch Inputs

The unresolved launch values are centralized in [Launch Inputs](./docs/launch-inputs.md). Update that file first when finalizing the app identity, public URLs, and submission metadata.

## Architecture

- `expo/` is the shipping client.
- `backend/guidepup-api/` is the Cloudflare Worker API for device bootstrap and vision analysis.
- The Expo client sends compressed camera frames to the backend instead of calling model providers directly.
- The backend applies provider normalization and safety overrides before returning guidance.

## Observability

- `@sentry/react-native` `8.6.0` is the pinned SDK.
- This SDK supports official React Navigation route tracking through `reactNavigationIntegration()` plus the Expo Router navigation container ref.
- `wrapExpoRouter()` in this SDK only instruments `prefetch()` spans; it does not replace route tracking.
- The app keeps privacy scrubbing enabled and disables Sentry cleanly when `EXPO_PUBLIC_SENTRY_DSN` is not set.

## Expo setup

```bash
cd expo
npm install
cp .env.example .env
```

Required Expo env vars:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS`

Optional Expo env vars:

- `EXPO_PUBLIC_API_TIMEOUT_MS`
- `EXPO_PUBLIC_SENTRY_DSN`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_SUPPORT_URL`
- `EXPO_PUBLIC_EMERGENCY_DISCLAIMER`

Sentry release env vars:

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

The Expo config plugin is enabled in `app.json`. For EAS Build, Sentry uploads source maps during the native build when the release env vars are present. If OTA updates are introduced later, publish the update and then run `npm run sentry:upload-sourcemaps:update` against the generated `dist/` folder.

Run locally:

```bash
npm run start
npm run start:ios
npm run start:android
npm run start:web
npm run start:tunnel
```

## Backend setup

```bash
cd backend/guidepup-api
npm install
cp .env.example .dev.vars
npm run types
npm run dev
```

Required backend secrets / vars:

- `OPENAI_API_KEY`
- `BOOTSTRAP_SIGNING_SECRET`

Recommended backend vars:

- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `VISION_PROVIDER`
- `RATE_LIMIT_PER_MINUTE`
- `SESSION_TTL_SECONDS`
- `CORS_ORIGIN`
- `SENTRY_DSN`

Optional provider / gateway vars:

- `AI_GATEWAY_BASE_URL`
- `AI_GATEWAY_API_KEY`
- `HUGGINGFACE_MINICPM_O_BASE_URL`
- `HUGGINGFACE_MINICPM_O_API_KEY`
- `HUGGINGFACE_MINICPM_O_MODEL`

## Build and deploy

### Backend

```bash
cd backend/guidepup-api
npm run check
npm run check:staging
npm run deploy:staging
npm run deploy
```

### Expo app

```bash
cd expo
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
```

`expo/eas.json` includes `development`, `preview`, and `production` profiles. The build profiles keep the production path focused on onboarding, home, navigation, and settings, and keep the experimental tabs disabled unless you explicitly override `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS`.
`expo/package.json` also includes `sentry:upload-sourcemaps:update` for OTA release handling if Expo Updates is enabled later.

## iOS submission checklist

Use [this release checklist](./docs/testflight-release-checklist.md) before shipping.

Minimum launch steps:

1. Fill [Launch Inputs](./docs/launch-inputs.md).
2. Build a production binary with EAS and install it on a physical iPhone.
3. Verify the camera permission text and App Store disclosure text.
4. Confirm backend rate limiting, logging, and provider credentials in production.
5. Complete the TestFlight smoke plan from the checklist.

## Safety and release TODOs

- TODO: publish a privacy policy URL and wire it into the app release materials.
- TODO: publish a support URL and wire it into the app release materials.
- TODO: finalize the emergency / safety disclaimer copy with legal review.
- TODO: add App Store metadata copy for camera usage and third-party AI image processing.
- TODO: replace placeholder SOS behavior with a real emergency flow and legal review.
- TODO: if microphone capture is ever added, add the matching permission string and privacy disclosures before shipping.

## Notes

- The client no longer requires provider secrets in public Expo env vars.
- The backend is conservative by design: invalid, low-confidence, or high-hazard outputs degrade to `STOP`.
- Microphone and unnecessary storage permissions were removed from the shipping app config for launch readiness.
- Audio playback remains in the experimental inspiration surface only; the shipping navigation path does not request microphone access.
