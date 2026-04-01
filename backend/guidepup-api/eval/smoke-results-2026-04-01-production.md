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
  - request id: `821eac8b-b4a1-427d-9565-27e542f5baf8`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`, round-trip latency `191ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `3323b1c9-ddc7-41b4-89f4-902887aba5e7`
  - device id suffix: `1bcf00dc`
  - notes: anonymous bootstrap succeeded after the production Worker was created and `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret, round-trip latency `23ms`
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `1fbf4ff8-1286-4d9a-9c09-736f705967c8`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - execution path: `safe-fallback`
  - fallback reason: `provider_error`
  - notes: request reached the provider path, but production `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet; round-trip latency `733ms`, provider latency `705ms`

## Generated artifacts

- JSON: `backend/guidepup-api/eval/smoke-results-production.latest.json`
- Markdown: `backend/guidepup-api/eval/smoke-results-production.latest.md`

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
