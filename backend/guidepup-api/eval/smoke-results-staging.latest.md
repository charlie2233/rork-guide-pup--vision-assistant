# Guide Pup Smoke Results

Date: 2026-04-29
Environment: staging
Operator: Codex

## Target URLs

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `69d63c1b-226f-4cbc-b9e1-826475c4ce78`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `169ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `4929f890-8df9-421a-8fc3-5ed2c00dccef`
  - device id suffix: `51e6abe8`
  - latency: `63ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `814e648d-fd61-42e7-8c10-b2235307cb89`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `4309ms`
  - service latency: `3400ms`
  - fallback reason: `none`
  - message: `Stop. Path looks unsafe.`
