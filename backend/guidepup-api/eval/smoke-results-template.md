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
  - execution path:
  - provider:
  - model:
  - prompt version:
  - structured output valid:
  - structured output missing fields:
  - direction:
  - hazard level:
  - obstacle:
  - lighting:
  - surface type:
  - confidence:
  - scene description:
  - fallback reason:
  - spoken message:
  - notes:

## Analyze request envelope

- sampled frame:
- image included:
- app version:
- session id:
- frame id:
- frame summary:
- timestamp ms:
- native path:
- platform:
- detail:
- dimensions:
- capture heuristics:
- prior guidance:

## Eval harness

- manifest:
- benchmark enabled:
- stop recall:
- false forward count:
- average latency:

## Risks / follow-ups

- 
