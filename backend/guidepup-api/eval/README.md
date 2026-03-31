# Guide Pup Eval Harness

This folder contains a small dev/staging-only eval harness for the vision API.

## What it does

- Bootstraps an anonymous device session.
- Calls `POST /v1/vision/analyze` for each fixture.
- Calls `POST /__debug/provider-benchmark` when the route is enabled.
- Reports average latency, STOP recall on hazard fixtures, false-forward count, and provider/model summaries.

## Files

- `manifest.schema.mjs` - zod schema for fixture manifests.
- `sample-manifest.json` - example manifest with placeholder fixture paths.
- `run-eval.mjs` - command-line runner that emits markdown or JSON.

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
- `imagePath`
- `expectedDirection`
- `expectedHazard`
- `expectedHazardLevel`
- `detail`
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
- `providers[]` with provider/model and latency summaries
- `fixtures[]` with per-fixture results

## Fixture guidance

- Use real local captures for hallway, doorway, stairs, curb, drop-off, and low-light scenes.
- Do not commit third-party images.
- If a fixture is not labeled, the harness still runs, but STOP recall and false-forward metrics will be less meaningful.
