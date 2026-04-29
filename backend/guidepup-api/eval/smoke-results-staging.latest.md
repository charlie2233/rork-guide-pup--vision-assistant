# Guide Pup Smoke Results

Date: 2026-04-29
Environment: staging
Operator: Codex

## Target URLs

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`

## Worker smoke

- `GET /health`
  - status: `200 OK`
  - request id: `c9aa8993-902d-4dd8-9f58-92006449dd24`
  - provider: `openai-compatible`
  - model: `gpt-4.1`
  - prompt version: `2026-03-31.v1`
  - latency: `157ms`
- `POST /v1/device/bootstrap`
  - status: `200 OK`
  - request id: `2b3dde3a-4543-489a-88e2-f672faf5b3d7`
  - device id suffix: `6ab0d41e`
  - latency: `35ms`
- `POST /v1/vision/analyze`
  - status: `200 OK`
  - request id: `1641e817-2f16-40ad-9167-82832db82c9e`
  - execution path: `provider-backed`
  - provider: `openai-compatible`
  - model: `gpt-4.1-2025-04-14`
  - prompt version: `2026-03-31.v1`
  - request latency: `2715ms`
  - service latency: `1989ms`
  - fallback reason: `none`
  - message: `Stop. I need a clearer view.`
