# Guide Pup Smoke Results

Date: 2026-07-29
Environment: staging
Operator: Codex
Artifact version: 2

## Provenance and freshness

- Worker deployment: `a1343cdf-e125-4420-9221-d5495d7f4d8d`
- Worker version: `15a4ce57-89a3-4718-a01d-c701dea74298`
- Worker identity: `guidepup-api-staging`
- Worker version created: `2026-07-29T23:52:03.037893Z`
- source revision: `5ad0b740669fdfd70cabbf5e06ff5ccc742fc5c4`
- evidence expires: `2026-07-30T23:53:12.366Z`
- maximum age: `86400s`

## Worker smoke

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- health: `200 OK`, request `e594eaaa-64d9-4b3b-a212-bee2b0799fe4`
- bootstrap: `200 OK`, request `38cfd72c-b3f2-4009-a6de-184315e2ec2e`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output mode: `json_schema_strict`
- runtime Worker version: `15a4ce57-89a3-4718-a01d-c701dea74298`
- runtime source revision: `5ad0b740669fdfd70cabbf5e06ff5ccc742fc5c4`

## Analyze lanes

### guidance

- request id: `dd8abaa0-e0ad-4612-be43-7ec20fe1dc77`
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
- scene description: `No usable pedestrian scene or walking surface is visible.`
- sampled frame: `yes`
- native path: `js-fallback`
- dimensions: `40x40`
- frame summary: `Synthetic sampled js-fallback guidance smoke frame, source 40x40, upload 40x40.`

### scene-query

- request id: `cda8632c-c11e-4ad7-8919-3a4ee4882eb4`
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
- scene description: `The frame appears blank white; no path, surface, or hazards are visible.`
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
