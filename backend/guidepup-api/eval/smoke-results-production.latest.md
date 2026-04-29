# Guide Pup Smoke Results

Date: 2026-04-29
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `67c0917c-ef78-45f1-b344-c1ce5f73abaf`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `165ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `feb57968-63c7-438b-a414-a439409d3938`
  - device id suffix: `599cca01`
  - latency: `59ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `3c96d11d-7804-40f8-b894-36732872a5ce`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `4517ms`
  - service latency: `3704ms`
  - fallback reason: `none`
  - message: `Stop. Path looks unsafe.`
