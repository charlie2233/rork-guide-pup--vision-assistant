# Guide Pup

Guide Pup is an Expo / React Native navigation prototype for blind and low-vision users. The production path for v1 is now:

1. Onboarding
2. Home
3. Navigation
4. Settings

The creative capture / inspiration tabs remain in the repo as experimental surfaces and are hidden by default.

## Launch Inputs

The machine-readable release inputs live in [release/launch-inputs.js](./release/launch-inputs.js), with reviewer-facing notes mirrored in [Launch Inputs](./docs/launch-inputs.md).
Update the release file first when finalizing the app identity, public URLs, and submission metadata.

## Architecture

- `expo/` is the shipping client.
- `backend/guidepup-api/` is the Cloudflare Worker API for device bootstrap and vision analysis.
- The Expo client sends compressed camera frames to the backend instead of calling model providers directly.
- The backend applies provider normalization and safety overrides before returning guidance.

## Observability

- The launch iOS client does not vendor a crash-reporting SDK.
- Sanitized local diagnostics remain available for no-screen validation and support export.
- Backend logs retain bounded request, performance, and structured-result metadata without raw images, raw audio, credentials, signed URLs, or installation identifiers.

## Expo setup

```bash
cd expo
npm install
cp .env.example .env
```

Standard Expo dev scripts:

```bash
npm run dev
npm run android
npm run ios
npm run web
```

Native-capable iOS spike:

- `modules/guidepup-navigation-core/` is the local Expo module that now owns the first native camera/accessibility seam.
- `npm run ios` now uses `expo run:ios` against the checked-in `ios/` project.
- `npm run start:ios` still keeps the JS-first Metro/dev-client path available.
- Local native generation command:

```bash
npx expo prebuild --platform ios --no-install
cd ios
pod install
```

- The current CocoaPods install succeeds locally with 99 dependencies and no Sentry pods.

Required Expo env vars:

- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_APP_ENV`
- `EXPO_PUBLIC_RELEASE_TRACK`
- `EXPO_PUBLIC_ENABLE_EXPERIMENTAL_TABS`

Optional Expo env vars:

- `EXPO_PUBLIC_API_TIMEOUT_MS`
- `EXPO_PUBLIC_WEBSITE_URL`
- `EXPO_PUBLIC_PRIVACY_POLICY_URL`
- `EXPO_PUBLIC_SUPPORT_URL`
- `EXPO_PUBLIC_SUPPORT_EMAIL`
- `EXPO_PUBLIC_EMERGENCY_DISCLAIMER`

If `EXPO_PUBLIC_WEBSITE_URL` is set, the app derives `/privacy`, `/support`, and `/safety` automatically unless a more specific URL override is provided.

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
npm run smoke:staging
npm run smoke:production
npm run deploy:staging
npm run deploy
```

### Public site

```bash
cd ../site
npx wrangler pages deploy .
```

### Expo app

```bash
cd expo
npx eas-cli whoami
npm run release:preflight:preview
npm run release:preflight:testflight
npm run release:preflight:store
npx eas-cli metadata:push --profile store
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile testflight --platform ios
npx eas-cli submit --profile testflight --platform ios
npx eas-cli build --profile store --platform ios
npx eas-cli submit --profile store --platform ios
```

`expo/eas.json` now separates:

- `development` for dev clients
- `preview` for internal / ad hoc installs
- `testflight` for real App Store distribution builds intended for TestFlight
- `store` for final App Store submission builds

Both store-upload profiles pin `macos-sequoia-15.6-xcode-26.2` to satisfy the current App Store upload requirement for Xcode 26 / iOS 26 SDK builds.
`testflight` and `store` now hard-fail release preflight unless `backend/guidepup-api/eval/smoke-results-production.latest.json` proves production analyze is provider-backed. `preview` keeps staging mapped, but only warns on fallback-only staging smoke unless you opt into stricter enforcement.

If you need a quick release rehearsal sequence:

```bash
npm run dev
npm run release:preflight:testflight
npx eas-cli metadata:push --profile store
npx eas-cli build --profile preview --platform ios
npx eas-cli build --profile testflight --platform ios
npx eas-cli submit --profile testflight --platform ios
```

## iOS submission checklist

Use [this release checklist](./docs/testflight-release-checklist.md) before shipping.

Minimum launch steps:

1. Fill [Launch Inputs](./docs/launch-inputs.md).
2. Deploy the public `site/` pages and set the website/privacy/support URLs in Expo env.
3. Run `npx eas-cli whoami` and log in, or export `EXPO_TOKEN`.
4. Run `npm run release:preflight:preview`, `npm run release:preflight:testflight`, and `npm run release:preflight:store`.
5. Push App Store metadata with `npx eas-cli metadata:push --profile store`.
6. Build an internal preview binary, then a true TestFlight binary, and install the preview build on a physical iPhone.
7. Submit the TestFlight build only after smoke testing passes.
8. Build the `store` profile only when you are ready for App Store submission.
9. Verify the camera permission text and App Store disclosure text.
10. Confirm backend rate limiting, logging, and provider credentials in production.
11. Complete the TestFlight smoke plan from the checklist.

## Safety and release TODOs

- TODO: keep the finalized emergency / safety disclaimer copy available for legal review before store submission.
- TODO: add App Store metadata copy for camera usage and third-party AI image processing.
- TODO: replace placeholder SOS behavior with a real emergency flow and legal review.
- TODO: if microphone capture is ever added, add the matching permission string and privacy disclosures before shipping.

## Notes

- The client no longer requires provider secrets in public Expo env vars.
- The backend is conservative by design: invalid, low-confidence, or high-hazard outputs degrade to `STOP`.
- Microphone and unnecessary storage permissions were removed from the shipping app config for launch readiness.
- Audio playback remains in the experimental inspiration surface only; the shipping navigation path does not request microphone access.
