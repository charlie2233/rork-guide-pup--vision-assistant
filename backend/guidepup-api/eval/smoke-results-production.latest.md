# Guide Pup Smoke Results

Date: 2026-04-29
Environment: production
Operator: Codex

## Target URLs

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `37cc6ca5-b89a-4f25-a620-9b689c781066`
  - provider: `openai-compatible`
  - model: `gpt-4.1`
  - prompt version: `2026-03-31.v1`
  - latency: `371ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `9241d4d3-6dac-4ff5-9319-193a19fe3acb`
  - device id suffix: `5bddfd1a`
  - latency: `58ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `d9238d01-bde9-4d5b-bcd8-7d498be76162`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `2870ms`
  - service latency: `2086ms`
  - fallback reason: `none`
  - message: `Stop. I need a clearer view.`
