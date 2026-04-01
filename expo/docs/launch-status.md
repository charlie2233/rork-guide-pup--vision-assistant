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
  - `/health`: `200 OK`, request ID `4a3a48c7-ba79-4b32-a1ef-fd768756a3b9`
  - `/v1/device/bootstrap`: `200 OK`, request ID `ffed295a-aa77-417c-baca-90d2a6371d25`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `b292ee81-844b-4eef-88ac-b98da4211e63`
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
- Latest smoke run:
  - `/health`: `200 OK`, request ID `821eac8b-b4a1-427d-9565-27e542f5baf8`
  - `/v1/device/bootstrap`: `200 OK`, request ID `3323b1c9-ddc7-41b4-89f4-902887aba5e7`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `1fbf4ff8-1286-4d9a-9c09-736f705967c8`
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
- Expo auth status: `npx --yes eas-cli whoami` returned `Not logged in` on `2026-04-01`
- Current preflight results:
  - `preview`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, with a warning that staging smoke is still `safe-fallback` because `OPENAI_API_KEY` is missing
  - `testflight`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
  - `store`: blocked by `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and production smoke still showing `safe-fallback`
- Current Expo command results:
  - `npx --yes eas-cli whoami`: blocked immediately because Expo auth is missing
  - Preview/TestFlight build, metadata push, and submit were not attempted again after the auth check because the first real Expo blocker was already hit

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
- Confirmed with Wrangler that both envs only have `BOOTSTRAP_SIGNING_SECRET` configured today.
- Confirmed with `eas whoami` that Expo auth is still the first build blocker, so no remote build or submit IDs were created this pass.

## Blockers

- iOS bundle identifier is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet.
- Production `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet. Without a real provider key or a fully configured AI Gateway path, the production backend only returns the safe `STOP` fallback instead of real scene guidance.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
