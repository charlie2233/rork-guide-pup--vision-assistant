# phase-runtime1-real-device-blind-validation

Date: 2026-05-23
Branch: `codex/guidepup-credentialed-launch`
Continuation start: `efa5e34`
Latest continuation start: `b5c1c5e`

## Scope

This phase tracks the real-iPhone no-screen validation gate. It does not replace hardware proof with simulator, static checks, or backend smoke.

Required no-screen sequence:

1. Cold prompt.
2. `start guidance`.
3. `status`.
4. `slower speech`, then `faster speech`.
5. `more detail`, then `less detail`.
6. `haptics off`, then `haptics on`.
7. `repeat`.
8. `what do you see`.
9. While speech is playing, `stop guidance`.

## Current Device Evidence

Commands:

```bash
npm --prefix expo run check:ios-device
xcrun devicectl list devices --json-output -
xcrun xctrace list devices
system_profiler SPUSBDataType | rg -i "iphone|apple mobile"
```

Results:

- `npm --prefix expo run check:ios-device` reports `BLOCKED`.
- `charlie的iPhone` is paired and Developer Mode is enabled, but DDI services are unavailable and the CoreDevice tunnel is `unavailable`.
- `xcrun xctrace list devices` still sees the phone, but `xcodebuild -showdestinations` does not expose it as a runnable destination.
- `system_profiler SPUSBDataType` does not show an attached iPhone on USB.
- The readiness script prints only identifier suffixes for correlation; the evidence packet should not include full device identifiers.

## Local Readiness Added

- Added `npm --prefix expo run check:no-screen-smoke` to make the no-screen voice contract executable without pretending to validate hardware.
- Added `npm --prefix expo run check:ios-device` to summarize paired/trusted/CoreDevice/USB/Xcode destination status with sanitized identifiers before a real-device no-screen smoke.
- Added `npm --prefix expo run check:no-screen-evidence` and a TestFlight/store preflight gate for `expo/release/no-screen-smoke.latest.json`, so release submission cannot treat static checks or simulator builds as real no-screen hardware proof.
- The contract check asserts deterministic command coverage for start, stop, repeat, help/status, speech rate, detail, and haptics.
- It asserts `what do you see` remains in the conversation lane and outside deterministic command parsing.
- It asserts settings persistence hooks, STOP cut-through, VoiceOver/native-path diagnostics, haptic/audio-cue diagnostics, and backend smoke evidence gates are present.
- Haptic code now records sanitized diagnostics for last type, outcome, execution path, attempt/completion timestamps, and success/failure counts.
- Audio cue code now records sanitized diagnostics for last cue type, outcome, execution path, attempt/completion timestamps, and success/failure counts. This is code-path evidence only; the tester still must confirm the cue is audible on device.
- The no-screen evidence schema requires a structured sidecar with provenance, device readiness, no-screen attestation, full voice sequence, STOP barge-in proof, VoiceOver snapshots, haptic/audio confirmations, non-default settings persistence across relaunch, native-core and JS-fallback camera path evidence, provider-backed backend smoke request IDs, and privacy attestations.

## Latest Validation

Commands:

```bash
npm --prefix expo run typecheck
npm --prefix expo run lint
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
npm --prefix backend/guidepup-api run typecheck
node --check expo/scripts/check-ios-device-ready.mjs
node --check expo/scripts/check-no-screen-smoke-contract.mjs
node --check expo/scripts/no-screen-smoke-evidence.mjs
node --check expo/scripts/validate-no-screen-smoke-evidence.mjs
git diff --check
xcodebuildmcp session_show_defaults
xcodebuildmcp build_sim --extraArgs CODE_SIGNING_ALLOWED=NO ONLY_ACTIVE_ARCH=YES COMPILER_INDEX_STORE_ENABLE=NO
```

Results:

- Expo typecheck, Expo lint, voice-command contract, no-screen smoke contract, backend typecheck, ESM syntax checks, and `git diff --check` passed.
- Build iOS Apps plugin Release simulator build passed for workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, simulator `iPhone 16e`, with `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- `npm --prefix expo run check:ios-device` intentionally exits blocked in the current hardware state: paired and Developer Mode enabled, but DDI services are unavailable, the tunnel is unavailable, no USB iPhone is present, and Xcode does not list the phone as a runnable destination.
- `npm --prefix expo run check:no-screen-evidence` intentionally exits blocked until a real `expo/release/no-screen-smoke.latest.json` artifact is produced from hardware validation.

## Not Yet Proven

- No real iPhone install/run was performed in this continuation.
- No blind-user/no-screen smoke packet exists yet for the required sequence.
- No machine-readable `expo/release/no-screen-smoke.latest.json` artifact exists yet, so TestFlight/store preflight must remain blocked.
- Physical haptic feedback, earcons, speech interruption, VoiceOver delivery, native camera capture, JS fallback capture, and settings persistence after app restart remain unvalidated on hardware.
- TestFlight remains blocked by unresolved bundle/team/App Store/copyright inputs and missing Expo auth.

## Next Device Steps

1. Keep the iPhone unlocked, on the same LAN, with Developer Mode enabled.
2. Prefer USB for the first install/run if available; otherwise fix the CoreDevice tunnel until `devicectl device info details` returns complete information.
3. Install a signed internal build once bundle ID, Apple Team ID, App Store Connect app ID, and Expo auth are configured.
4. Run the exact no-screen sequence, export diagnostics afterward, and write `expo/release/no-screen-smoke.latest.json` using `expo/docs/no-screen-smoke-evidence.example.json` as the shape.
5. Run `npm --prefix expo run check:no-screen-evidence` before TestFlight preflight.
6. Attach only sanitized diagnostics and backend smoke request IDs; do not attach raw camera frames, raw audio, credentials, signed URLs, provider keys, or full device identifiers.
