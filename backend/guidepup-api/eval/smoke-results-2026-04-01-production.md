# Guide Pup Smoke Results

Date: 2026-04-01
Environment: production
Operator: Codex

## Target URLs

- Public site: `https://guidepup-site.pages.dev`
- Production API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `6449d2b1-bc74-4409-8d21-57807e44132e`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `44c602f5-38a8-4b38-adc7-5712a8bde236`
  - device id suffix: `8d5ba90d`
  - notes: anonymous bootstrap succeeded after the production Worker was created and `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `d5ca26fe-cb0d-4196-8db7-210326b10ec6`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - notes: request reached the provider path, but production `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet

## Eval harness

- manifest: not run
- benchmark enabled: no
- stop recall: not measured
- false forward count: not measured
- average latency: not measured

## Risks / follow-ups

- Production is live and reachable, but production analyze is still blocked on `OPENAI_API_KEY`.
- TestFlight and store now target production, so a shipping build still depends on the missing production provider key.
- Expo/EAS auth is still missing, so preview/TestFlight execution cannot start.
