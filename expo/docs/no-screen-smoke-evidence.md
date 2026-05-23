# No-Screen Smoke Evidence

Use this packet for internal iPhone validation before TestFlight. The tester should be able to complete the sequence without reading the screen. Do not attach raw camera frames, raw audio, credentials, signed URLs, provider keys, or full device identifiers.

The machine-readable evidence artifact for release preflight is `expo/release/no-screen-smoke.latest.json`. The expected shape is documented in `expo/docs/no-screen-smoke-evidence.example.json`; the example is not launch evidence.

## Required Setup

- Physical iPhone model, iOS version, build profile, app version, build number, and bundle identifier.
- Backend environment and API base URL label: staging, production, or local.
- Device state: paired/trusted, Developer Mode enabled, network path confirmed, VoiceOver state, and the sanitized result from `npm --prefix expo run check:ios-device`.
- Diagnostics export from the app after the run.
- Backend smoke artifact request IDs for `/health`, `/v1/device/bootstrap`, and `/v1/vision/analyze`.
- Machine-readable artifact fields for device readiness, assistive tech, diagnostics, backend request IDs, and every voice-sequence step.

## Voice Sequence

Run this exact sequence from a clean install or reset app state:

1. Cold prompt: confirm Guide Pup speaks the start/help prompt.
2. Say `start guidance`: confirm guidance starts, camera/session diagnostics become active, and no screen reading is required.
3. Say `status`: confirm the response includes guidance state, camera readiness, speech rate, detail level, haptics, and scene-query availability.
4. Say `slower speech`, then `faster speech`: confirm the setting changes persist and responses stay understandable.
5. Say `more detail`, then `less detail`: confirm guidance detail changes persist.
6. Say `haptics off`, then `haptics on`: confirm spoken confirmation and haptic behavior.
7. Say `repeat`: confirm the last spoken guidance or command response is repeated.
8. Say `what do you see`: confirm the conversation lane answers from a sampled frame without changing guidance state or settings.
9. While speech is playing, say `stop guidance`: confirm STOP cuts through, guidance pauses, and no stale backend/camera failure speech plays afterward.

## Pass Criteria

- Voice command lane only accepts the bounded command list; conversation prompts do not mutate guidance, settings, haptics, VoiceOver, or camera/session timing.
- Diagnostics voice section shows `Speech/listening invariant: PASS` and `Unexpected speech/listening overlap count: 0`.
- Intentional overlap, if present, is marked as `stop-barge-in`.
- Last analyze event includes request ID, provider, model, prompt version, structured-output fields, sampled-frame envelope, and native path: `native-core` or `js-fallback`.
- Last analyze event includes sanitized frame summary and capture heuristics: image source, frame age, upload size, and resize flag. It must not include raw image data.
- Haptics diagnostics show the last attempted haptic type, outcome, execution path, and success/failure counts; this proves the code path ran, while the tester still must confirm physical feedback.
- Audio-cue diagnostics show the last attempted cue type, outcome, execution path, and success/failure counts; this proves the code path ran, while the tester still must confirm that a cue was audible and did not mask speech or STOP handling.
- Camera fallback failures, if any, are labeled as camera-frame failures rather than backend failures.
- VoiceOver, haptic, and audio-cue confirmations are usable without screen reading.
- No raw images, raw audio, credentials, provider keys, or signed URLs are present in logs, screenshots, diagnostics, or notes.

## Release Gate

Before TestFlight or App Store submission, run:

```bash
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run release:preflight:testflight
```

`check:no-screen-evidence` validates `expo/release/no-screen-smoke.latest.json` and fails if the artifact is missing, if any required step lacks no-screen voice proof, if STOP barge-in is not confirmed, if haptics/audio cues/VoiceOver/settings/native camera/JS fallback are not proven, or if raw media, secrets, signed URLs, or full device identifiers are present.

## Fail Criteria

- Any command in the sequence requires reading the screen.
- STOP does not interrupt speech or stale speech plays after STOP.
- Diagnostics shows unexpected speech/listening overlap.
- Analyze is fallback-only when the target requires provider-backed staging or production evidence.
- Diagnostics or logs contain raw media, secrets, credentials, signed URLs, or full device identifiers.
