# Guide Pup Smoke Results

Date: 2026-04-02
Environment: staging
Operator: Codex

## Target URLs

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `6d046c0b-9ada-42cf-bf66-46ee82e689c8`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - latency: `162ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `cc9fd5e7-84ee-417c-bcb5-72d27eb0776c`
  - device id suffix: `aa825c2b`
  - latency: `32ms`
- `POST /v1/vision/analyze`
  - status: `503 Service Unavailable`
  - request id: `279e25d7-a56c-4af5-bd74-ecc87f33526b`
  - execution path: `safe-fallback`
  - provider: `openai-compatible`
  - model: `gpt-4.1-mini`
  - prompt version: `2026-03-31.v1`
  - request latency: `745ms`
  - service latency: `664ms`
  - fallback reason: `provider_error`
  - message: `Stop. Vision guidance is unavailable.`
