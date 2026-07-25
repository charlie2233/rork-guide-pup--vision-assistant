# Guide Pup Smoke Results

Date: 2026-07-25
Environment: production
Operator: Codex
Artifact version: 2

## Provenance and freshness

- Worker deployment: `bc22532c-73be-487a-8bc5-653c0b2053f5`
- Worker version: `5f48006b-4b0a-400c-96a1-1c701b09b46a`
- Worker identity: `guidepup-api-production`
- Worker version created: `2026-07-25T01:49:59.26475Z`
- source revision: `87196ef75b322d0b6f2f535a3164d9c098511bef`
- evidence expires: `2026-07-26T01:50:48.430Z`
- maximum age: `86400s`

## Worker smoke

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- health: `200 OK`, request `ec738267-0fff-40c6-b2c3-675deb8e659d`
- bootstrap: `200 OK`, request `238122f6-9e6b-434b-b37b-9bf802225846`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output mode: `json_schema_strict`
- runtime Worker version: `5f48006b-4b0a-400c-96a1-1c701b09b46a`
- runtime source revision: `87196ef75b322d0b6f2f535a3164d9c098511bef`

## Analyze lanes

### guidance

- request id: `11f66d6b-7bf4-4509-9f8a-be244dade670`
- status: `200 OK`
- execution path: `provider-backed`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output valid: `yes`
- direction/hazard/walkability: `stop / high / uncertain`
- obstacle/confidence: `true / 0.45`
- lighting/surface: `unknown / unknown`
- fallback reason: `path-not-clear`
- message: `Stop. Path is not clear.`
- scene description: `Blank, featureless frame with no visible walking path.`
- sampled frame: `yes`
- native path: `js-fallback`
- dimensions: `40x40`
- frame summary: `Synthetic sampled js-fallback guidance smoke frame, source 40x40, upload 40x40.`

### scene-query

- request id: `b12859ee-bd84-4a66-b3bf-baf0ef3a003c`
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
- scene description: `The frame appears blank; no walking path or hazards are visible.`
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
