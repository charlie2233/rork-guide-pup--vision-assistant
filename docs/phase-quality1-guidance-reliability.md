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

No provider keys, raw images, raw audio, credentials, or signed URLs were logged. Smoke artifacts record `hasImage: true` and image metadata only, not image content.

## Code and docs changed

- `backend/guidepup-api/eval/run-live-smoke.mjs`
  - Sends `sessionId`, `frameId`, `timestampMs`, `nativePath`, `priorGuidance`, source dimensions, app version, platform, and one sampled image.
  - Adds structured output validation for `direction`, `hazardLevel`, `obstacle`, `message`, `sceneDescription`, `surfaceType`, `lighting`, `confidence`, `provider`, `model`, `promptVersion`, and `fallbackReason`.
  - Writes a sanitized request envelope to JSON and markdown smoke artifacts.
- `backend/guidepup-api/eval/run-eval.mjs`
  - Sends the same compact envelope to analyze and benchmark routes.
  - Marks fixture results invalid when required structured fields are missing, so STOP recall and false-forward metrics do not silently count weak responses as valid.
- `backend/guidepup-api/eval/manifest.schema.mjs`
  - Adds optional fixture metadata for frame/session/native-path/source-size/prior-guidance and expected lighting/surface labels.
- `expo/scripts/release-preflight.mjs`
  - Requires production/TestFlight smoke artifacts to include provider-backed analyze, sampled-frame envelope evidence, and the full structured field set.
  - Preview smoke reports the same evidence gap as a warning unless strict preview provider mode is requested.
- `expo/src/lib/api.ts`, `expo/src/lib/diagnostics.ts`, and `expo/src/screens/DiagnosticsScreen.tsx`
  - Preserve and display sanitized analyze metadata plus `lighting`, `surfaceType`, `sceneDescription`, `obstacle`, and `fallbackReason`.
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

## Live smoke evidence

Commands were run to scratch files under `/tmp` so stale tracked `latest` artifacts were not overwritten:

```bash
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging.json --output-md /tmp/guidepup-smoke-staging.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production.json --output-md /tmp/guidepup-smoke-production.md
```

Staging result:

- API: `https://guidepup-api-staging.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `e3d5709e-7b55-4799-a10d-0ad25a5515dc`
- `/v1/device/bootstrap`: `200 OK`, request ID `1b3a258f-4941-44f7-b2e0-2dee969e0424`
- `/v1/vision/analyze`: `200 OK`, request ID `6f034a67-4186-4daa-a8ab-c2d35364fd93`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Envelope evidence: present (`sampledFrame: true`, `hasImage: true`, session ID, frame ID, timestamp, `nativePath: js-fallback`, `40x40` source size)
- Structured output validity: `false`
- Missing structured field from live raw response: `fallbackReason`

Production result:

- API: `https://guidepup-api-production.charliehan-lifepage.workers.dev`
- `/health`: `200 OK`, request ID `5ec8f47a-02f6-46a6-a6f6-2c0e8d16c63c`
- `/v1/device/bootstrap`: `200 OK`, request ID `b2c48b9c-66ba-45f8-957a-8b650c655b6b`
- `/v1/vision/analyze`: `200 OK`, request ID `61565dd0-502c-4edf-8349-a8543a10a954`
- Execution path: `provider-backed`
- Provider/model: `openai-compatible` / `gpt-4.1-2025-04-14`
- Prompt version: `2026-03-31.v1`
- Envelope evidence: present (`sampledFrame: true`, `hasImage: true`, session ID, frame ID, timestamp, `nativePath: js-fallback`, `40x40` source size)
- Structured output validity: `false`
- Missing structured field from live raw response: `fallbackReason`

Important: the stricter smoke harness correctly stops these runs from being treated as launch-valid, even though the analyze endpoint is provider-backed. The live Workers still need deployment of the local `gpt-5.5` / `2026-05-22.v1` structured-output contract.

## Validation

Commands run:

```bash
node --check backend/guidepup-api/eval/run-live-smoke.mjs
node --check backend/guidepup-api/eval/run-eval.mjs
node --check backend/guidepup-api/eval/manifest.schema.mjs
node --check expo/scripts/release-preflight.mjs
npm --prefix backend/guidepup-api run typecheck
npm --prefix expo run typecheck
npm --prefix expo run lint
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
- GitHub connector confirms PR #4 is open, draft, mergeable, and still points at `codex/guidepup-credentialed-launch`; PR head at inspection time was `52e28d2`.
- Hugging Face connector is authenticated as `Chargers`; MiniCPM remains experimental and was not moved into production guidance.
- `CLOUDFLARE_API_TOKEN`, local `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN` are missing in this shell.
- `npx --yes wrangler whoami` failed with `Failed to fetch auth token` / `Not logged in`.
- Sentry project health could not be queried because Sentry auth/org/project env vars are missing and no Sentry connector was available in this tool session.

## Remaining blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode in prior device checks.
- Cloudflare deploy/auth is blocked in this shell: `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- Live staging and production Workers are still on `gpt-4.1` / prompt `2026-03-31.v1`; they need redeploy and fresh smoke before TestFlight.
- Production smoke now fails the structured launch gate because the live raw analyze response omits `fallbackReason`.
- Expo/EAS build and submission remain blocked by missing `EXPO_TOKEN` and unresolved iOS bundle ID, Apple Team ID, App Store Connect App ID, and copyright holder.
- The eval harness still lacks real local fixture images; `eval/sample-manifest.json` is a placeholder and is not blind-validation proof.
