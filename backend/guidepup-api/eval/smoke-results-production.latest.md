# Guide Pup Smoke Results

Date: 2026-07-29
Environment: production
Operator: Codex
Artifact version: 2

## Provenance and freshness

- Worker deployment: `74e15080-4800-48d0-b777-c167a45f56f8`
- Worker version: `9c20ff03-6500-4de5-bb81-68bbf2e44ef0`
- Worker identity: `guidepup-api-production`
- Worker version created: `2026-07-29T23:52:26.55568Z`
- source revision: `5ad0b740669fdfd70cabbf5e06ff5ccc742fc5c4`
- evidence expires: `2026-07-30T23:53:45.984Z`
- maximum age: `86400s`

## Worker smoke

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- health: `200 OK`, request `1b75e3bb-36a8-45ab-b6da-487d5482848f`
- bootstrap: `200 OK`, request `68071eb9-6084-49c1-a07f-4bd641652cf6`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output mode: `json_schema_strict`
- runtime Worker version: `9c20ff03-6500-4de5-bb81-68bbf2e44ef0`
- runtime source revision: `5ad0b740669fdfd70cabbf5e06ff5ccc742fc5c4`

## Analyze lanes

### guidance

- request id: `aca939c4-4418-4b1a-b82b-19f03d0c168f`
- status: `200 OK`
- execution path: `provider-backed`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output valid: `yes`
- direction/hazard/walkability: `stop / high / uncertain`
- obstacle/confidence: `true / 0.45`
- lighting/surface: `bright / unknown`
- fallback reason: `path-not-clear`
- message: `Stop. Path is not clear.`
- scene description: `Blank bright frame with no visible walking surface or surroundings.`
- sampled frame: `yes`
- native path: `js-fallback`
- dimensions: `40x40`
- frame summary: `Synthetic sampled js-fallback guidance smoke frame, source 40x40, upload 40x40.`

### scene-query

- request id: `2b7a226a-cb01-4317-b668-e24f92a8696a`
- status: `200 OK`
- execution path: `provider-backed`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output valid: `yes`
- direction/hazard/walkability: `stop / high / uncertain`
- obstacle/confidence: `true / 0.45`
- lighting/surface: `bright / unknown`
- fallback reason: `path-not-clear`
- message: `Stop. Path is not clear.`
- scene description: `The frame appears blank white; no walking surface, obstacles, or route are visible.`
- sampled frame: `yes`
- native path: `js-fallback`
- dimensions: `40x40`
- frame summary: `Synthetic sampled js-fallback scene-query smoke frame, source 40x40, upload 40x40.`

## Launch contract

- distinctAnalyzeRequestIds: `yes`
- dualLaneEvidencePresent: `yes`
- explicitInteractionModesValid: `yes`
- freshnessBounded: `yes`
- provenanceValid: `yes`
- runtimeControlsPresent: `yes`
- safetyContractsValid: `yes`
- sampledFrameEnvelopesValid: `yes`
- strictStructuredOutputsPresent: `yes`
- structuredOutputsValid: `yes`
- runtimeIdentityBound: `yes`
- aggregateControlsPresent: `yes`
- valid: `yes`
