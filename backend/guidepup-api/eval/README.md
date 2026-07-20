# Guide Pup Eval Harness

This folder contains a small dev/staging-only eval harness for the vision API.

## What it does

- Bootstraps an anonymous device session.
- Calls `POST /v1/vision/analyze` for each fixture.
- Sends the same compact sampled-frame envelope as the app: session ID, frame ID, timestamp, native path, prior guidance, dimensions, and one image.
- Includes sanitized frame summary and capture heuristics such as image source, upload size, resize flag, and frame age. It never writes raw images to smoke/eval artifacts.
- Calls `POST /__debug/provider-benchmark` when the route is enabled.
- Reports average latency, STOP recall on hazard fixtures, false-forward count, structured-output validity, expected-label matches, and provider/model summaries.

## Files

- `manifest.schema.mjs` - zod schema for fixture manifests.
- `sample-manifest.json` - example manifest with placeholder fixture paths.
- `run-eval.mjs` - command-line runner that emits markdown or JSON.
- `fixture-capture-protocol.md` - safe process for capturing 15-30 representative local fixtures.
- `deploy-with-provenance.mjs` - clean-tree deploy wrapper that stamps the Worker version with the exact Git revision.
- `run-live-smoke.mjs` - authenticated dual-lane live smoke runner.
- `smoke-contract.mjs` - shared launch-evidence validation used by the runner and iOS release preflight.
- `smoke-results-template.md` - version 2 template for recording live staging/production smoke results.

## Commands

From `backend/guidepup-api/`:

```bash
npm run eval -- --manifest eval/sample-manifest.json
npm run eval:json -- --manifest eval/sample-manifest.json --output /tmp/guidepup-eval.json
npm run eval:markdown -- --manifest eval/sample-manifest.json --output /tmp/guidepup-eval.md
npm run deploy:staging
npm run deploy
npm run smoke:staging
npm run smoke:production
npm run test:smoke
```

Deploy both environments from the same clean commit before running either smoke. The smoke commands intentionally update
the tracked `*.latest.json` and `*.latest.md` evidence files; running staging smoke between deployments makes the backend
tree dirty and correctly blocks the production provenance deploy gate. Leave the generated launch evidence unstaged until
the candidate has finished release validation so its recorded source revision continues to match the deployed commit.

The deploy scripts refuse uncommitted backend source and annotate the deployed Worker version with
`source-revision:<full-git-commit>`. The smoke runner resolves the active Cloudflare deployment and 100-percent Worker
version through authenticated Wrangler calls, verifies that annotation, and verifies the deployment does not change
during the run.

Each smoke executes separate explicit `guidance` and `scene-query` analyzes. The version 2 artifact keeps their
sanitized, distinct request IDs and compact sampled-frame envelopes, but never image bytes, session tokens, full device
IDs, credentials, or signed URLs. Both lanes must be provider-backed and pass structured-output and deterministic safety
coherence checks. Evidence also requires the configured launch model/prompt, bounded runtime controls, strict Structured
Outputs mode (`json_schema_strict`), the current Git revision, and a single active Worker version.

Smoke evidence expires after 24 hours. TestFlight/store preflight rejects old schema versions, stale timestamps,
revision mismatches, missing Worker identifiers, and single-lane evidence. Preview preflight keeps its existing warning
policy unless strict provider smoke is requested. Historical artifacts remain readable but are intentionally
launch-invalid. A failed smoke prints sanitized diagnostics but leaves the prior `*.latest` artifacts untouched; only a
fully launch-valid artifact is promoted with an atomic file replacement.

Override the API target if needed:

```bash
GUIDEPUP_API_BASE_URL=http://127.0.0.1:8787 npm run eval -- --manifest eval/sample-manifest.json
```

## Manifest format

Each fixture needs either `imagePath` or `imageBase64`. Keep fixture images local and do not commit third-party captures.

Recommended fields:

- `id`
- `label`
- `scenario`
- `imagePath`
- `expectedDirection`
- `expectedHazard`
- `expectedHazardLevel`
- `expectedLighting`
- `expectedSurfaceType`
- `expectedWalkability`
- `frameId`
- `frameSummary`
- `captureHeuristics`
- `nativePath`
- `priorGuidance`
- `sessionId`
- `sourceHeight`
- `sourceWidth`
- `timestampMs`
- `detail`
- `sampledFrame`
- `hasImage`
- `notes`

Benchmark settings are optional:

- `benchmark.enabled`
- `benchmark.providers`
- `benchmark.samples`
- `benchmark.debugToken`

## Report fields

The runner emits:

- `summary.analyzeAverageLatencyMs`
- `summary.stopRecallPct`
- `summary.falseForwardCount`
- `analyzeProviders[]` with provider/model and latency summaries
- `benchmarkProviders[]` when the benchmark route is enabled
- `scenarios{}` with per-scenario valid/STOP/false-forward counts
- `fixtures[]` with per-fixture results, structured-output field validation, and sanitized request-envelope metadata
- `fixtures[].expectedLabels` and `fixtures[].labelMismatches` when expected direction, hazard level, lighting, surface type, or walkability labels are present
- `fixtures[].*Matches` fields for expected direction, hazard level, lighting, surface type, and walkability labels

## Fixture guidance

- Start with scenario buckets:
  - `clear-path`
  - `obstacle-ahead`
  - `stairs-curb-drop-off`
  - `doorway-hallway`
  - `low-light`
- Use real local captures for hallway, doorway, stairs, curb, drop-off, and low-light scenes.
- Do not commit third-party images.
- If a fixture is labeled, any mismatch for expected direction, hazard level, lighting, surface type, or walkability makes that fixture invalid even when the JSON shape is valid.
- If a fixture is not labeled, the harness still runs, but STOP recall, false-forward, and semantic-validity metrics will be less meaningful.
