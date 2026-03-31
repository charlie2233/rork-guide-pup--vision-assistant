# Guide Pup

Guide Pup is an Expo / React Native navigation prototype for blind and low-vision users. The production path for v1 is now:

1. Onboarding
2. Home
3. Navigation
4. Settings

The creative capture / inspiration tabs remain in the repo as experimental surfaces and are hidden by default.

## Architecture

- `expo/` is the shipping client.
- `backend/guidepup-api/` is the Cloudflare Worker API for device bootstrap and vision analysis.
- The Expo client sends compressed camera frames to the backend instead of calling model providers directly.
- The backend applies provider normalization and safety overrides before returning guidance.

## Expo setup

```bash
cd expo
bun install
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

Run locally:

```bash
# Rork tunnel flow already used by this repo
bun run start

# Web
bun run start-web

# Standard Expo helpers
bun run start:ios
bun run start:android
bun run start:web
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
npm run deploy:staging
npm run deploy
```

### Expo app

```bash
cd expo
bunx eas-cli build --profile preview --platform ios
bunx eas-cli build --profile production --platform ios
```

`expo/eas.json` includes `development`, `preview`, and `production` profiles.

## iOS submission checklist

1. Set production `EXPO_PUBLIC_API_BASE_URL`.
2. Build and test on physical iPhone hardware.
3. Verify camera permission copy and third-party AI disclosure copy.
4. Confirm backend rate limiting, logging, and provider credentials in production.
5. Configure App Store Connect submit metadata in `eas.json`.

## Safety and release TODOs

- TODO: privacy policy URL
- TODO: support URL
- TODO: emergency / safety disclaimer copy
- TODO: App Store metadata copy for camera usage
- TODO: App Store metadata copy describing third-party AI image processing
- TODO: replace placeholder SOS behavior with a real emergency flow and legal review

## Notes

- The client no longer requires provider secrets in public Expo env vars.
- The backend is conservative by design: invalid, low-confidence, or high-hazard outputs degrade to `STOP`.
- Microphone and unnecessary storage permissions were removed from the shipping app config for launch readiness.
