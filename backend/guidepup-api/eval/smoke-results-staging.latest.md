# Guide Pup Smoke Results

Date: 2026-04-01
Environment: staging
Operator: Codex

## Target URLs

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `4a3a48c7-ba79-4b32-a1ef-fd768756a3b9`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `191ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `ffed295a-aa77-417c-baca-90d2a6371d25`
  - device id suffix: `196fa383`
  - latency: `26ms`
- `POST /v1/vision/analyze`
  - status: `503 Service Unavailable`
  - request id: `b292ee81-844b-4eef-88ac-b98da4211e63`
  - execution path: `safe-fallback`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - request latency: `695ms`
  - service latency: `673ms`
  - fallback reason: `provider_error`
  - message: `Stop. Vision guidance is unavailable.`
