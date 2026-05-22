# Guide Pup Smoke Results

Date: 2026-05-22
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
  - provider: `openai-compatible`
  - model: `gpt-4.1`
  - prompt version: `2026-03-31.v1`
  - latency: `861ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `bc18b829-1200-4bee-a9f0-839010435a5a`
  - device id suffix: `c0e7408b`
  - latency: `314ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `3469ms`
  - service latency: `2797ms`
  - fallback reason: `none`
  - message: `Stop. I need a clearer view.`
