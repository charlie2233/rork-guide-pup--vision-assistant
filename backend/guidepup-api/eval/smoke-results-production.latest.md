# Guide Pup Smoke Results

Date: 2026-04-01
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `821eac8b-b4a1-427d-9565-27e542f5baf8`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `191ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `3323b1c9-ddc7-41b4-89f4-902887aba5e7`
  - device id suffix: `1bcf00dc`
  - latency: `23ms`
- `POST /v1/vision/analyze`
  - status: `503 Service Unavailable`
  - request id: `1fbf4ff8-1286-4d9a-9c09-736f705967c8`
  - execution path: `safe-fallback`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - request latency: `733ms`
  - service latency: `705ms`
  - fallback reason: `provider_error`
  - message: `Stop. Vision guidance is unavailable.`
