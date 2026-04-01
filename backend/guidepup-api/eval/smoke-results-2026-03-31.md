# Guide Pup Smoke Results

Date: 2026-03-31
Environment: staging
Operator: Codex

## Target URLs

- Public site: `https://guidepup-site.pages.dev`
- Staging API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `dde9b1d0-51b1-408c-b445-789d50edfb1f`
  - notes: returned `defaultProvider=openai-compatible`, `defaultModel=gpt-4.1-mini`, prompt version `2026-03-31.v1`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `3d662bd0-3bd4-4715-b97d-b9d1c0fa4d5f`
  - device id suffix: `383a93ed`
  - notes: anonymous bootstrap succeeded with 24-hour session expiry
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `14ac7f1d-4fa2-49c2-97fd-5e29a55a9d9b`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - result summary: safe `STOP` fallback with message `Stop. Vision guidance is unavailable.`
  - notes: expected because staging `OPENAI_API_KEY` is still unset

## Eval harness

- manifest: not run
- benchmark enabled: no
- stop recall: not measured
- false forward count: not measured
- average latency: not measured

## Risks / follow-ups

- Staging is reachable but not production-ready until Wrangler secrets are set.
- The public site is live on `pages.dev`; a custom domain is optional.
