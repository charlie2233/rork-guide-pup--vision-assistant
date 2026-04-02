# Guide Pup Smoke Results

Date: 2026-04-02
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `f98c9729-5e28-42b2-abcb-80305fc358f6`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `161ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `431ef41d-a856-44ac-81f8-74654bbe1443`
  - device id suffix: `76919543`
  - latency: `31ms`
- `POST /v1/vision/analyze`
  - status: `503 Service Unavailable`
  - request id: `51e5fcd8-e1ea-4eff-b180-fa5c033757a1`
  - execution path: `safe-fallback`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - request latency: `732ms`
  - service latency: `661ms`
  - fallback reason: `provider_error`
  - message: `Stop. Vision guidance is unavailable.`
