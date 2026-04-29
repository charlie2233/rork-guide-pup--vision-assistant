# Guide Pup Smoke Results

Date: 2026-04-29
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `e46ed2f5-0bd1-48bb-ab37-2c95f0f28821`
  - provider: `openai-compatible`
  - model: `gpt-4.1`
  - prompt version: `2026-03-31.v1`
  - latency: `300ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `6dafa3da-9abb-4c4d-b9c3-4669c924a056`
  - device id suffix: `6abea7fc`
  - latency: `105ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `cebf5445-7923-4a87-8953-124f824914ef`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `3822ms`
  - service latency: `3076ms`
  - fallback reason: `none`
  - message: `Stop. I need a clearer view.`
