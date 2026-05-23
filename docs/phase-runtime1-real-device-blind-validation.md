# phase-runtime1-real-device-blind-validation

Date: 2026-05-23
Branch: `codex/guidepup-credentialed-launch`
Continuation start: `efa5e34`

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
xcrun devicectl list devices
xcrun xctrace list devices
xcrun devicectl device info details --device E5786BB6-0095-5509-8B85-110C0B5CE6D3
system_profiler SPUSBDataType | rg -i "iphone|apple mobile|E5786|00008130"
```

Results:

- `charlie的iPhone` is now visible as `available (paired)` in `devicectl list devices`.
- `xcrun xctrace list devices` lists `charlie的iPhone (26.4.2)` with hardware identifier `00008130-000A001A1178001C`.
- `devicectl device info details` returned partial information only and warned that the connection was invalidated.
- Pairing state is `paired`; tunnel transport is `tcp`; tunnel state is `disconnected`.
- `system_profiler SPUSBDataType` did not show an attached iPhone on USB, so the current path appears to be same-LAN/CoreDevice rather than wired USB.

## Local Readiness Added

- Added `npm --prefix expo run check:no-screen-smoke` to make the no-screen voice contract executable without pretending to validate hardware.
- The contract check asserts deterministic command coverage for start, stop, repeat, help/status, speech rate, detail, and haptics.
- It asserts `what do you see` remains in the conversation lane and outside deterministic command parsing.
- It asserts settings persistence hooks, STOP cut-through, VoiceOver/native-path diagnostics, haptic diagnostics, and backend smoke evidence gates are present.
- Haptic code now records sanitized diagnostics for last type, outcome, execution path, attempt/completion timestamps, and success/failure counts.

## Not Yet Proven

- No real iPhone install/run was performed in this continuation.
- No blind-user/no-screen smoke packet exists yet for the required sequence.
- Physical haptic feedback, earcons, speech interruption, VoiceOver delivery, native camera capture, JS fallback capture, and settings persistence after app restart remain unvalidated on hardware.
- TestFlight remains blocked by unresolved bundle/team/App Store/copyright inputs and missing Expo auth.

## Next Device Steps

1. Keep the iPhone unlocked, on the same LAN, with Developer Mode enabled.
2. Prefer USB for the first install/run if available; otherwise fix the CoreDevice tunnel until `devicectl device info details` returns complete information.
3. Install a signed internal build once bundle ID, Apple Team ID, App Store Connect app ID, and Expo auth are configured.
4. Run the exact no-screen sequence and export diagnostics afterward.
5. Attach only sanitized diagnostics and backend smoke request IDs; do not attach raw camera frames, raw audio, credentials, signed URLs, provider keys, or full device identifiers.
