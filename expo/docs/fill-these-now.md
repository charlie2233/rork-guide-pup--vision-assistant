# Guide Pup Fill These Now

Charlie still needs to set these values before launch execution can finish:

- Final iOS bundle identifier
- Apple Team ID
- App Store Connect App ID (`ascAppId`)
- Optional website custom domain override
- Final public privacy policy URL if it should not be derived from `${WEBSITE_URL}/privacy`
- Final public support URL if it should not be derived from `${WEBSITE_URL}/support`
- Final support email
- Copyright holder string for App Store metadata
- Final emergency / safety disclaimer copy
- Optional production Sentry DSN
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`
- Expo/EAS login or `EXPO_TOKEN`
- Final Android package name for future cross-platform release validation

## Backend by environment

- Staging Worker
  - Live URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
  - `BOOTSTRAP_SIGNING_SECRET`: configured on `2026-04-01`
  - `OPENAI_API_KEY`: still missing, so live analyze remains safe fallback only
- Production Worker
  - Live URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
  - `BOOTSTRAP_SIGNING_SECRET`: configured on `2026-04-01`
  - `OPENAI_API_KEY`: still missing, so `testflight` and `store` hard-fail the release gate

After updating them, rerun the matching iOS track gate from `expo/`, for example `npm run release:preflight:testflight`.
