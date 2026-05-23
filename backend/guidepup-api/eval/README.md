# Guide Pup Eval Harness

This folder contains a small dev/staging-only eval harness for the vision API.

## What it does

- Bootstraps an anonymous device session.
- Calls `POST /v1/vision/analyze` for each fixture.
- Sends the same compact sampled-frame envelope as the app: session ID, frame ID, timestamp, native path, prior guidance, dimensions, and one image.
- Includes sanitized frame summary and capture heuristics such as image source, upload size, resize flag, and frame age. It never writes raw images to smoke/eval artifacts.
- Calls `POST /__debug/provider-benchmark` when the route is enabled.
- Reports average latency, STOP recall on hazard fixtures, false-forward count, structured-output validity, and provider/model summaries.

## Files

- `manifest.schema.mjs` - zod schema for fixture manifests.
- `sample-manifest.json` - example manifest with placeholder fixture paths.
- `run-eval.mjs` - command-line runner that emits markdown or JSON.
- `fixture-capture-protocol.md` - safe process for capturing 15-30 representative local fixtures.
- `smoke-results-template.md` - template for recording live staging smoke results.

## Commands

From `backend/guidepup-api/`:

```bash
npm run eval -- --manifest eval/sample-manifest.json
npm run eval:json -- --manifest eval/sample-manifest.json --output /tmp/guidepup-eval.json
npm run eval:markdown -- --manifest eval/sample-manifest.json --output /tmp/guidepup-eval.md
```

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

## Fixture guidance

- Start with scenario buckets:
  - `clear-path`
  - `obstacle-ahead`
  - `stairs-curb-drop-off`
  - `doorway-hallway`
  - `low-light`
- Use real local captures for hallway, doorway, stairs, curb, drop-off, and low-light scenes.
- Do not commit third-party images.
- If a fixture is not labeled, the harness still runs, but STOP recall and false-forward metrics will be less meaningful.
