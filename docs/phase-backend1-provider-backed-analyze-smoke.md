# phase-backend1-provider-backed-analyze-smoke

Date: 2026-05-22
Branch: `codex/guidepup-credentialed-launch`
Commit at audit start: `54d6d8ef2535ef51bcb28bed3ef85b29d8dac869`

## Scope

This phase tightens the cloud-owned vision contract for internal iOS launch readiness while preserving the app/backend boundary:

- iOS still owns camera/session lifecycle, speech I/O, haptics, VoiceOver, settings, status, diagnostics, and fallback UX.
- Cloud owns provider routing, prompt and safety policy, request IDs, provider-backed smoke evidence, and structured vision output.
- The shipping client still does not contain provider keys or direct model calls.

## Code changes prepared

- Backend OpenAI-compatible provider now requests strict JSON Schema Structured Outputs instead of loose JSON object mode.
- Backend default model config is prepared for `gpt-5.5`, low reasoning effort, and prompt version `2026-05-22.v1`.
- Analyze request accepts compact frame context: `sessionId`, `frameId`, `timestampMs`, `priorGuidance`, `nativePath`, source size, detail level, sanitized `frameSummary`, `captureHeuristics`, `sampledFrame`, and `hasImage`.
- Analyze response now carries `fallbackReason` for safe fallback and safety-override cases.
- iOS sends sampled-frame metadata from the navigation loop while keeping camera capture and STOP/haptics/VoiceOver control local.
- Backend log redaction is shared with the Sentry envelope path so `deviceId`, tokens, auth headers, API keys, raw image/base64 fields, and keyless bearer/base64-like snippets are redacted before logging or Sentry reporting, while request ID, route, prompt version, and environment remain usable.
- Provider non-OK errors no longer carry upstream response-body snippets into app logs or Sentry messages.
- Backend provider runtime controls are now bounded and surfaced for smoke evidence: max completion tokens default `700` (clamped `128..1200`), request timeout default `12000` ms (clamped `3000..30000`), retry count default `1` (clamped `0..2`), and retry delay default `250` ms (clamped `0..2000`).
- Provider retry behavior is limited to retryable transport/server failures (`408`, `429`, `5xx`, and request aborts), and release preflight now requires those runtime-control health fields in staging/production smoke artifacts.

## Live backend evidence

Commands run from `backend/guidepup-api`:

```bash
npm run smoke:staging
npm run smoke:production
```

Staging result:

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `1135d81c-65d5-4910-af55-ec9ed7932869`
- `/v1/device/bootstrap`: `200 OK`, request ID `6985c962-725b-4305-b316-2e923adb2bd8`
- `/v1/vision/analyze`: `200 OK`, request ID `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Artifact: `backend/guidepup-api/eval/smoke-results-staging.latest.json`

Production result:

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
- `/v1/device/bootstrap`: `200 OK`, request ID `bc18b829-1200-4bee-a9f0-839010435a5a`
- `/v1/vision/analyze`: `200 OK`, request ID `09ff3bf0-1ab7-4fdd-a525-4007328cc731`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Artifact: `backend/guidepup-api/eval/smoke-results-production.latest.json`

Important: the live Workers are provider-backed, but they have not yet been redeployed with the new `gpt-5.5` / `2026-05-22.v1` structured-output contract because this shell is not authenticated to Cloudflare.

Latest temporary smoke rerun on 2026-05-23, written only to `/tmp` artifacts:

- Staging `/health`: `739426da-e250-4de3-8a5d-1fffdc1c5ea1`
- Staging `/v1/device/bootstrap`: `bc9e1dc1-28c9-4ab3-9517-bc5e7a45e247`
- Staging `/v1/vision/analyze`: `22eba2e8-256a-4f60-b42e-df638a406416`
- Staging execution path: `provider-backed`, but launch-invalid because live Worker still reports `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, and missing `fallbackReason`.
- Production `/health`: `1e77e206-d639-4b80-ba79-1f7c9cd7ed51`
- Production `/v1/device/bootstrap`: `55944638-d6f7-4102-ae17-9f3c519d4acf`
- Production `/v1/vision/analyze`: `8c6b03a5-aa3b-4fc1-8826-d0b4ddcd5d2e`
- Production execution path: `provider-backed`, but launch-invalid for the same stale model/prompt and missing `fallbackReason` contract gap.

Runtime-control continuation smoke on 2026-05-23, written only to `/tmp` artifacts:

- Staging `/health`: `c9bc43c3-0285-41ec-a0d8-56b7822bf0ac`
- Staging `/v1/device/bootstrap`: `9898d848-47f1-466c-aa6e-0c58ac355ba2`
- Staging `/v1/vision/analyze`: `841657a1-1efa-49c4-99f2-1b5ca3d80df7`
- Staging execution path: `provider-backed`, but launch-invalid because live Worker health does not yet expose `defaultMaxCompletionTokens`, `defaultRequestTimeoutMs`, `defaultRetryCount`, or `defaultRetryDelayMs`, and analyze still reports `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, and missing `fallbackReason`.
- Production `/health`: `cd19dbc7-ea36-415c-83a5-ef8070e759d5`
- Production `/v1/device/bootstrap`: `5153558c-7707-4dd2-ba49-c18b0d6a8123`
- Production `/v1/vision/analyze`: `289ef798-9c70-41db-b1e6-d6886a11711f`
- Production execution path: `provider-backed`, but launch-invalid for the same stale live Worker contract.

## Auth and provider status

Command evidence:

```bash
node -e "for (const k of ['CLOUDFLARE_API_TOKEN','OPENAI_API_KEY','EXPO_TOKEN','SENTRY_AUTH_TOKEN','SENTRY_ORG','SENTRY_PROJECT','HUGGINGFACE_HUB_TOKEN','HF_TOKEN']) console.log(k + '=' + (process.env[k] ? 'set' : 'missing'))"
npx wrangler whoami
hf auth whoami
```

Results:

- `CLOUDFLARE_API_TOKEN`: missing.
- `OPENAI_API_KEY`: missing from this shell. Live Workers still prove provider-backed analyze through their configured remote secrets.
- `EXPO_TOKEN`: missing.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`: missing, so Sentry issue health could not be queried.
- `hf` CLI: not installed in this shell; MiniCPM remains experimental/benchmark-only and is not part of production guidance.
- `npx wrangler whoami`: failed with `Not logged in`.

## Device status

Commands run:

```bash
xcrun xctrace list devices
xcrun devicectl list devices
xcrun xcdevice list
xcrun devicectl device info details --device 00008130-000A001A1178001C
system_profiler SPUSBDataType
security find-identity -v -p codesigning
```

Current physical iPhone state:

- `charlie的iPhone` is visible but unavailable/offline for Xcode execution.
- `xcrun xctrace list devices` reports it under `Devices Offline` as iOS `26.4.2`.
- `xcrun devicectl list devices` reports state `unavailable`.
- `xcrun xcdevice list` reports deviceprep code `-27`, domain `com.apple.dt.deviceprep`, and the recovery suggestion to unlock/attach by cable or use same LAN with Developer Mode.
- `devicectl device info details` reports Developer Mode `enabled`, pairing state `paired`, tunnel state `unavailable`, and last connection `2026-05-05 22:31:40 +0000`.
- `system_profiler SPUSBDataType` did not show an attached iPhone on the USB bus.
- One signing identity exists: `Apple Development: XIANMIN CHEN (SBSJ3MX9GZ)`.

No real-iPhone no-screen smoke evidence was produced in this phase because the device is not currently available to install/run the app.

## Validation run

Commands:

```bash
npm --prefix backend/guidepup-api run typecheck
npm --prefix expo run typecheck
npm --prefix backend/guidepup-api run types
(cd backend/guidepup-api && npx wrangler deploy --dry-run --env staging)
npm --prefix backend/guidepup-api run smoke:staging
npm --prefix backend/guidepup-api run smoke:production
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- Backend `npm run typecheck`: passed.
- Backend `npm run types`: passed and regenerated `src/env.d.ts` for `gpt-5.5`, `OPENAI_REASONING_EFFORT=low`, and prompt version `2026-05-22.v1`.
- Backend `npx wrangler deploy --dry-run --env staging`: passed config/bundle validation without deploying.
- Expo `npm run typecheck`: passed.
- Expo `npm run lint`: passed.
- iOS Release simulator compile for `iPhone 16e`: passed with third-party warnings; no install/run claim.
- Live staging smoke: passed and provider-backed.
- Live production smoke: passed and provider-backed.
- Preview preflight: blocked by unresolved iOS bundle identifier.
- TestFlight preflight: blocked by unresolved iOS bundle identifier, Apple Team ID, App Store Connect App ID, and copyright holder.

Latest validation continuation on 2026-05-23:

```bash
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npm --prefix backend/guidepup-api run deploy:dry-run -- --env production
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging.json --output-md /tmp/guidepup-smoke-staging.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production.json --output-md /tmp/guidepup-smoke-production.md
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:ios-device
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
xcodebuildmcp build_sim --extraArgs CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
git diff --check
```

Results:

- Backend privacy tests passed: sensitive keyed fields, keyless bearer/API-key/base64-like strings, Sentry extra, and provider error-body removal are covered.
- Backend typecheck, staging dry-run bundle, production dry-run bundle, Expo typecheck, Expo lint, voice-command contract, no-screen smoke contract, iOS Release simulator build, and `git diff --check` passed.
- `check:ios-device` intentionally remains blocked: paired and Developer Mode enabled, but DDI services are unavailable, no USB iPhone is present, and the device is still not runnable.
- Preview/TestFlight preflights intentionally fail on unresolved release inputs and stale checked-in smoke artifacts.
- Secret verification intentionally fails without `CLOUDFLARE_API_TOKEN`; `wrangler whoami` still reports not logged in.
- Runtime-control continuation added `backend/guidepup-api/test/provider-runtime-controls.test.mjs`; `npm --prefix backend/guidepup-api run test:privacy` passed with the privacy redaction tests plus provider runtime-control coverage.
- Runtime-control continuation reran `npm --prefix backend/guidepup-api run types`, `npm --prefix backend/guidepup-api run typecheck`, staging and production Worker dry-runs, Expo typecheck/lint, voice-command and no-screen smoke contracts, iOS device readiness, release preflight preview/TestFlight gates, Build iOS Apps Release simulator build, and `git diff --check`.

## 2026-05-23 smoke evidence semantics continuation

The live smoke artifact now separates provider reachability from launch-contract validity:

- `providerBacked` means `/v1/vision/analyze` returned through the provider-backed execution path.
- `launchContract.valid` means the artifact also has structured output, sampled-frame envelope proof, and bounded runtime controls.
- Release preflight still requires both for TestFlight/store, and still separately checks the expected launch model and prompt version.

This preserves honest provider-backed request evidence for stale Workers while keeping submission blocked until staging/production are redeployed and smoked with `gpt-5.5`, prompt `2026-05-22.v1`, structured outputs, sampled-frame context, and runtime-control health fields.

Validation:

```bash
node --check backend/guidepup-api/eval/run-live-smoke.mjs
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging-semantics.json --output-md /tmp/guidepup-smoke-staging-semantics.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production-semantics.json --output-md /tmp/guidepup-smoke-production-semantics.md
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
```

Results:

- Staging live smoke: provider-backed `true`, `launchContract.valid: false`, `/health` request ID `b553605f-b523-4a6e-96fb-0cb74fa299ad`, `/v1/device/bootstrap` request ID `d887d24f-6dc7-430b-b770-d3a8952468ba`, `/v1/vision/analyze` request ID `46306d35-f28e-46d4-a9dc-14686320fe65`.
- Production live smoke: provider-backed `true`, `launchContract.valid: false`, `/health` request ID `00323ea2-1784-4574-9db4-68eccac0b690`, `/v1/device/bootstrap` request ID `3a15afe0-194f-4a6c-8aa2-558a036b578d`, `/v1/vision/analyze` request ID `59a565ea-1399-4214-9d39-54d3c210e131`.
- Both live Workers still report `gpt-4.1` / `2026-03-31.v1`; both are missing runtime-control health fields, `walkability`, and launch-valid structured output.
- Backend typecheck and backend privacy/runtime/prompt contract tests passed.

## P0 blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical device is paired with Developer Mode enabled, but unavailable/offline to Xcode right now.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` missing and Wrangler is not logged in.
- New backend structured-output contract and `gpt-5.5` config are local only until staging/prod are deployed and smoked again.
- New provider runtime controls are local/dry-run validated only until staging/prod are deployed and smoke artifacts include the new health fields.
- Expo/EAS build is blocked: `EXPO_TOKEN` missing and release inputs are unresolved.
- Sentry production health could not be queried because Sentry auth/org/project env vars are missing.

## 2026-05-23 strict smoke command continuation

The reusable npm smoke commands now behave as launch gates instead of just evidence writers. They still write JSON and
Markdown artifacts first, but `--require-launch-contract` makes the command exit nonzero when provider-backed execution,
the configured launch model, prompt version, runtime controls, sampled-frame envelope, or structured-output contract is
not launch-valid.

Changes:

- Added `--require-launch-contract`, `--expected-model`, and `--expected-prompt-version` to `backend/guidepup-api/eval/run-live-smoke.mjs`.
- Updated `npm run smoke:staging` and `npm run smoke:production` to use strict launch-contract mode by default.
- Updated backend eval docs and no-screen smoke contract checks so this strict smoke behavior stays covered.

Validation:

```bash
node --check backend/guidepup-api/eval/run-live-smoke.mjs
npm --prefix expo run check:no-screen-smoke
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --require-launch-contract --output-json /tmp/guidepup-strict-smoke-staging.json --output-md /tmp/guidepup-strict-smoke-staging.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --require-launch-contract --output-json /tmp/guidepup-strict-smoke-production.json --output-md /tmp/guidepup-strict-smoke-production.md
```

Results:

- Staging strict smoke wrote `/tmp/guidepup-strict-smoke-staging.json` and `/tmp/guidepup-strict-smoke-staging.md`, then exited nonzero as intended. Request IDs: `/health` `d8e0a68d-74d8-4214-bad4-8288dfe885b7`, `/v1/device/bootstrap` `f0e42eec-5732-4288-af55-d0dd34f28bc1`, `/v1/vision/analyze` `fec32c44-691c-4e9a-92fc-2b891316fd65`.
- Production strict smoke wrote `/tmp/guidepup-strict-smoke-production.json` and `/tmp/guidepup-strict-smoke-production.md`, then exited nonzero as intended. Request IDs: `/health` `6b849601-987f-4ab2-b9af-682533fb67e7`, `/v1/device/bootstrap` `658e9b09-49d6-4272-a62c-ef377dec94b2`, `/v1/vision/analyze` `4e436b40-8cb4-424d-9bcc-7cac46b72660`.
- Both strict smoke runs are provider-backed but launch-invalid because the live Workers still report `gpt-4.1` / `2026-03-31.v1`, lack runtime-control health fields, and omit `walkability` and `fallbackReason`.
