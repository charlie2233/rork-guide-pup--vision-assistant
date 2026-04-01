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
  - `/health`: `200 OK`, request ID `390d6707-a31f-4a0f-a90d-db8714310128`
  - `/v1/device/bootstrap`: `200 OK`, request ID `c851fc22-8235-43a1-956e-2bdd9c9b351a`
  - `/v1/vision/analyze`: `503 provider_error`, request ID `b8aa375b-85a7-452d-84de-58e153107436`
- Analyze result: explicit safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini`, not provider-backed, because staging `OPENAI_API_KEY` is still unset

## Production backend

- Worker env: `production`
- Live API URL: not deployed yet
- Status: production Worker does not exist yet, so there is no production API URL to wire into `testflight` or `store`

## Release gates

- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- Store profile: `store`
- EAS Metadata config: `expo/store.config.js`
- Release preflight: failing only on unresolved human/account inputs
- Expo auth status: `npx eas-cli whoami` currently returns `Not logged in`

## Actions taken on 2026-04-01

- Removed secret-like backend config from `wrangler.jsonc` vars so Wrangler secrets can be set correctly.
- Redeployed the staging Worker with the updated config and analyze-route error semantics.
- Set staging `BOOTSTRAP_SIGNING_SECRET` as a real Wrangler secret.
- Re-ran live staging smoke checks and recorded fresh request IDs.
- Ran release preflight plus EAS metadata/build/submit commands until the first real Expo account blocker.

## Blockers

- Production API base URL is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging `OPENAI_API_KEY` is still missing, so `/v1/vision/analyze` is not provider-backed yet.
- Production Worker is not deployed yet.
- Expo/EAS login or `EXPO_TOKEN` is still missing, so metadata push, preview/TestFlight builds, and submit do not start.
