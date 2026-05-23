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

## P0 blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical device is paired with Developer Mode enabled, but unavailable/offline to Xcode right now.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` missing and Wrangler is not logged in.
- New backend structured-output contract and `gpt-5.5` config are local only until staging/prod are deployed and smoked again.
- Expo/EAS build is blocked: `EXPO_TOKEN` missing and release inputs are unresolved.
- Sentry production health could not be queried because Sentry auth/org/project env vars are missing.
