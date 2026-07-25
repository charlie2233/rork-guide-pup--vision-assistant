# Guide Pup Smoke Results

Date: 2026-07-25
Environment: staging
Operator: Codex
Artifact version: 2

## Provenance and freshness

- Worker deployment: `4b3bd41c-9258-4034-9110-4b4c748cc47d`
- Worker version: `b5a53893-f108-4e54-9fc9-681b540a9b5f`
- Worker identity: `guidepup-api-staging`
- Worker version created: `2026-07-25T01:49:04.241876Z`
- source revision: `87196ef75b322d0b6f2f535a3164d9c098511bef`
- evidence expires: `2026-07-26T01:49:27.254Z`
- maximum age: `86400s`

## Worker smoke

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- health: `200 OK`, request `551482b3-d811-4315-8a07-41e5485fc591`
- bootstrap: `200 OK`, request `2ed503ee-747f-40e3-bcbb-d4f2e07109dc`
- provider/model: `openai-compatible / gpt-5.6-sol`
- prompt version: `2026-07-18.v1`
- structured output mode: `json_schema_strict`
- runtime Worker version: `b5a53893-f108-4e54-9fc9-681b540a9b5f`
- runtime source revision: `87196ef75b322d0b6f2f535a3164d9c098511bef`

## Analyze lanes

### guidance

- request id: `99416589-7b47-46b7-8279-bd82965d9cfc`
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
- scene description: `Blank white frame with no discernible path or surroundings.`
- sampled frame: `yes`
- native path: `js-fallback`
- dimensions: `40x40`
- frame summary: `Synthetic sampled js-fallback guidance smoke frame, source 40x40, upload 40x40.`

### scene-query

- request id: `bda49849-9fdd-4821-84b9-ca3e722859e4`
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
- scene description: `The frame appears blank and no walking path or hazards are visible.`
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
