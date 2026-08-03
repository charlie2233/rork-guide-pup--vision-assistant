# Guide Pup Smoke Results Template

Date:
Environment:
Operator:
Artifact version: 2

## Provenance and freshness

- Worker deployment ID:
- Worker version ID:
- Worker version created at:
- source Git revision:
- evidence expires at:
- maximum age seconds: 86400

## Worker smoke

- API URL:
- `GET /health`
  - status:
  - sanitized request ID:
  - provider/model:
  - prompt version:
  - structured output mode:
- `POST /v1/device/bootstrap`
  - status:
  - sanitized request ID:
  - device ID suffix only:

## Explicit analyze lanes

Record both lanes. Request IDs must be sanitized and distinct.

### guidance

- `interactionMode`: `guidance`
- status/request ID:
- provider/model/prompt version:
- execution path:
- structured output valid:
- direction/hazard/obstacle/walkability:
- lighting/surface/confidence:
- scene description/message/fallback reason:
- sampled-frame envelope valid:

### scene-query

- `interactionMode`: `scene-query`
- status/request ID:
- provider/model/prompt version:
- execution path:
- structured output valid:
- direction/hazard/obstacle/walkability:
- lighting/surface/confidence:
- scene description/message/fallback reason:
- sampled-frame envelope valid:

## Launch contract

- provider backed:
- dual-lane evidence present:
- explicit interaction modes valid:
- distinct analyze request IDs:
- structured outputs valid:
- safety contracts valid:
- strict Structured Outputs present:
- sampled-frame envelopes valid:
- runtime controls present:
- provenance valid:
- freshness bounded:
- launch contract valid:

## Privacy check

- no raw image/audio:
- no full device IDs:
- no session tokens/provider keys/credentials:
- no signed URLs:

## Risks / follow-ups

-
