# phase-launch1-internal-testflight-smoke

Date: 2026-05-22
Branch: `codex/guidepup-credentialed-launch`
Commit at phase start: `c2b8781`

## Scope

This phase advances internal TestFlight readiness without claiming external gates are solved. It fixes launch-facing disclosure copy so the public site, App Review notes, and release docs match the current iOS behavior: Guide Pup uses camera frames for scene guidance, and optional hands-free voice commands request microphone and iOS speech-recognition permissions for a bounded deterministic command lane.

No provider keys, raw images, raw audio, credentials, or signed URLs were logged. No direct model calls or provider secrets were added to the shipping client.

## Code and docs changed

- Updated public home and privacy copy to disclose optional microphone and iOS speech-recognition use for voice commands.
- Updated public site README behavior notes to remove the stale "no microphone" claim.
- Updated App Review notes with microphone/speech-recognition permission explanation and bounded-command language.
- Updated privacy answer matrix so Apple privacy answers do not incorrectly say microphone is not requested.
- Updated TestFlight checklist to validate microphone and speech-recognition permission prompts during hands-free command smoke.
- Updated launch inputs release notes to match the current shipping behavior.
- Updated the in-app camera-permission fallback copy to say "iOS speech recognition" rather than overclaiming on-device speech recognition.
- Added a versioned Xcode env guard so iOS simulator builds skip Sentry source-map/debug-symbol upload attempts unless explicitly overridden. This keeps local/plugin simulator validation from requiring Sentry org/project credentials while leaving device/archive/TestFlight upload behavior unchanged.
- Tightened release preflight so provider-backed smoke is not launch-valid unless staging/production evidence also matches the expected `gpt-5.5` model, `2026-05-22.v1` prompt, sampled-frame envelope, structured output validity, and nullable `fallbackReason`.
- Hardened no-screen voice behavior for repeated commands, permission denial fallbacks, scene-query-in-progress responses, stale scene-query answers, and placeholder SOS copy.

## Evidence gathered

Repository state before edits:

```bash
git fetch --all --prune
git pull --ff-only
git status --short --branch
git log --oneline -5
```

Results:

- Branch was already up to date with `origin/codex/guidepup-credentialed-launch`.
- Latest commit before this phase: `c2b8781 Harden GuidePup voice command lane`.
- GitHub connector confirmed open PR #4, `Credentialed launch execution`, from `codex/guidepup-credentialed-launch`; it remains draft.

Auth and provider status:

```bash
for v in CLOUDFLARE_API_TOKEN OPENAI_API_KEY EXPO_TOKEN SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT HUGGINGFACE_HUB_TOKEN HF_TOKEN; do ...; done
gh auth status
npx wrangler whoami
```

Results:

- GitHub CLI is authenticated as `charlie2233`.
- Hugging Face connector is authenticated, but no MiniCPM production comparison was run in this phase.
- `CLOUDFLARE_API_TOKEN`, local `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN` are missing in this shell.
- `npx wrangler whoami` failed with `Not logged in`.

Device status:

```bash
xcrun devicectl list devices
xcrun xctrace list devices
xcrun devicectl device info details --device E5786BB6-0095-5509-8B85-110C0B5CE6D3
```

Results:

- `charlie的iPhone`, iPhone 15 Pro, is paired but `unavailable`.
- `xcrun xctrace list devices` shows `charlie的iPhone (26.4.2)` under `Devices Offline`.
- Device details show Developer Mode `enabled`, pairing state `paired`, tunnel state `unavailable`, UDID `00008130-000A001A1178001C`, and last connection `2026-05-05 22:31:40 +0000`.

Release gate status during this phase:

```bash
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
```

Results:

- Preview preflight failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`.
- TestFlight preflight failed on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, and `TODO_COPYRIGHT_HOLDER`.
- Both tracks warn that Sentry env values are not set in this shell.

Validation during this phase:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run types
git diff --check
rg -n "does not request microphone|shipping path does not request|shipping navigation path does not request|microphone access: not|does not record audio|shipping client does not request microphone" site expo/docs expo/app.json expo/ios/GuidePupVisionAssistant/Info.plist
```

Results:

- Expo typecheck passed.
- Expo lint passed.
- Backend typecheck passed.
- Worker types regenerated for local `gpt-5.5`, low reasoning effort, and prompt version `2026-05-22.v1`.
- `git diff --check` passed.
- The stale "does not request microphone" disclosure grep returned no matches in launch-facing site/docs/config surfaces.

iOS build validation:

```bash
mcp__xcodebuildmcp__.session_show_defaults
mcp__xcodebuildmcp__.build_sim({"extraArgs":["-quiet"]})
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- Build iOS Apps plugin defaults resolved workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, configuration `Release`, simulator `iPhone 16e`.
- Build iOS Apps plugin compile timed out at the 120 second tool boundary, so the underlying process was checked before starting a shell fallback.
- Release simulator shell build passed for the `iPhone 16e` simulator with third-party warnings and `SENTRY_DISABLE_AUTO_UPLOAD=true`.

Continuation on `2026-05-22` after commit `390e372`:

```bash
git fetch --all --prune
git pull --ff-only
npx --yes wrangler whoami
node -e "for (const k of ['CLOUDFLARE_API_TOKEN','OPENAI_API_KEY','EXPO_TOKEN','SENTRY_AUTH_TOKEN','SENTRY_ORG','SENTRY_PROJECT','HUGGINGFACE_HUB_TOKEN','HF_TOKEN']) console.log(k + '=' + (process.env[k] ? 'set' : 'missing'))"
```

Results:

- Repo sync: already up to date with `origin/codex/guidepup-credentialed-launch`.
- Cloudflare remains blocked: Wrangler returned `Not logged in`.
- Local env remains missing `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `HUGGINGFACE_HUB_TOKEN`, and `HF_TOKEN`.
- Hugging Face connector is authenticated as `Chargers`; no MiniCPM production comparison was run in this continuation.
- Prior Build iOS Apps plugin validation failed before app validation because the Sentry Xcode script attempted a simulator source-map upload without Sentry org/project env. The versioned `.xcode.env` now defaults `SENTRY_DISABLE_AUTO_UPLOAD=true` and `SENTRY_ALLOW_FAILURE=true` only when `PLATFORM_NAME` is a simulator target.
- Preflight now treats checked-in live smoke as stale until it proves the launch backend contract, not just provider reachability.

Validation after the continuation:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix backend/guidepup-api run typecheck
git diff --check
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs -quiet CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
```

Results:

- Expo typecheck: passed.
- Expo lint: passed.
- Backend typecheck: passed.
- `git diff --check`: passed.
- Preview preflight: still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`; now warns that staging smoke is stale for the launch contract (`gpt-4.1` / `2026-03-31.v1`, missing sampled-frame envelope and nullable `fallbackReason`).
- TestFlight preflight: still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER`, `TODO_APPLE_TEAM_ID`, `TODO_APP_STORE_CONNECT_APP_ID`, `TODO_COPYRIGHT_HOLDER`, and stale production smoke contract (`gpt-4.1` / `2026-03-31.v1`, missing sampled-frame envelope and nullable `fallbackReason`).
- Build iOS Apps plugin Release simulator build now passes for workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, simulator `iPhone 16e`, after the simulator-only Sentry upload guard.

## Backend request IDs

No new provider-backed live smoke was run in this phase because Cloudflare auth is missing. Last known live provider-backed request IDs remain from `phase-backend1-provider-backed-analyze-smoke`:

- Staging `/health`: `1135d81c-65d5-4910-af55-ec9ed7932869`
- Staging `/v1/device/bootstrap`: `6985c962-725b-4305-b316-2e923adb2bd8`
- Staging `/v1/vision/analyze`: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Production `/health`: `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
- Production `/v1/device/bootstrap`: `bc18b829-1200-4bee-a9f0-839010435a5a`
- Production `/v1/vision/analyze`: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`

Important: live Workers are still provider-backed but have not been redeployed with the local `gpt-5.5` / `2026-05-22.v1` structured-output contract.

## Submission review on 2026-05-23

Decision: do not submit to TestFlight or App Store yet.

Reasoning:

- TestFlight must be first, but TestFlight preflight still fails on unresolved release inputs: iOS bundle identifier, Apple Team ID, App Store Connect App ID, and copyright holder.
- `EXPO_TOKEN` is missing in this shell, so EAS build/submit cannot be authenticated.
- Live staging and production Workers are provider-backed, but still stale for the launch contract: `gpt-4.1-2025-04-14`, prompt `2026-03-31.v1`, missing `fallbackReason`, and missing the new provider runtime-control health fields.
- Cloudflare deployment remains blocked because `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- Real iPhone no-screen smoke is still not validated because the paired device is unavailable/offline to Xcode.
- TestFlight/store preflight now also requires `expo/release/no-screen-smoke.latest.json`, a machine-readable real-iPhone no-screen artifact; static checks and simulator builds no longer satisfy this gate.
- The Diagnostics screen can now export a sanitized no-screen JSON draft that carries runtime diagnostics, health/bootstrap/analyze request IDs, haptic/audio counts, camera path evidence, and placeholder tester attestations for the real iPhone run.
- Sentry issue health remains unverified because Sentry auth/org/project env vars are missing.

Commands rerun for this submission review:

```bash
npm --prefix backend/guidepup-api run test:privacy
npm --prefix backend/guidepup-api run types
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run deploy:dry-run -- --env staging
npm --prefix backend/guidepup-api run deploy:dry-run -- --env production
node backend/guidepup-api/eval/run-live-smoke.mjs --env staging --output-json /tmp/guidepup-smoke-staging-current.json --output-md /tmp/guidepup-smoke-staging-current.md
node backend/guidepup-api/eval/run-live-smoke.mjs --env production --output-json /tmp/guidepup-smoke-production-current.json --output-md /tmp/guidepup-smoke-production-current.md
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npm --prefix backend/guidepup-api run verify:secrets:staging
npm --prefix backend/guidepup-api run verify:secrets:production
npx --yes wrangler whoami
git diff --check
```

Build iOS Apps plugin Release simulator build for `GuidePupVisionAssistant` on `iPhone 16e` also passed during this review with `CODE_SIGNING_ALLOWED=NO`, `ONLY_ACTIVE_ARCH=YES`, and `COMPILER_INDEX_STORE_ENABLE=NO`.

Expected failures in the submission review:

- `release:preflight:preview` fails on unresolved bundle identifier and stale staging smoke warnings.
- `release:preflight:testflight` and `release:preflight:store` fail on unresolved Apple release inputs, stale production smoke, and missing `release/no-screen-smoke.latest.json`.
- `check:no-screen-evidence` fails until real hardware validation produces the sanitized no-screen artifact.
- The Diagnostics export draft is intentionally not launch evidence by itself; the tester must fill the real no-screen, VoiceOver, haptic/audio, settings-persistence, device-readiness, and privacy attestations after the hardware run.
- `verify:secrets:staging`, `verify:secrets:production`, and `wrangler whoami` fail because `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.

Browser, Computer Use, ChatGPT Atlas, and App Store Connect were not used to submit because submission would be invalid before these gates pass. WhatsApp escalation was not needed for this review because the blockers are explicit release/auth/device inputs, not an ambiguous login screen.

## Public config gate continuation

The release preflight now fails TestFlight/store when final public support and safety inputs are still placeholders, not only when Apple identifiers are unresolved.

Changes:

- EAS preview, TestFlight, and store profiles now carry `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_SUPPORT_URL`, `EXPO_PUBLIC_SUPPORT_EMAIL`, and `EXPO_PUBLIC_EMERGENCY_DISCLAIMER` from the launch-input contract.
- `release-preflight` now verifies public privacy, support, and safety pages exist in `site/`.
- `release-preflight` now checks iOS camera, microphone, and speech-recognition permission strings are present.
- TestFlight/store preflight now hard-block on unresolved `TODO_SUPPORT_EMAIL` and `TODO_EMERGENCY_SAFETY_DISCLAIMER`, so builds cannot silently ship fallback support/safety copy when final public launch copy is still missing.
- TestFlight/store preflight now also inspects `site/support/index.html` and blocks launch-internal placeholder phrases or a support page that does not include the configured support email from `expo/release/launch-inputs.js`.

Validation:

```bash
node --check expo/scripts/release-preflight.mjs
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
```

Results:

- Script syntax check passed.
- Preview preflight still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER` and stale staging smoke warnings.
- TestFlight/store preflight now also fail on public support-page readiness: the support page still contains launch-internal placeholder phrases and the configured support email is unresolved.
- TestFlight/store remain blocked on unresolved Apple identifiers, copyright holder, emergency/safety disclaimer, stale production smoke contract, missing no-screen evidence, and Sentry env warnings.

## Smoke evidence privacy continuation

Release preflight now also scans provider-backed smoke artifacts for raw media and secret-bearing fields before they can support TestFlight/store readiness. The shared privacy scanner flags provider keys, bearer tokens, session tokens, raw image/audio fields, signed URLs, data-URL media, and long base64-like payloads.

Validation:

```bash
npm --prefix expo run test:smoke-evidence
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npm --prefix expo run release:preflight:store
npx wrangler whoami
npx eas-cli@latest whoami
```

Results:

- Smoke evidence privacy tests passed for valid provider-backed artifacts and reject raw image payload fields, bootstrap session tokens, raw media snippets, bearer tokens, and signed URLs.
- Preview preflight failed as expected on unresolved bundle identifier and stale staging smoke evidence.
- TestFlight/store preflights failed as expected on unresolved Apple/support/safety inputs, stale production smoke evidence, and missing real-iPhone no-screen artifact.
- Cloudflare CLI reports `Not logged in`; EAS CLI reports `Not logged in`; local env presence checks show `CLOUDFLARE_API_TOKEN`, `OPENAI_API_KEY`, `EXPO_TOKEN`, Sentry envs, and Hugging Face env tokens are missing.
- App Store Connect / TestFlight submission was not attempted because the preflight gates prove the build is not submission-ready.

## Help and smoke semantics continuation

- The real-iPhone no-screen evidence sequence now includes `help` after `status`, with schema proof that it speaks the bounded command list and leaves settings unchanged.
- STOP barge-in diagnostics reset when a new navigation run starts, preventing stale STOP cut-through proof from carrying into another smoke draft.
- Live backend smoke now separates `providerBacked` from `launchContract.valid`; release preflight requires both, so stale-but-provider-backed Workers are represented accurately without weakening submission gates.

## Remaining P0 blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Machine-readable real-iPhone no-screen evidence is missing: `expo/release/no-screen-smoke.latest.json`.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` is missing and Wrangler is not logged in.
- TestFlight execution is blocked: `EXPO_TOKEN` is missing and release inputs remain unresolved.
- Sentry issue health could not be queried because Sentry auth/org/project env vars are missing.
- Privacy manifest/App Store Connect privacy answers still need a final release-owner review before App Store submission.

## Next quality gap

The guidance reliability audit found that live smoke/eval scripts do not yet prove the full sampled-frame envelope (`sessionId`, `frameId`, timestamp, prior guidance, native path, dimensions) and client diagnostics omit some structured output fields (`lighting`, `surfaceType`, `sceneDescription`, `fallbackReason`). That should be handled in `phase-quality1-guidance-reliability`.
