# phase-voice1-command-lane-polish

Date: 2026-05-22
Branch: `codex/guidepup-credentialed-launch`
Commit at phase start: `f7eb562`
Conversation-lane continuation start: `55622a1`

## Scope

This phase hardens the deterministic iOS voice command lane for no-screen internal validation. It does not move provider keys or model calls into the client, does not change cloud provider routing, and does not rewrite the app to SwiftUI.

## Code changes prepared

- Home cold prompt now uses the same stop-speak-resume command-session path as other voice responses, so the app does not start listening while it says "start guidance."
- Home and Navigation command sessions now request partial recognition to support fast STOP handling.
- Navigation can handle exact partial STOP barge-in before final recognition, interrupts current speech, pauses guidance locally, and plays the stop haptic when enabled.
- The voice announcer snapshots speech options per utterance and only restarts listening when the current speech token is still active, preventing stale async speech from reopening the mic during newer speech.
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
git diff --check
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs -quiet CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
xcrun devicectl list devices
xcrun xctrace list devices
xcrun devicectl device info details --device E5786BB6-0095-5509-8B85-110C0B5CE6D3
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

No secrets, raw audio, raw images, credentials, or signed URLs were logged.

## Device status

Physical device discovery:

- `xcrun devicectl list devices`: `charlie的iPhone`, iPhone 15 Pro, state `unavailable`.
- `xcrun xctrace list devices`: `charlie的iPhone (26.4.2)` appears under `Devices Offline`.
- Device details: Developer Mode `enabled`, pairing state `paired`, tunnel state `unavailable`, UDID `00008130-000A001A1178001C`, last connection `2026-05-05 22:31:40 +0000`.
- `system_profiler SPUSBDataType` did not show an attached iPhone on the USB bus.

No physical-device install/run or no-screen blind-user smoke was completed in this phase.

## P0 blockers

- Real iPhone no-screen smoke is still not validated: cold prompt -> start guidance -> status -> slower/faster speech -> more/less detail -> haptics on/off -> repeat -> what do you see -> stop guidance.
- Physical iPhone remains paired with Developer Mode enabled, but unavailable/offline to Xcode because the tunnel is unavailable and it is not visible on USB.
- Cloudflare deploy/auth is blocked: `CLOUDFLARE_API_TOKEN` is missing and live Workers still need redeploy plus staging/prod smoke for the new structured-output backend contract.
- Expo/TestFlight release is blocked: `EXPO_TOKEN` is missing and release inputs remain unresolved.
- Sentry production health could not be queried because Sentry auth/org/project env vars are missing.
- Hardware behavior for speech input, STOP cut-through, haptics, earcons, VoiceOver, native camera capture, and interruption handling still needs real-device validation.
