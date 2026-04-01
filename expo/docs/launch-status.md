# Guide Pup Launch Status

Last updated: 2026-03-31

## Public site

- Pages project: `guidepup-site`
- Live URL: `https://guidepup-site.pages.dev`
- Privacy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Safety URL: `https://guidepup-site.pages.dev/safety`

## Staging backend

- Worker env: `staging`
- Live API URL: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `dde9b1d0-51b1-408c-b445-789d50edfb1f`
- `/v1/device/bootstrap`: `200 OK`, request ID `3d662bd0-3bd4-4715-b97d-b9d1c0fa4d5f`
- `/v1/vision/analyze`: `200 OK`, request ID `14ac7f1d-4fa2-49c2-97fd-5e29a55a9d9b`
- Analyze result: safe `STOP` fallback from `openai-compatible` / `gpt-4.1-mini` because the staging provider key is still unset

## Release gates

- Internal preview profile: `preview`
- True TestFlight profile: `testflight`
- Store profile: `store`
- EAS Metadata config: `expo/store.config.js`
- Release preflight: failing only on unresolved human inputs

## Blockers

- Production API base URL is still unresolved.
- Apple Team ID and App Store Connect App ID are still unresolved.
- Store copyright holder is still unresolved.
- Staging still uses blank Worker env vars for `BOOTSTRAP_SIGNING_SECRET` and `OPENAI_API_KEY`; replace them with real Wrangler secrets before treating staging as secure.
