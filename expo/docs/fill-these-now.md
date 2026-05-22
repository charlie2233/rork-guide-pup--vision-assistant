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
  - `OPENAI_API_KEY`: configured remotely; live smoke on `2026-05-22` returned provider-backed analyze
  - Latest analyze request ID: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Production Worker
  - Live URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
  - `BOOTSTRAP_SIGNING_SECRET`: configured on `2026-04-01`
  - `OPENAI_API_KEY`: configured remotely; live smoke on `2026-05-22` returned provider-backed analyze
  - Latest analyze request ID: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`

## Current local auth gaps

- `CLOUDFLARE_API_TOKEN` is not set locally and `npx wrangler whoami` reports `Not logged in`, so deploy and secret verification cannot be refreshed from this shell yet.
- `EXPO_TOKEN` is not set locally, so EAS build/submit cannot start from this shell yet.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are not set locally, so Sentry issue health cannot be queried from this shell yet.

After updating them, rerun the matching iOS track gate from `expo/`, for example `npm run release:preflight:testflight`.
