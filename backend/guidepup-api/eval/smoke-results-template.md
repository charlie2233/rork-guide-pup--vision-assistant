# Guide Pup Smoke Results Template

Date:
Environment:
Operator:

## Target URLs

- Public site:
- Staging API:

## Worker smoke

- `GET /health`
  - status:
  - request id:
  - notes:
- `POST /v1/device/bootstrap`
  - status:
  - request id:
  - device id suffix:
  - notes:
- `POST /v1/vision/analyze`
  - status:
  - request id:
  - provider:
  - model:
  - prompt version:
  - result summary:
  - notes:

## Eval harness

- manifest:
- benchmark enabled:
- stop recall:
- false forward count:
- average latency:

## Risks / follow-ups

- 
