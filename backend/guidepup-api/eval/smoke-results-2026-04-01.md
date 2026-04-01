# Guide Pup Smoke Results

Date: 2026-04-01
Environment: staging
Operator: Codex

## Target URLs

- Public site: `https://guidepup-site.pages.dev`
- Staging API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `4a3a48c7-ba79-4b32-a1ef-fd768756a3b9`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`, round-trip latency `191ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `ffed295a-aa77-417c-baca-90d2a6371d25`
  - device id suffix: `196fa383`
  - notes: anonymous bootstrap succeeded with 24-hour session expiry after staging `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret, round-trip latency `26ms`
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `b292ee81-844b-4eef-88ac-b98da4211e63`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - execution path: `safe-fallback`
  - fallback reason: `provider_error`
  - notes: request reached the provider path, but staging `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet; round-trip latency `695ms`, provider latency `673ms`

## Generated artifacts

- JSON: `backend/guidepup-api/eval/smoke-results-staging.latest.json`
- Markdown: `backend/guidepup-api/eval/smoke-results-staging.latest.md`

## Eval harness

- manifest: not run
- benchmark enabled: no
- stop recall: not measured
- false forward count: not measured
- average latency: not measured

## Risks / follow-ups

- Staging bootstrap is now secret-backed, but staging analyze is still blocked on `OPENAI_API_KEY`.
- Production now exists at `https://guidepup-api-production.charliehan-lifepage.workers.dev`, but production analyze is also blocked on `OPENAI_API_KEY`.
- Expo/EAS auth is still missing, so preview/TestFlight execution cannot start.
