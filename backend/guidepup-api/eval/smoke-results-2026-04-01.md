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
  - request id: `390d6707-a31f-4a0f-a90d-db8714310128`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `c851fc22-8235-43a1-956e-2bdd9c9b351a`
  - device id suffix: `c5074127`
  - notes: anonymous bootstrap succeeded with 24-hour session expiry after staging `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `b8aa375b-85a7-452d-84de-58e153107436`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - notes: request reached the provider path, but staging `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet

## Eval harness

- manifest: not run
- benchmark enabled: no
- stop recall: not measured
- false forward count: not measured
- average latency: not measured

## Risks / follow-ups

- Staging bootstrap is now secret-backed, but staging analyze is still blocked on `OPENAI_API_KEY`.
- Production Worker does not exist yet, so there is still no production API URL for `testflight` or `store`.
- Expo/EAS auth is still missing, so preview/TestFlight execution cannot start.
