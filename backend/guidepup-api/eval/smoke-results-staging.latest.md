# Guide Pup Smoke Results

Date: 2026-05-22
Environment: staging
Operator: Codex

## Target URLs

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `1135d81c-65d5-4910-af55-ec9ed7932869`
  - provider: `openai-compatible`
  - model: `gpt-4.1`
  - prompt version: `2026-03-31.v1`
  - latency: `880ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `6985c962-725b-4305-b316-2e923adb2bd8`
  - device id suffix: `8594a6fe`
  - latency: `300ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `3654ms`
  - service latency: `2953ms`
  - fallback reason: `none`
  - message: `Stop. I need a clearer view.`
