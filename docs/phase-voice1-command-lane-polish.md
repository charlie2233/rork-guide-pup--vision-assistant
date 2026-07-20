# phase-voice1-command-lane-polish

Date: 2026-05-22
Branch: `codex/guidepup-credentialed-launch`
Commit at phase start: `f7eb562`
Conversation-lane continuation start: `55622a1`

## Current gate on 2026-07-20

- Explicit partial or final STOP remains deterministic while Guide Pup is speaking; the command parser no longer rejects a real STOP based on overlap with synthesized text.
- Native acoustic echo cancellation is required through `.voiceChat` and voice processing. Voice startup fails closed when that protection cannot be enabled, and diagnostics/no-screen evidence require the observed native `voiceProcessingEnabled` signal.
- Home, Navigation, and the voice provider use owner-scoped native sessions. STOP and route cleanup invalidate pending attempts, while stale successful or rejected starts can stop only their own owner token.
- Focused iOS runtime behavior and source-contract tests passed `29/29`; the full Expo scripted suite passed `93/93` before the candidate commit.
- The post-race-fix arm64 Release simulator build for build `4` exited `0`; artifact inspection confirmed the expected app identity, privacy manifest, production backend URL, and absence of shipping provider keys/direct OpenAI calls. Hardware voice and accessibility behavior remains unclaimed.
- Settings now provides an explicit VoiceOver-reachable backup-camera validation route. It changes no persisted setting, cannot be selected by a model, forces only `js-fallback` for that route, and speaks that the fallback check is active while preserving STOP, haptics, VoiceOver, and timing ownership on iOS.
- These tests do not replace the physical build `4` no-screen sequence. Real self-echo resistance, STOP cut-through, Apple Speech input, VoiceOver, haptics, earcons, interruptions, and settings persistence remain hardware gates.

Later dated sections retain phase history. The current owner-scoped listener and VoiceOver interruption behavior is described by the gate above and the latest bullets below.

## Scope

This phase hardens the deterministic iOS voice command lane for no-screen internal validation. It does not move provider keys or model calls into the client, does not change cloud provider routing, and does not rewrite the app to SwiftUI.

## Code changes prepared

- Home cold prompt now uses the same stop-speak-resume command-session path as other voice responses, so the app does not start listening while it says "start guidance."
- Home and Navigation command sessions now request partial recognition to support fast STOP handling.
- Navigation can handle exact partial STOP barge-in before final recognition, interrupts current speech, pauses guidance locally, and plays the stop haptic when enabled.
- The voice announcer snapshots speech options per utterance and invalidates stale speech tokens, but screen routes exclusively own command-session startup and cleanup; the announcer cannot reopen or stop a newer listener.
- Guidance speech can keep listening for STOP only when the spoken guidance is non-stop, non-obstacle, and does not itself contain "stop" or "pause."
- Bare `continue` no longer starts guidance, which avoids self-triggering from guidance like "continue forward." `continue guidance` remains supported.
- Duplicate transcript guards are reset when command sessions restart or guidance pauses, so a later repeated STOP is not ignored forever.
- The `what do you see` scene-query lane is now explicitly enabled in `voiceConversation.ts`, parsed separately from the deterministic command lane, and gated by `canAnswerWhatDoYouSee()`.
- Home gives a deterministic "start guidance first" response for scene questions, while Navigation only answers scene questions when guidance is active and camera permission is granted.
- Navigation help only advertises `what do you see` when guidance, camera access, and the scene-query lane are all available.
- Voice status now reports camera readiness, native/fallback voice input availability, and whether the scene question is available in the current context.
- Scene-query aliases stay bounded to a conversation-lane trigger; they can request a scene answer but cannot mutate settings, guidance status, direction UI, navigation-core diagnostics, STOP behavior, haptics, VoiceOver, or camera/session timing.
- Repeated identical spoken commands are only suppressed inside a short duplicate-recognition window, and the native iOS voice controller clears its transcript de-dupe state when command sessions start or stop.
- Microphone, speech-recognition, and camera permission denial paths now speak short no-screen fallbacks instead of silently returning.
- `what do you see` no longer reuses stale scene text; if a guidance analysis is already running, it speaks a deterministic "already analyzing" response instead of promising a scene query that cannot start.
- Placeholder SOS copy now says the shortcut is not connected in this build instead of claiming emergency services are active.
- Diagnostics now record speaking state, voice-state timestamps, recognition phase/timestamps, speech/listening overlap counters, unexpected-overlap counters, the last overlap reason, and a PASS/FAIL invariant for no-screen smoke evidence.
- Home pauses its owner-scoped listener for non-guidance responses. Navigation keeps its owner-scoped listener armed during guidance and records that intentional speech overlap as `stop-barge-in` evidence.
- Navigation suppresses stale backend-failure speech/announcements if an analyze request fails after the user has already stopped guidance.
- The native iOS voice controller now associates delegate callbacks with the active `AVSpeechUtterance`, so a canceled old utterance cannot finish the newest speech continuation or flip `speaking` false too early.
- Voice commands now use exact normalized phrase sets with optional polite/wake prefixes instead of broad substring regexes; ambient phrases such as "pause music", "start timer", "do not stop", and "the sign says stop" stay out of the deterministic command lane.
- A focused `check:voice-commands` contract script covers accepted launch commands, urgent STOP variants, rejected ambient phrases, STOP barge-in, and duplicate transcript timing.
- Camera capture results now carry `native-core` or `js-fallback` into the analyze payload, so diagnostics and smoke evidence can prove the actual capture path.
- JS fallback camera capture failures are labeled as camera-frame failures and do not masquerade as backend/provider failures.
- Settings exposes a direct VoiceOver-reachable Diagnostics link for sanitized launch evidence export, while preserving the hidden version-row shortcut.
- The TestFlight checklist now links to a required no-screen smoke evidence packet with the exact voice sequence, diagnostics expectations, pass/fail criteria, and no-raw-media/no-secret evidence rules.
- Navigation responses now keep command recognition open for STOP cut-through only when guidance is active and the spoken text does not contain `stop` or `pause`, reducing self-trigger risk from help/safe-stop copy.
- The JS fallback camera preview is now a non-collapsed, non-accessible full-surface capture view instead of a 1x1 transparent view, improving fallback capture reliability while keeping it out of VoiceOver and touch handling.
- The stop/pause self-trigger guard is centralized in `voiceCommands` and enforced by `VoiceAnnouncer`, so future callers cannot accidentally keep recognition open while speaking stop/pause copy.
- JS fallback capture now waits for `onCameraReady`, records `onMountError`, and labels both direct fallback failures and native-to-JS retry failures as camera-frame failures instead of backend/provider failures.
- App diagnostics now export sanitized sampled-frame evidence: app version, frame timestamp, sampled-frame boolean, has-image boolean, platform, native path, source size, request ID, provider/model, and structured analyze fields without raw image/base64 data.
- The backend analyze request schema accepts `sampledFrame` and `hasImage` booleans so cloud request envelopes can preserve the same sanitized evidence fields.
- Added an executable no-screen smoke contract check covering deterministic voice commands, the separate scene-query conversation lane, STOP cut-through, settings persistence hooks, VoiceOver/native-path diagnostics, haptic/audio-cue diagnostics, and smoke-evidence gates.
- Haptic attempts now record sanitized diagnostics for type, outcome, execution path, and success/failure counts; physical haptic feedback still requires real-iPhone validation.
- Native audio cues now mirror key success, STOP, and error moments, with sanitized diagnostics for type, outcome, execution path, and success/failure counts; audible delivery still requires real-iPhone validation.
- Conversation-lane scene prompts now use exact normalized candidates with wake/polite wrappers and the same negation posture as the command lane. Negated or ambient speech such as "do not describe the scene" and "the phrase what do you see is printed here" no longer triggers `what-do-you-see`.
- Conversation-lane scene analysis now opts out of `GuideAI` navigation smoothing memory, so `what do you see` answers and failures cannot silently bias the next guidance direction.
- Home voice responses now guard command-session restarts by component mount state, and the spoken `start guidance` path does not restart Home listening after routing into Navigation.
- Home now treats `start guidance` as a deterministic handoff: it stops the Home command session, plays success haptic/audio cues, routes to Navigation, and lets Navigation speak the single guidance-start prompt. Settings changes on Home no longer retrigger the cold prompt or stop/restart listening through the ready-prompt effect.
- The native iOS speech controller now renews its recognition task after final commands while preserving the active locale and partial-result setting, so the multi-command no-screen smoke sequence is not dependent on one finalized `SFSpeechRecognitionTask` continuing to emit results.
- VoiceOver cancellation now posts an interrupting attributed announcement before clearing native continuations, so deterministic STOP can cut off a current VoiceOver announcement instead of only changing bookkeeping.
- No-screen draft diagnostics leave speech-input and spoken-output confirmations false until a physical tester attests them; permissions or module availability can no longer impersonate hardware proof.

## Voice command coverage

Implemented command intents remain bounded and deterministic:

- `start guidance`
- `stop guidance`
- `repeat`
- `help`
- `status`
- `slower speech`
- `faster speech`
- `more detail`
- `less detail`
- `haptics on`
- `haptics off`

Command lane changes still do not allow an LLM to change settings, navigation, STOP behavior, haptics, VoiceOver, or camera/session timing.

## Conversation-lane coverage

Implemented conversation prompts remain bounded and isolated from command execution:

- `what do you see`
- `what's around me`
- `what is around me`
- `describe the scene`
- `what is in front of me`

The scene-query conversation lane is only entered after camera permission is present and guidance is active; otherwise the app speaks a deterministic fallback message. A scene query may speak the backend scene description from a sampled frame, but it does not update navigation direction, guidance status, haptics, VoiceOver announcements, or native/JS navigation-core state.

## Validation run

Commands:

```bash
git fetch --all --prune
git pull --ff-only
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix backend/guidepup-api run typecheck
node --check expo/scripts/check-voice-commands.mjs
git diff --check
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs -quiet CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
npm --prefix expo run release:preflight:preview
npm --prefix expo run release:preflight:testflight
npx wrangler whoami
xcrun devicectl list devices
xcrun xctrace list devices
xcrun devicectl device info details --device '<redacted-device-identifier>'
SENTRY_DISABLE_AUTO_UPLOAD=true xcodebuild -workspace expo/ios/GuidePupVisionAssistant.xcworkspace -scheme GuidePupVisionAssistant -configuration Release -sdk iphonesimulator -destination 'platform=iOS Simulator,id=09C3102D-6824-4BA2-8CBE-F6348561F6E8' CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO build -quiet
```

Results:

- Repo sync: already up to date with `origin/codex/guidepup-credentialed-launch` before edits.
- Expo typecheck: passed.
- Expo lint: passed.
- `git diff --check`: passed.
- After the conversation-lane continuation, Expo typecheck, Expo lint, and `git diff --check` were rerun and passed.
- Build iOS Apps plugin session defaults resolved workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, configuration `Release`, simulator `iPhone 16e`.
- Build iOS Apps plugin compile failed in the Sentry upload phase: `sentry-cli` required an org slug and did not see `SENTRY_DISABLE_AUTO_UPLOAD=true` inside its build script environment.
- Release simulator shell build for `iPhone 16e` passed with third-party warnings and `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- After the duplicate-command, permission-fallback, scene-query, and SOS continuation, Expo typecheck, Expo lint, backend typecheck, `git diff --check`, and the Build iOS Apps plugin Release simulator build passed. Preview/TestFlight preflight intentionally remain blocked by unresolved launch inputs and stale live Worker smoke contract.
- On the 2026-05-23 continuation, Expo typecheck, Expo lint, backend typecheck, and `git diff --check` passed after the diagnostics/native-voice hardening patch.
- Build iOS Apps plugin Release simulator build passed for `GuidePupVisionAssistant` on `iPhone 16e` with `SENTRY_DISABLE_AUTO_UPLOAD=true`; warnings were limited to existing React Native/Hermes globals, duplicate `-lc++`, run-script dependency warnings, and the existing `AVSpeechSynthesizer` Sendable warning.
- Preview preflight intentionally failed because the iOS bundle identifier is still `TODO_IOS_BUNDLE_IDENTIFIER`; it also warned that staging smoke evidence is still on `gpt-4.1` / `2026-03-31.v1` and lacks the sampled-frame envelope and newer structured fields.
- TestFlight preflight intentionally failed because the bundle identifier, Apple Team ID, App Store Connect app ID, and copyright holder are unresolved, and production smoke evidence is still on `gpt-4.1` / `2026-03-31.v1` with missing sampled-frame envelope and newer structured fields.
- `npx wrangler whoami` failed with `Not logged in`, so no Cloudflare deploy or live provider smoke could be run.
- On the 2026-05-23 command-parser and evidence continuation, `check:voice-commands`, Expo typecheck, Expo lint, backend typecheck, script syntax check, `git diff --check`, and the Build iOS Apps plugin Release simulator build passed.
- Preview/TestFlight preflight results remain intentionally blocked for the same launch reasons: unresolved Apple bundle/team/app/copyright inputs where applicable, stale staging/production smoke artifacts on `gpt-4.1` / `2026-03-31.v1`, missing sampled-frame envelope fields, and missing Sentry env vars in this shell.
- Current device recheck still shows `charlie的iPhone` as unavailable/offline to Xcode and absent from USB, so physical no-screen smoke remains unvalidated.
- On the 2026-05-23 STOP cut-through and fallback-camera continuation, Expo typecheck, `check:voice-commands`, and `git diff --check` passed before the final validation pass.
- Final validation for that continuation passed: Expo typecheck, Expo lint, backend typecheck, `check:voice-commands`, script syntax check, `git diff --check`, and Build iOS Apps plugin Release simulator build for `iPhone 16e`.
- Preview preflight still fails on unresolved `TODO_IOS_BUNDLE_IDENTIFIER` and warns on stale staging smoke/Sentry env vars. TestFlight preflight still fails on unresolved bundle/team/App Store/copyright inputs plus stale production smoke evidence.
- `wrangler whoami` still reports `Not logged in`; local shell still lacks Cloudflare, OpenAI, Expo, Sentry, and Hugging Face env tokens.
- New no-screen contract validation command: `npm --prefix expo run check:no-screen-smoke`. It is local/static only and does not replace the real iPhone smoke.
- New iPhone readiness command: `npm --prefix expo run check:ios-device`. It reports paired/trusted/CoreDevice/USB/Xcode destination status with suffix-only identifiers and does not replace app install/run proof.
- On the audio-cue/device-readiness continuation, Expo typecheck, Expo lint, backend typecheck, `check:voice-commands`, `check:no-screen-smoke`, ESM syntax checks, `git diff --check`, and Build iOS Apps plugin Release simulator build passed.
- `check:ios-device` now gives a sanitized blocked result for the current hardware state: paired and Developer Mode enabled, but DDI services and the CoreDevice tunnel are unavailable, no USB iPhone is present, and Xcode does not list the phone as a runnable destination.
- On the scene-query parser hardening continuation, `check:no-screen-smoke` now covers positive wake/polite scene prompts plus negative negated/ambient phrases; `check:no-screen-smoke`, `check:voice-commands`, and Expo typecheck passed.

## Backend and request IDs

Backend code was not changed in this phase and no new provider smoke was run. Last known live provider-backed request IDs from `phase-backend1-provider-backed-analyze-smoke` remain:

- Staging `/health`: `1135d81c-65d5-4910-af55-ec9ed7932869`
- Staging `/v1/device/bootstrap`: `6985c962-725b-4305-b316-2e923adb2bd8`
- Staging `/v1/vision/analyze`: `372a702d-de22-4df9-ad74-19ef7d8b7de3`
- Production `/health`: `f8abcbf4-16e5-4965-8c6f-fe586c550bb7`
- Production `/v1/device/bootstrap`: `bc18b829-1200-4bee-a9f0-839010435a5a`
- Production `/v1/vision/analyze`: `09ff3bf0-1ab7-4fdd-a525-4007328cc731`

Important: live Workers are still provider-backed but have not been redeployed with the local `gpt-5.5` / `2026-05-22.v1` structured-output contract.

## Auth and provider status

Environment check from this shell:

- `CLOUDFLARE_API_TOKEN`: missing.
- `OPENAI_API_KEY`: missing locally.
- `EXPO_TOKEN`: missing.
- `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`: missing.
- `HUGGINGFACE_HUB_TOKEN`, `HF_TOKEN`: missing.
- Hugging Face connector is authenticated as `Chargers`; MiniCPM remains experimental and was not moved into production guidance.

No secrets, raw audio, raw images, credentials, or signed URLs were logged.

## Device status

Physical device discovery:

- `xcrun devicectl list devices`: `charlie的iPhone`, iPhone 15 Pro, state `unavailable`.
- `xcrun xctrace list devices`: `charlie的iPhone (26.4.2)` appears under `Devices Offline`.
- Device details: Developer Mode `enabled`, pairing state `paired`, tunnel state `unavailable`, identifier suffix `1178001C`, last connection `2026-05-05 22:31:40 +0000`.
- `system_profiler SPUSBDataType` did not show an attached iPhone on the USB bus.

No physical-device install/run or no-screen blind-user smoke was completed in this phase.

## P0 blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode because the tunnel is unavailable and it is not visible on USB.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` is missing and live Workers still need redeploy plus staging/prod smoke for the new structured-output backend contract.
- Expo/TestFlight release is blocked: `EXPO_TOKEN` is missing and release inputs remain unresolved.
- Sentry production health could not be queried because Sentry auth/org/project env vars are missing.
- Hardware behavior for speech input, STOP cut-through, haptics, audio cues, VoiceOver, native camera capture, and interruption handling still needs real-device validation.

## 2026-05-23 STOP cut-through evidence continuation

The STOP barge-in proof was tightened so release evidence can no longer pass from the microphone simply staying open during speech. The app now records a separate STOP barge-in diagnostic snapshot when guidance speech is armed for STOP, and it only marks cut-through after a `stop-guidance-partial` command is recognized while speech is active, `stopVoice()` runs, guidance is paused, and the stop audio cue / haptic paths are attempted.

Evidence schema changes:

- `stopBargeIn.recognizedCommand` must be `stop-guidance-partial`.
- `stopBargeIn.recognizedPhase` must be `partial`.
- `stopBargeIn.recognizedDuringSpeech`, `audioCueAttempted`, `hapticAttempted`, `guidancePaused`, and `cutThrough` must be true.
- Final-only STOP recognition is recorded for diagnostics but does not satisfy the no-screen barge-in proof.
- STOP barge-in diagnostics are reset at the start of a new navigation run, so old successful STOP evidence cannot carry into a later no-screen draft.
- The no-screen sequence now requires a `help` step proving the bounded command list is available by voice and does not mutate guidance/settings.

Validation for this continuation:

```bash
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run test:guideai-conversation-memory
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:voice-commands
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix backend/guidepup-api run typecheck
npm --prefix backend/guidepup-api run test:privacy
```

Results:

- No-screen evidence tests passed, including explicit rejects for missing voice-help proof, help changing settings, missing partial STOP proof, final-only STOP, and STOP after speech ended.
- GuideAI conversation-memory test passed, including positive scene-query answers and scene-query failures that must not mutate guidance smoothing memory.
- Static no-screen contract, voice-command contract, Expo typecheck, Expo lint, backend typecheck, backend privacy tests, smoke-evidence tests, script syntax checks, and `git diff --check` passed.
- Build iOS Apps plugin `build_sim` hit the 120 second tool timeout; the explicit Release simulator `xcodebuild` fallback passed for `GuidePupVisionAssistant` on `iPhone 16e` with `SENTRY_DISABLE_AUTO_UPLOAD=true`, `CODE_SIGNING_ALLOWED=NO`, `ONLY_ACTIVE_ARCH=YES`, and `COMPILER_INDEX_STORE_ENABLE=NO`. Warnings were limited to existing third-party/native warnings, Sentry config warnings, and bundle globals.
- Preview preflight passed with warnings for stale staging smoke, missing no-screen evidence, and missing Sentry env vars. TestFlight preflight still failed on unresolved store metadata, stale production smoke, and missing real-iPhone no-screen evidence.
- Physical iPhone readiness remains blocked: `charlie的iPhone` is paired with Developer Mode enabled and visible over USB/Xcode destination discovery, but CoreDevice reports it unavailable, DDI services are unavailable, and the tunnel is disconnected.

## 2026-05-23 Home-to-Navigation handoff continuation

The Home screen now avoids double-speaking during `start guidance`. Voice and touch starts stop the Home command session, play deterministic success haptic/audio cues, and route to Navigation, where the existing guidance-start prompt owns the spoken confirmation. The Home cold prompt is guarded with `hasAnnouncedReadyPromptRef`, so changing speech speed, detail, or haptics on Home does not rerun the ready-prompt effect and accidentally stop/restart voice listening.

Validation:

```bash
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:voice-commands
npm --prefix expo run typecheck
```

Results: passed locally with Expo lint, no-screen evidence tests, GuideAI conversation-memory tests, and `git diff --check` in the same continuation. Preview preflight passed with launch warnings; TestFlight preflight still failed on unresolved store metadata, stale production smoke, missing no-screen evidence, and missing Sentry env.

## 2026-05-23 native speech renewal continuation

The iOS voice-control module now restarts listening after a final recognition result when the command session is still intended to be active. It preserves partial recognition so STOP barge-in remains available for the next utterance, and the static no-screen contract checks for this native renewal path.

Validation:

```bash
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run typecheck
```

Results: passed locally. Build iOS Apps `build_sim` also passed for the Release simulator target after the native speech renewal change; physical iPhone smoke remains blocked by CoreDevice availability.

## 2026-05-23 scene-query STOP continuation

The `what do you see` path now treats the final scene answer as a voice-first response that can interrupt the interim "Analyzing the scene now" prompt. While guidance is active, safe scene-query answers can keep STOP barge-in armed just like safe guidance speech, so the required `what do you see` -> `stop guidance` smoke leg does not depend on waiting for a scene answer to finish.

Validation:

```bash
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:voice-commands
npm --prefix expo run typecheck
npm --prefix expo run lint
```

Results: passed locally. Build iOS Apps `build_sim` also passed for the Release simulator target after this continuation.

## 2026-07-18 conversation-lane and privacy continuation

- `what do you see` now crosses an explicit `scene-query` backend mode, keeps separate repeat memory, and cannot mutate guidance smoothing or deterministic navigation/settings state.
- Invalid interaction modes and malformed JSON receive the same bounded sanitized `400` response.
- The in-app Privacy Summary now discloses sampled frames, Apple Speech fallback, installation/session identifiers, bounded diagnostics, and temporary-file cleanup, with a VoiceOver-readable link to the full policy.
- Full Expo scripted tests passed `42/42`; voice and static no-screen contracts passed; Expo typecheck, lint, and Expo Doctor `17/17` passed.
- The Release simulator app exposed named accessibility targets for the full onboarding and Settings fallback. Speech rate, detail, and haptics changed and persisted across a process restart.
- Hardware speech recognition, audible confirmations, STOP cut-through, haptics, earcons, VoiceOver, and settings persistence remain unproven until the iPhone readiness gate passes.
