# phase-quality1-guidance-reliability

Date: 2026-05-23
Branch: `codex/guidepup-credentialed-launch`
Commit at phase start: `52e28d2`
Contract-tightening continuation start: `bf3da45`

## Scope

This phase improves guidance-reliability evidence without changing the app/backend ownership boundary:

- Cloud smoke and eval now prove the sampled-frame request envelope instead of only proving that `/v1/vision/analyze` returned JSON.
- Release preflight now rejects launch smoke that is provider-backed but missing the structured guidance fields needed for blind-user validation.
- iOS diagnostics now exports the same non-secret analyze metadata that the app sends to the cloud: session ID, frame ID, native path, source size, prior guidance summary, and structured response fields.
- The compact frame context now includes sanitized frame summary and capture heuristics so GPT receives explicit sampled-frame provenance without moving camera/session control out of iOS.
- Backend provider runtime now has bounded launch controls for output tokens, request timeout, retry count, and retry delay; health, smoke artifacts, and release preflight must expose those controls before submission evidence is accepted.
- Backend prompt instructions now explicitly keep GPT in the cloud analysis lane: sampled-frame judgment, walkability/hazard/surface/lighting/confidence scoring, and concise spoken guidance only. Camera sessions, route navigation, STOP behavior, haptics, VoiceOver, speech rate, detail level, and timing stay deterministic on iOS.
- `walkability` is now first-class launch evidence instead of prompt-only intent: the backend response schema, normalizer, live smoke, eval harness, release preflight, client API validation, diagnostics, and no-screen evidence schema all require or carry it.

No provider keys, raw images, raw audio, credentials, or signed URLs were logged. Smoke artifacts record `hasImage: true` and image metadata only, not image content.

## Code and docs changed

- `backend/guidepup-api/eval/run-live-smoke.mjs`
  - Sends `sessionId`, `frameId`, `timestampMs`, `nativePath`, `priorGuidance`, source dimensions, app version, platform, and one sampled image.
  - Sends `hasImage`, `sampledFrame`, sanitized `frameSummary`, and `captureHeuristics` in the actual analyze POST body, not just the artifact.
  - Adds structured output validation for `direction`, `hazardLevel`, `obstacle`, `message`, `sceneDescription`, `surfaceType`, `lighting`, `confidence`, `provider`, `model`, `promptVersion`, and `fallbackReason`.
  - Writes a sanitized request envelope to JSON and markdown smoke artifacts.
- `backend/guidepup-api/eval/run-eval.mjs`
  - Sends the same compact envelope to analyze and benchmark routes.
  - Marks fixture results invalid when required structured fields are missing, so STOP recall and false-forward metrics do not silently count weak responses as valid.
- `backend/guidepup-api/eval/manifest.schema.mjs`
  - Adds optional fixture metadata for frame/session/native-path/source-size/prior-guidance and expected lighting/surface labels.
- `expo/scripts/release-preflight.mjs`
  - Requires production/TestFlight smoke artifacts to include provider-backed analyze, request IDs for health/bootstrap/analyze, sampled-frame envelope evidence, sanitized frame summary/capture heuristics, and the full structured field set.
  - Preview smoke reports the same evidence gap as a warning unless strict preview provider mode is requested.
- `expo/src/lib/api.ts`, `expo/src/lib/diagnostics.ts`, and `expo/src/screens/DiagnosticsScreen.tsx`
  - Preserve and display sanitized analyze metadata plus `lighting`, `surfaceType`, `sceneDescription`, `obstacle`, `fallbackReason`, frame summary, and capture heuristics.
- `expo/src/native/GuidePupNavigationCore.ts`
  - Records sanitized haptic attempt/outcome diagnostics for blind-validation evidence without claiming physical feedback.
- `backend/guidepup-api/eval/README.md` and `smoke-results-template.md`
  - Document the new evidence fields and eval manifest metadata.
- `backend/guidepup-api/src/schemas/vision.ts`, `backend/guidepup-api/src/lib/normalize.ts`, and `backend/guidepup-api/src/lib/prompts.ts`
  - Make `fallbackReason`, `lighting`, `sceneDescription`, and `surfaceType` required response-contract fields.
  - Keep `fallbackReason: null` for successful provider-backed guidance and explicit fallback reasons for safe stops.
  - Allow `lighting: unknown` only for honest safe fallback when no scene analysis exists.
  - Require provider structured output to include lighting, scene description, and surface type before normalization.
- `expo/src/lib/api.ts` and `expo/src/logic/GuideAI.ts`
  - Make the client reject analyze responses that omit the launch-required structured fields.
  - Preserve explicit safe-stop metadata when local analysis is unavailable.
- `backend/guidepup-api/src/providers/openai-compatible.ts`, `backend/guidepup-api/src/providers/index.ts`, `backend/guidepup-api/src/routes/health.ts`, and `backend/guidepup-api/wrangler.jsonc`
  - Add bounded provider runtime controls: `OPENAI_MAX_COMPLETION_TOKENS=700`, `OPENAI_REQUEST_TIMEOUT_MS=12000`, `OPENAI_RETRY_COUNT=1`, and `OPENAI_RETRY_DELAY_MS=250`.
  - Clamp runtime values to safe ranges and retry only retryable provider failures (`408`, `429`, `5xx`, and request aborts).
  - Surface the configured values in `/health` provider summary without exposing provider secrets.
- `backend/guidepup-api/test/provider-runtime-controls.test.mjs`, `expo/scripts/release-preflight.mjs`, and `expo/scripts/check-no-screen-smoke-contract.mjs`
  - Assert the runtime controls are present in Worker config, health, live smoke evidence, and TestFlight preflight gates.
- `backend/guidepup-api/src/lib/prompts.ts` and `backend/guidepup-api/test/vision-prompt-contract.test.mjs`
  - Tighten the launch prompt so provider guidance treats the input as one sampled frame, uses prior guidance only to avoid repetition, recommends forward only with clear walkability, and never suggests changing iOS-owned controls.
  - Add a prompt contract test for deterministic-lane boundaries, concise spoken `shortMessage` requirements, and compact frame context without raw image data.
- `backend/guidepup-api/src/schemas/vision.ts`, `backend/guidepup-api/src/lib/normalize.ts`, `backend/guidepup-api/eval/*`, `expo/scripts/release-preflight.mjs`, `expo/src/lib/api.ts`, `expo/src/lib/diagnostics.ts`, `expo/src/screens/DiagnosticsScreen.tsx`, and `expo/scripts/no-screen-smoke-evidence.mjs`
  - Promote `walkability` to required structured output and launch evidence.
  - Set safe fallback walkability to `uncertain`.
  - Add eval fixture `expectedWalkability` labels and mismatch reporting.
  - Show walkability in Diagnostics and no-screen evidence drafts without raw media.

## Live smoke evidence

Commands were run to scratch files under `/tmp` so stale tracked `latest` artifacts were not overwritten:

```bash
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging-current.json --output-md /tmp/guidepup-smoke-staging-current.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production-current.json --output-md /tmp/guidepup-smoke-production-current.md
```

Staging result:

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `c4fa58f0-b068-4e6e-9dff-c1f4ecb8b7f0`
- `/v1/device/bootstrap`: `200 OK`, request ID `2f73ea4d-04cb-410d-8b3b-ddc41d938f80`
- `/v1/vision/analyze`: `200 OK`, request ID `93b8509d-9113-4a65-a06d-9756a4c7b020`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Envelope evidence: present (`sampledFrame: true`, `hasImage: true`, session ID, frame ID, timestamp, `nativePath: js-fallback`, `40x40` source size, frame summary, capture heuristics)
- Structured output validity: `false`
- Missing structured field from live raw response: `fallbackReason`

Production result:

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `703749f5-7315-405c-93a1-b18d34b84f7c`
- `/v1/device/bootstrap`: `200 OK`, request ID `70ca681e-cfc5-4449-aa0a-d534fd51989d`
- `/v1/vision/analyze`: `200 OK`, request ID `47f9986b-59f2-4c89-9e89-8a62ba26ddeb`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Envelope evidence: present (`sampledFrame: true`, `hasImage: true`, session ID, frame ID, timestamp, `nativePath: js-fallback`, `40x40` source size, frame summary, capture heuristics)
- Structured output validity: `false`
- Missing structured field from live raw response: `fallbackReason`

Important: the stricter smoke harness correctly stops these runs from being treated as launch-valid, even though the analyze endpoint is provider-backed. The live Workers still need deployment of the local `gpt-5.5` / `2026-05-22.v1` structured-output contract.

Runtime-control continuation smoke on 2026-05-23, also written only to `/tmp` artifacts:

- Staging `/health`: request ID `c9bc43c3-0285-41ec-a0d8-56b7822bf0ac`
- Staging `/v1/device/bootstrap`: request ID `9898d848-47f1-466c-aa6e-0c58ac355ba2`
- Staging `/v1/vision/analyze`: request ID `841657a1-1efa-49c4-99f2-1b5ca3d80df7`
- Staging execution path: `provider-backed`, but launch-invalid because the live Worker still reports `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, omits `fallbackReason`, and does not expose the new runtime-control health fields.
- Production `/health`: request ID `cd19dbc7-ea36-415c-83a5-ef8070e759d5`
- Production `/v1/device/bootstrap`: request ID `5153558c-7707-4dd2-ba49-c18b0d6a8123`
- Production `/v1/vision/analyze`: request ID `289ef798-9c70-41db-b1e6-d6886a11711f`
- Production execution path: `provider-backed`, but launch-invalid for the same stale model, prompt, missing `fallbackReason`, and missing runtime-control health fields.

Prompt-boundary continuation smoke on 2026-05-23, also written only to `/tmp` artifacts after the local prompt contract change:

- Staging `/health`: request ID `abb36035-bc61-4ae9-b930-26d269d9be43`
- Staging `/v1/device/bootstrap`: request ID `538c8bae-3e5c-4714-abd9-8066596a45c3`
- Staging `/v1/vision/analyze`: request ID `9e0b0643-f427-4a19-82d2-c59040c8faf9`
- Staging execution path: `provider-backed`, but launch-invalid because the live Worker still reports `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, omits `fallbackReason`, and does not expose the new prompt/runtime contract.
- Production `/health`: request ID `1e97aa89-6422-4466-b887-8b2c36d95fa1`
- Production `/v1/device/bootstrap`: request ID `d23f2f31-67e9-413e-bb08-e60aa8fbec5c`
- Production `/v1/vision/analyze`: request ID `8c62b27b-0320-489f-8dea-19f3a583997d`
- Production execution path: `provider-backed`, but launch-invalid for the same stale model, prompt, missing `fallbackReason`, and missing runtime-control health fields.

Walkability contract continuation smoke on 2026-05-23, also written only to `/tmp` artifacts after `walkability` became required launch evidence:

- Staging `/health`: request ID `9165bf62-9c02-46b3-90de-381611c8daf8`
- Staging `/v1/device/bootstrap`: request ID `139e323a-278d-474d-8e9b-f4500daef376`
- Staging `/v1/vision/analyze`: request ID `a5001b5c-8379-446c-b72c-566bb1133b18`
- Staging execution path: `provider-backed`, but launch-invalid because the live Worker still reports `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, and now misses both `walkability` and `fallbackReason`.
- Production `/health`: request ID `8c7664de-ec1f-4ad6-9eb8-3338db8c62bd`
- Production `/v1/device/bootstrap`: request ID `8006381d-1e7d-4dac-a787-00cbe7e4253a`
- Production `/v1/vision/analyze`: request ID `c99d1628-b06c-451d-b04d-5aeb5ddce41b`
- Production execution path: `provider-backed`, but launch-invalid for the same stale model, prompt, missing `walkability`, missing `fallbackReason`, and missing runtime-control health fields.

## Validation

Commands run:

```bash
node --check backend/guidepup-api/eval/run-live-smoke.mjs
node --check backend/guidepup-api/eval/run-eval.mjs
node --check backend/guidepup-api/eval/manifest.schema.mjs
node --check expo/scripts/check-no-screen-smoke-contract.mjs
node --check expo/scripts/release-preflight.mjs
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run typecheck
node --check backend/guidepup-api/eval/run-eval.mjs
node --check backend/guidepup-api/eval/run-live-smoke.mjs
node --check backend/guidepup-api/eval/manifest.schema.mjs
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:voice-commands
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run typecheck
npm --prefix expo run lint
npx wrangler deploy --dry-run --env staging
git diff --check
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
mcp__xcodebuildmcp__.session_show_defaults
mcp__xcodebuildmcp__.discover_projs
mcp__xcodebuildmcp__.list_schemes
mcp__xcodebuildmcp__.list_sims
mcp__xcodebuildmcp__.session_set_defaults
mcp__xcodebuildmcp__.build_sim
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- ESM syntax checks passed.
- Backend typecheck passed.
- Backend privacy/runtime/prompt contract tests passed, including the new prompt boundary checks for sampled-frame analysis, deterministic iOS controls, concise spoken guidance, and compact context without raw image data.
- Backend privacy/runtime/prompt contract tests passed after promoting `walkability`; the prompt contract test now asserts `walkability` remains required in provider and launch response contracts.
- Backend typecheck and eval/live-smoke/manifest syntax checks passed after the `walkability` contract change.
- Expo typecheck, lint, voice-command contract, no-screen smoke contract, no-screen evidence schema tests, staging/production dry-run Worker bundles, and Build iOS Apps Release simulator build passed after the `walkability` contract change.
- Preview/TestFlight/store preflight still fails as expected, and the stale smoke evidence now explicitly reports missing `analyze.walkability` in addition to the previous missing fields.
- Expo typecheck passed.
- Expo lint passed.
- `git diff --check` passed.
- After the contract-tightening continuation, backend typecheck, Expo typecheck, Expo lint, ESM syntax checks, and `git diff --check` were rerun and passed with required `fallbackReason`, `lighting`, `sceneDescription`, and `surfaceType` schemas.
- After the contract-tightening continuation, TestFlight preflight was rerun and still failed on unresolved release inputs plus the tracked production smoke artifact missing the new envelope/structured evidence fields.
- After the contract-tightening continuation, Build iOS Apps plugin `build_sim` again hit the 120 second tool timeout; the shell fallback Release simulator build for `iPhone 16e` passed with `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- Live scratch smoke ran successfully but is intentionally not launch-valid until live Workers emit the complete structured response.
- Preview preflight still failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER` and warned that the tracked staging smoke artifact is missing the new envelope/structured evidence fields.
- TestFlight preflight still failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and the tracked production smoke artifact missing the new envelope/structured evidence fields.
- Build iOS Apps plugin defaults were empty in this tool session, so the workspace, scheme, and `iPhone 16e` simulator were discovered and set explicitly.
- Build iOS Apps plugin `build_sim` hit the 120 second tool timeout. The underlying `xcodebuild` process was allowed to finish before running a shell fallback.
- Release simulator shell build for `iPhone 16e` passed with third-party warnings and `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- Latest continuation added sanitized frame summary/capture heuristics, haptic diagnostics, and the local no-screen smoke contract check.
- Latest validation passed: ESM syntax checks, backend typecheck, Expo typecheck, Expo lint, `check:voice-commands`, `check:no-screen-smoke`, `git diff --check`, Cloudflare staging dry-run bundle validation, scratch staging/production live smoke generation, and Build iOS Apps plugin Release simulator build for `iPhone 16e`.
- Latest preview/testflight preflight still blocks on unresolved release inputs and stale tracked smoke artifacts; the stale smoke evidence now also reports missing `requestEnvelope.captureHeuristics` and `requestEnvelope.frameSummary`.
- Runtime-control continuation validation passed: backend privacy/runtime tests, backend typecheck, Worker type regeneration, staging and production Worker dry-run bundle validation, Expo typecheck, Expo lint, voice-command contract, no-screen smoke contract, iOS device readiness check, release preflight preview/TestFlight gates, Build iOS Apps Release simulator build, and `git diff --check`.
- Runtime-control continuation preflight correctly rejects stale checked-in smoke because it lacks `health.defaultMaxCompletionTokens`, `health.defaultRequestTimeoutMs`, `health.defaultRetryCount`, and `health.defaultRetryDelayMs`.

## Auth and plugin status

Commands and plugin checks:

```bash
gh auth status
npx --yes wrangler whoami
node -e 'for (const k of [...]) console.log(...)'
mcp__codex_apps__github._get_pr_info
mcp__codex_apps__hugging_face._hf_whoami
```

Results:

- GitHub CLI is authenticated as `charlie2233`.
- GitHub connector confirms PR #4 is open, draft, mergeable, and still points at `codex/guidepup-credentialed-launch`; PR head before this continuation was `efa5e34`.
- Hugging Face connector is authenticated as `Chargers`; MiniCPM remains experimental and was not moved into production guidance.
- `CLOUDFLARE_API_TOKEN`, local `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN` are missing in this shell.
- `npx --yes wrangler whoami` failed with `Failed to fetch auth token` / `Not logged in`.
- Sentry project health could not be queried because Sentry auth/org/project env vars are missing and no Sentry connector was available in this tool session.

## Remaining blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode in prior device checks.
- Cloudflare deploy/auth is blocked in this shell: `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- Live staging and production Workers are still on `gpt-4.1` / prompt `2026-03-31.v1`; they need redeploy and fresh smoke before TestFlight.
- Production smoke now fails the structured launch gate because the live raw analyze response omits `walkability` and `fallbackReason`.
- Provider runtime controls are local and dry-run validated, but not launch evidence until staging and production Workers are deployed and fresh smoke artifacts contain the new `/health` runtime fields.
- Expo/EAS build and submission remain blocked by missing `EXPO_TOKEN` and unresolved iOS bundle ID, Apple Team ID, App Store Connect App ID, and copyright holder.
- The eval harness still lacks real local fixture images; `eval/sample-manifest.json` is a placeholder and is not blind-validation proof.
