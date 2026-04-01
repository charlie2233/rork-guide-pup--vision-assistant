# Guide Pup Launch Status

Last updated: 2026-04-01

## Public site

- Pages project: `guidepup-site`
- Live URL: `https://guidepup-site.pages.dev`
- Privacy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Safety URL: `https://guidepup-site.pages.dev/safety`

## Staging backend

- Worker env: `staging`
- Live API URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- Current Worker version: `358c7f85-8266-406c-b343-7e1679f900db`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: still missing
- Latest smoke run:
  - `/health`: `200 OK`, request ID `cde512db-5b07-4ea0-bb4c-c56793928828`
  - `/v1/device/bootstrap`: `200 OK`, request ID `a725d9ee-c515-4dee-bac2-380667f827e6`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `ee662440-203d-41e7-be2c-afe4d4f01e98`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, not provider-backed, because staging `OPENAI_API_KEY` is still unset

## Production backend

- Worker env: `production`
- Live API URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- Current Worker version: `fedabdcc-7c07-415d-825f-b4782f76ddc9`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: still missing
- Latest smoke run:
  - `/health`: `200 OK`, request ID `6449d2b1-bc74-4409-8d21-57807e44132e`
  - `/v1/device/bootstrap`: `200 OK`, request ID `44c602f5-38a8-4b38-adc7-5712a8bde236`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `d5ca26fe-cb0d-4196-8db7-210326b10ec6`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, not provider-backed, because production `OPENAI_API_KEY` is still unset

## Release gates

- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- Store profile: `store`
- Preview API target: staging
- TestFlight API target: production
- Store API target: production
- EAS Metadata config: `expo/store.config.js`
- Release preflight: track-aware and failing only on unresolved human/account inputs for the selected iOS track
- Expo auth status: `npx eas-cli whoami` currently returns `Not logged in`
- Current preflight results:
  - `preview`: blocked only by `TODO_IOS_BUNDLE_IDENTIFIER`
  - `testflight`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`
  - `store`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`
- Current Expo command results:
  - `build --profile preview --platform ios`: blocked before remote build creation because Expo auth is missing
  - `build --profile testflight --platform ios`: blocked before remote build creation because Expo auth is missing
  - `metadata:push --profile store`: blocked before store sync because Expo auth is missing
  - `submit --profile store --platform ios`: blocked before submission creation because Expo auth is missing

## Actions taken on 2026-04-01

- Removed secret-like backend config from `wrangler.jsonc` vars so Wrangler secrets can be set correctly.
- Redeployed the staging Worker with the updated config and analyze-route error semantics.
- Set staging `BOOTSTRAP_SIGNING_SECRET` as a real Wrangler secret.
- Re-ran live staging smoke checks and recorded fresh request IDs.
- Deployed the production Worker, set production `BOOTSTRAP_SIGNING_SECRET`, and recorded production smoke results.
- Wired `testflight` and `store` to the live production API URL in `eas.json`.
- Made release preflight track-aware so iOS execution no longer blocks on the Android package placeholder.
- Re-ran the track-specific preflights and the Expo metadata/build/submit commands until the first real Expo account blocker.

## Blockers

- iOS bundle identifier is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet.
- Production `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
