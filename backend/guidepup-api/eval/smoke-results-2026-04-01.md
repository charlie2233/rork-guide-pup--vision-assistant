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
  - request id: `6d046c0b-9ada-42cf-bf66-46ee82e689c8`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`, round-trip latency `162ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `cc9fd5e7-84ee-417c-bcb5-72d27eb0776c`
  - device id suffix: `aa825c2b`
  - notes: anonymous bootstrap succeeded with 24-hour session expiry after staging `BOOTSTRAP_SIGNING_SECRET` was configured as a Wrangler secret, round-trip latency `32ms`
- `POST /v1/vision/analyze`
  - status: `503 provider_error`
  - request id: `279e25d7-a56c-4af5-bd74-ecc87f33526b`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: explicit safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - execution path: `safe-fallback`
  - fallback reason: `provider_error`
  - notes: request reached the provider path, but staging `OPENAI_API_KEY` is still unset so analyze is not provider-backed yet; round-trip latency `745ms`, provider latency `664ms`

## Secret verification

- `npm run verify:secrets:staging`
  - result: failed before deploy
  - blocker: `Missing required Cloudflare secrets for staging: OPENAI_API_KEY.`
- `npm run check:staging`
  - result: failed before deploy
  - blocker: `Missing required Cloudflare secrets for staging: OPENAI_API_KEY.`

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
