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
  - request id: `f98c9729-5e28-42b2-abcb-80305fc358f6`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`, round-trip latency `161ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `431ef41d-a856-44ac-81f8-74654bbe1443`
  - device id suffix: `76919543`
  - notes: anonymous bootstrap succeeded after the production Worker was created and `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret, round-trip latency `31ms`
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `51e5fcd8-e1ea-4eff-b180-fa5c033757a1`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - execution path: `safe-fallback`
  - fallback reason: `provider_error`
  - notes: request reached the provider path, but production `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet; round-trip latency `732ms`, provider latency `661ms`

## Secret verification

- `npm run verify:secrets:production`
  - result: failed before deploy
  - blocker: `Missing required Cloudflare secrets for production: OPENAI_API_KEY.`
- `npm run check`
  - result: failed before deploy
  - blocker: `Missing required Cloudflare secrets for production: OPENAI_API_KEY.`

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
