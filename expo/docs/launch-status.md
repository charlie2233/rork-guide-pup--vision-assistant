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
- Required-secret gate:
  - `npm run verify:secrets:staging`: fails with `Missing required Cloudflare secrets for staging: OPENAI_API_KEY.`
  - `npm run check:staging`: now fails before deploy on the same missing secret
- Latest smoke run:
  - `/health`: `200 OK`, request ID `6d046c0b-9ada-42cf-bf66-46ee82e689c8`
  - `/v1/device/bootstrap`: `200 OK`, request ID `cc9fd5e7-84ee-417c-bcb5-72d27eb0776c`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `279e25d7-a56c-4af5-bd74-ecc87f33526b`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, prompt version `2026-03-31.v1`, not provider-backed, because staging `OPENAI_API_KEY` is still unset
- Latest machine artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.json`
- Latest markdown artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.md`

## Production backend

- Worker env: `production`
- Live API URL: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- Current Worker version: `fedabdcc-7c07-415d-825f-b4782f76ddc9`
- Configured secrets:
  - `BOOTSTRAP_SIGNING_SECRET`: set as a Wrangler secret on `2026-04-01`
  - `OPENAI_API_KEY`: still missing
- Required-secret gate:
  - `npm run verify:secrets:production`: fails with `Missing required Cloudflare secrets for production: OPENAI_API_KEY.`
  - `npm run check`: now fails before deploy on the same missing secret
- Latest smoke run:
  - `/health`: `200 OK`, request ID `f98c9729-5e28-42b2-abcb-80305fc358f6`
  - `/v1/device/bootstrap`: `200 OK`, request ID `431ef41d-a856-44ac-81f8-74654bbe1443`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `51e5fcd8-e1ea-4eff-b180-fa5c033757a1`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, prompt version `2026-03-31.v1`, not provider-backed, because production `OPENAI_API_KEY` is still unset
- Latest machine artifact: `backend/guidepup-api/eval/smoke-results-production.latest.json`
- Latest markdown artifact: `backend/guidepup-api/eval/smoke-results-production.latest.md`

## Release gates

- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- Store profile: `store`
- Preview API target: staging
- TestFlight API target: production
- Store API target: production
- EAS Metadata config: `expo/store.config.js`
- Release preflight: track-aware, with preview warning on fallback-only staging smoke and a hard provider-backed gate for `testflight` and `store`
- Expo auth status:
  - `printenv EXPO_TOKEN`: empty
  - `npx --yes eas-cli whoami`: `Not logged in`
- Current preflight results:
  - `preview`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, with a warning that staging smoke is still `safe-fallback` because `OPENAI_API_KEY` is missing
  - `testflight`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
  - `store`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
- Current Expo command results:
  - `npx --yes eas-cli whoami`: blocked immediately because Expo auth is missing
  - Preview/TestFlight build and submit were not attempted after the auth check because the first real Expo blocker was already hit

## Actions taken on 2026-04-01

- Removed secret-like backend config from `wrangler.jsonc` vars so Wrangler secrets can be set correctly.
- Redeployed the staging Worker with the updated config and analyze-route error semantics.
- Set staging `BOOTSTRAP_SIGNING_SECRET` as a real Wrangler secret.
- Re-ran live staging smoke checks and recorded fresh request IDs.
- Deployed the production Worker, set production `BOOTSTRAP_SIGNING_SECRET`, and recorded production smoke results.
- Wired `testflight` and `store` to the live production API URL in `eas.json`.
- Made release preflight track-aware so iOS execution no longer blocks on the Android package placeholder.
- Added reusable live smoke commands that emit both JSON and markdown artifacts for staging and production.
- Re-ran staging and production smoke against the live Workers, confirming both envs are still `safe-fallback` because `OPENAI_API_KEY` is missing.
- Re-ran the track-specific preflights with the provider-backed ship gate enabled for `testflight` and `store`.
- Added `secrets.required` to `wrangler.jsonc` for top-level, `staging`, and `production`.
- Added a required-secret verification script and wrapped `check`, `check:staging`, `deploy`, and `deploy:staging` around it.
- Verified that staging and production now fail before deploy with the exact missing secret: `OPENAI_API_KEY`.
- Re-ran staging and production smoke after the new deploy gate landed, recording fresh request IDs and confirming both envs still return `safe-fallback`.
- Confirmed with `printenv EXPO_TOKEN` and `eas whoami` that Expo auth is still the first iOS release blocker, so no remote build or submit IDs were created this pass.

## Blockers

- iOS bundle identifier is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet and staging deploy verification now fails before deploy.
- Production `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet and production deploy verification now fails before deploy. Without a real provider key or a fully configured AI Gateway path, the production backend only returns the safe `STOP` fallback instead of real scene guidance.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
