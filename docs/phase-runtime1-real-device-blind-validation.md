# phase-runtime1-real-device-blind-validation

Date: 2026-05-23
Branch: `codex/guidepup-credentialed-launch`
Continuation start: `efa5e34`
Latest continuation start: `b5c1c5e`

## Current gate on 2026-07-24

- The pending launch source serializes native-camera and JS-fallback ownership. A fallback `CameraView` cannot mount or analyze until native shutdown resolves, stale native/fallback generations cannot reclaim ownership, and simultaneous STOP/lifecycle shutdown callers share one bounded two-attempt native-stop sequence.
- The required voice path remains deterministic: cold prompt -> start guidance -> status -> help -> slower/faster speech -> more/less detail -> haptics off/on -> repeat -> what do you see -> STOP during speech. The conversation answer remains separate from command parsing and cannot mutate navigation or settings.
- The launch client now vendors no crash-reporting SDK. Sentry dependency/plugin/pods/native phases/runtime configuration and the orphaned native properties file are removed; release gates reject their return.
- Current local validation passed: all Expo Node contracts `153/153`, including iOS runtime safety `85/85`, privacy, no-screen schema, release configuration/evidence, conversation-lane isolation, and STOP behavior; Expo typecheck, lint, and Expo Doctor `17/17` also pass.
- These checks are source/static proof only. They do not prove that speech input is recognized, confirmations and earcons are audible, haptics are felt, VoiceOver announces correctly, STOP cuts through physical playback, settings survive a real relaunch, or either camera path captures on an iPhone.
- A prior sanitized readiness check reached `ready`, and the superseded `87196ef` Ad Hoc candidate installed and launched. The latest check at `2026-07-25T03:52:10Z` is transport-blocked: the phone remains paired/trusted, in Developer Mode, and visible to `xctrace`, but the CoreDevice process probe fails and USB/same-LAN, DDI/tunnel, and Xcode destination checks are unavailable.
- The prior `87196ef` archive/install is superseded by the no-Sentry launch source. A new exact-revision App Store archive and one-device Ad Hoc export must be built, inspected, installed, and launched before physical validation.
- No current `expo/release/no-screen-smoke.latest.json` exists. Physical speech input, audible confirmations/earcons, felt haptics, VoiceOver delivery, STOP barge-in, settings persistence, native camera capture, and explicit JS fallback remain pending tester confirmation.

Commands:

```bash
npm --prefix expo run test:ios-runtime-safety
npm --prefix expo run test:privacy-launch-contract
npm --prefix expo run check:voice-commands
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device -- --json
xcrun devicectl list devices --timeout 30 --json-output '<private-temporary-file>'
system_profiler SPUSBDataType -json
```

Current blocker: rebuild the exact no-Sentry candidate, restore the phone execution path, then complete both native-core and explicit JS-fallback no-screen runs and validate the sanitized evidence artifact. Prior transport and install/launch evidence does not replace current-binary or sensory validation.

## Current gate on 2026-07-20

- The launch candidate is version `1.0.0`, build `4`, bundle `app.rork.guide-pup-vision-assist`, team `K99RADPB9G`.
- Native voice startup now requires `.voiceChat` plus `AVAudioInputNode` voice processing, reports `voiceProcessingEnabled`, and fails closed if acoustic echo cancellation cannot be enabled. Explicit STOP is never discarded by text-based echo suppression.
- Native command sessions use owner tokens. A stale successful or rejected start can clean up only its own native session and cannot stop a newer listener. Focused behavioral and contract coverage passed before this continuation; the expanded suite now also covers active CoreDevice readiness and privacy-safe cleanup.
- Apple Developer generated Ad Hoc profile `GuidePup Build 4 Blind Validation 20260720` for the exact Guide Pup bundle, current Apple Distribution certificate, and registered validation iPhone. Local decoding confirmed the team/application identifier, `get-task-allow=false`, one matching provisioned device, and certificate equality without checking in the profile or full device identifier.
- The suffix-only readiness check now reports `ready`: the wired phone is paired/trusted, Developer Mode is enabled, Xcode and xctrace see it, and a bounded read-only `devicectl device info processes` probe exits `0` with a structured success result. Idle DDI/tunnel fields remain false as truthful snapshots and are no longer mistaken for an execution failure.
- The exact `da95d8e` Ad Hoc app installed and launched through CoreDevice, and a read-only process query found one running Guide Pup process. This proves executable device readiness only, not audio, speech, haptics, VoiceOver, or camera behavior.
- Settings now exposes an explicit VoiceOver-reachable `Camera fallback check`. That temporary route forces `js-fallback` only for the validation session, announces the choice aloud, keeps deterministic STOP and all safety guards unchanged, and leaves normal navigation on `native-core` whenever available.
- No current `expo/release/no-screen-smoke.latest.json` exists. Physical speech input, confirmations, haptics, earcons, VoiceOver, interruption recovery, settings persistence, native camera capture, JS fallback, and STOP cut-through remain unvalidated for build `4`.

## 2026-07-20 device and signing evidence

Commands:

```bash
npm --prefix expo run test:ios-device-readiness
npm --prefix expo run check:ios-device -- --json
security cms -D -i /private/tmp/GuidePup-AdHoc-Build4-20260720.mobileprovision
xcrun devicectl device info processes --device '<internal-identifier>' --timeout 30 --quiet --json-output '<private-temporary-file>'
```

Results:

- Device-readiness behavior tests passed `16/16`, including false idle DDI/tunnel snapshots with a successful active probe, failed-probe precedence, pairing/Developer Mode/Xcode blockers, missing/ambiguous target rejection, malformed output, timeouts, temporary-file cleanup, and suffix-only evidence.
- Live readiness returned `deviceReadiness.result: "ready"` and `coreDeviceExecutionReady: true`; the report included only the device identifier suffix `0B5CE6D3` and hardware suffix `1178001C`.
- The active probe reads a process list only from a private temporary file, emits no process names/arguments/full identifiers, and removes the file before returning. It does not inspect app data or replace the sensory no-screen run.
- The Ad Hoc profile expires `2027-07-19`, matches team `K99RADPB9G` and bundle `app.rork.guide-pup-vision-assist`, and contains the validation iPhone. Raw profile data, certificate data, and full device identifiers are omitted.
- The next archive must be rebuilt from the post-fix Git revision with this Ad Hoc profile, installed on the phone, and exported from the same archive for the App Store candidate.
- Focused fallback-selection and runtime/source-contract tests passed `26/26`; TypeScript, lint, privacy launch contract `12/12`, static no-screen contract, and no-screen evidence schema `23/23` also passed. These remain local proof only.

## Scope

This phase tracks the real-iPhone no-screen validation gate. It does not replace hardware proof with simulator, static checks, or backend smoke.

Required no-screen sequence:

1. Cold prompt.
2. `start guidance`.
3. `status`.
4. `help`.
5. `slower speech`, then `faster speech`.
6. `more detail`, then `less detail`.
7. `haptics off`, then `haptics on`.
8. `repeat`.
9. `what do you see`.
10. While speech is playing, `stop guidance`.

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
- Added `npm --prefix expo run check:ios-device -- --json` so the same readiness check can emit suffix-only structured `deviceReadiness` evidence without copying full device IDs.
- Added `npm --prefix expo run check:no-screen-evidence` and a TestFlight/store preflight gate for `expo/release/no-screen-smoke.latest.json`, so release submission cannot treat static checks or simulator builds as real no-screen hardware proof.
- The contract check asserts deterministic command coverage for start, stop, repeat, help/status, speech rate, detail, and haptics.
- It asserts `what do you see` remains in the conversation lane and outside deterministic command parsing.
- It asserts settings persistence hooks, STOP cut-through, VoiceOver/native-path diagnostics, haptic/audio-cue diagnostics, and backend smoke evidence gates are present.
- Haptic code now records sanitized diagnostics for last type, outcome, execution path, attempt/completion timestamps, and success/failure counts.
- Audio cue code now records sanitized diagnostics for last cue type, outcome, execution path, attempt/completion timestamps, and success/failure counts. This is code-path evidence only; the tester still must confirm the cue is audible on device.
- The no-screen evidence schema requires a structured sidecar with provenance, device readiness, no-screen attestation, full voice sequence including voice help recovery, STOP barge-in proof, VoiceOver snapshots, haptic/audio confirmations, non-default settings persistence across relaunch, native-core and JS-fallback camera path evidence, provider-backed backend smoke request IDs, and privacy attestations.
- The Diagnostics screen now records the device bootstrap request ID and exports a sanitized no-screen JSON draft from the current diagnostics snapshot, including bootstrap/analyze/health request IDs when present. The draft remains launch-invalid until a tester fills the real device-readiness and no-screen attestation fields after hardware validation.

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
npm --prefix expo run check:ios-device -- --json
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
- The no-screen evidence schema tests passed for a valid artifact, missing voice-help proof, help mutating settings, missing STOP barge-in proof, final-only STOP proof, STOP after speech ended, and raw-media/full-identifier rejection.
- Build iOS Apps plugin Release simulator build passed for workspace `expo/ios/GuidePupVisionAssistant.xcworkspace`, scheme `GuidePupVisionAssistant`, simulator `iPhone 16e`, with `SENTRY_DISABLE_AUTO_UPLOAD=true`.
- `npm --prefix expo run check:ios-device` intentionally exits blocked in the current hardware state: paired and Developer Mode enabled, but DDI services are unavailable, the tunnel is unavailable, no USB iPhone is present, and Xcode does not list the phone as a runnable destination.
- `npm --prefix expo run check:ios-device -- --json` intentionally exits blocked in the same state and emits only suffix identifiers plus structured readiness fields; it is useful for debugging but not launch-passing evidence until `deviceReadiness.result` is `ready`.
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
3. Install the exact signed build `4` candidate once the distribution archive is produced; direct Xcode upload does not require Expo authentication.
4. Run `npm --prefix expo run check:ios-device -- --json` and copy the readiness fields only when it reports `deviceReadiness.result: "ready"`.
5. Run the exact no-screen sequence, export diagnostics afterward, use the Diagnostics screen no-screen JSON draft, and write `expo/release/no-screen-smoke.latest.json` using `expo/docs/no-screen-smoke-evidence.example.json` as the shape.
6. Run `npm --prefix expo run check:no-screen-evidence` before TestFlight preflight.
7. Attach only sanitized diagnostics and backend smoke request IDs; do not attach raw camera frames, raw audio, credentials, signed URLs, provider keys, or full device identifiers.

## Evidence gate tightening on 2026-05-23

Read-only blind-validation review found that the no-screen evidence schema could accept weak settings and camera proof. The gate now rejects artifacts where:

- `settingsPersistence.afterVoiceChange` is identical to `before`.
- `settingsPersistence.afterRelaunch` differs from the voice-changed settings.
- `settingsPersistence.afterRestore` differs from `before`.
- `cameraPaths.nativeCore.captureHeuristics` or `cameraPaths.jsFallback.captureHeuristics` is missing `imageSource`, `frameAgeMs`, `resizedForUpload`, `uploadedHeight`, or `uploadedWidth`.
- Capture heuristic uploaded dimensions do not match the corresponding camera path uploaded dimensions.
- Device, provenance, and backend environment fields disagree on app version, build number, build profile, bundle identifier, or API environment.

Validation:

```bash
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:ios-device
```

Results:

- `test:no-screen-evidence` passed 15 schema tests, including negative tests for fake settings persistence, mismatched provenance/device/backend identity, missing camera heuristics, mismatched upload dimensions, and raw media/full identifiers.
- `check:no-screen-smoke` passed the static voice/no-screen contract.
- `check:no-screen-evidence` still fails because `expo/release/no-screen-smoke.latest.json` does not exist.
- `check:ios-device -- --json` still reports `BLOCKED`; `charlie的iPhone` is paired with Developer Mode enabled and visible to `xctrace`, but CoreDevice reports it unavailable, DDI services are unavailable, USB is absent, and Xcode does not list it as a runnable destination.

This remains schema/static validation only; it does not replace a real iPhone no-screen run.

## Device readiness recheck after voice/backend hardening on 2026-05-23

Command:

```bash
npm --prefix expo run check:ios-device
```

Result: `BLOCKED`.

- Target: `charlie的iPhone`.
- Device identifier suffix: `0B5CE6D3`.
- Hardware UDID suffix: `1178001C`.
- CoreDevice state: `unavailable`.
- Pairing state: `paired`.
- Developer Mode: `enabled`.
- DDI services available: `false`.
- Tunnel state: `unavailable`.
- Last connection: `2026-05-23T19:58:57.734Z`.
- USB iPhone present: `no`.
- `xctrace` visibility: `yes`.
- `xcodebuild` destination visibility: `no`.

The current blocker has moved back to device connectivity/CoreDevice availability before the signed build/provisioning blocker can be retested. No hardware no-screen evidence was produced.

## Evidence-order gate on 2026-05-23

The no-screen evidence validator now rejects artifacts that include all required voice steps but record them out of order. The P0 sequence is not just a checklist; it must prove the exact cold prompt -> start guidance -> status -> help -> speech/detail/haptics settings -> repeat -> what do you see -> stop guidance path.

Validation:

```bash
npm --prefix expo run test:no-screen-evidence
npm --prefix expo run check:no-screen-smoke
```

Results: passed with 14 no-screen evidence tests, including the new wrong-order rejection. This is still schema/static validation only. It prevents weak evidence packets but does not replace a real iPhone no-screen run.

## 2026-07-18 current hardware gate

Commands:

```bash
npm --prefix expo run check:ios-device -- --json
npm --prefix expo run check:no-screen-smoke
npm --prefix expo run check:no-screen-evidence
xcrun devicectl list devices
system_profiler SPUSBDataType
```

Results:

- The static no-screen command contract passed, including the conversation-lane `what do you see` path and deterministic STOP/settings controls.
- The paired iPhone is trusted and Developer Mode is enabled, but the latest readiness check remains `blocked`: DDI unavailable, tunnel disconnected, no USB or same-LAN execution path, and no Xcode runnable destination. `system_profiler SPUSBDataType` listed no iPhone, and only suffix identifiers were emitted.
- `release/no-screen-smoke.latest.json` is absent, so no physical speech, confirmation, haptic, earcon, VoiceOver, interruption, settings-persistence, native-camera, or JS-fallback claim is made.
- The required real sequence remains the launch blocker. Simulator or prior install/process-liveness evidence does not satisfy it.
- The Release simulator artifact installed and launched, and Settings values survived a process restart. That narrows the remaining work but does not replace the hardware checks above.
