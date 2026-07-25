# Guide Pup App Review Notes

Use this copy in App Store Connect review notes and release handoff.

## What The App Does

Guide Pup is an assistive vision and navigation aid for blind and low-vision users. It analyzes camera frames, sends them to a backend, and returns spoken guidance such as turn, forward, or stop. It does not guarantee hazard detection or emergency response.

## What Reviewers Should Know

- The shipping path uses camera input for scene analysis.
- Optional hands-free voice commands request microphone and Apple speech-recognition access. On-device recognition is preferred when supported; Apple service processing may otherwise occur.
- Spoken commands are parsed into a bounded command lane for actions such as start, stop, repeat, status, and settings changes.
- Camera frames are compressed and sent to the Guide Pup backend.
- The Cloudflare backend routes sampled compressed camera frames to an OpenAI vision provider for structured scene analysis.
- Raw voice audio is not intentionally logged or sent to model providers by Guide Pup.
- Sanitized Cloudflare request, performance, and quality logs may persist for up to 7 days. OpenAI default abuse-monitoring retention may be up to 30 days unless approved retention controls apply.
- The app uses an installation-scoped identifier and session bootstrap instead of user sign-in.
- App Review sign-in / demo account required should be set to `No` / `false`.
- Do not provide demo credentials; there is no account flow in the shipping app.
- Guide Pup is assistive and may miss hazards. The user should stop whenever the scene or guidance is uncertain.
- Guide Pup does not provide emergency response or an SOS action. In immediate danger, the user must contact local emergency services or nearby people directly.
- The app is designed to fail safe and return `STOP` when the scene is unclear, the backend is unavailable, or the response is invalid.
- Crash reporting is currently disabled in the release source of truth. If Sentry is enabled later, the SDK is configured to avoid collecting default PII and App Privacy answers must be updated.

## No-Screen Review Sequence

Cold launch Guide Pup. With VoiceOver, complete the three onboarding screens by activating `Continue`, `Continue`, then `Start using Guide Pup`. Guide Pup does not require account sign-in or a demo account. On Home, wait for the spoken ready prompt. Allow microphone and speech-recognition access when iOS requests them, then wait for the success cue indicating listening is ready. Complete this sequence in exact order:

1. Say `start guidance`.

   Allow camera access when iOS requests it, then wait for the spoken camera-ready prompt and its success cue before continuing.

2. Say `status`.
3. Say `help`.
4. Say `slower speech`.
5. Say `faster speech`.
6. Say `more detail`.
7. Say `less detail`.
8. Say `haptics off`.
9. Say `haptics on`.
10. Say `repeat`.
11. Say `what do you see`.
12. While spoken guidance is playing, say `STOP` to stop guidance and interrupt speech.

After voice STOP completes, guidance is paused and the app does not return Home. Use VoiceOver to activate the on-screen `Return Home` control before opening Settings. Then open `Settings > Backup camera check` (the camera fallback check). Wait for the spoken backup-camera-ready prompt and its success cue, then repeat the same ordered sequence, including `STOP` while speech is playing.

This sequence describes the implemented command path. Do not state that physical-device or VoiceOver validation has passed until separate evidence confirms it.

## Review Copy

If you need to explain the camera permission, use:

Guide Pup uses the camera to analyze the scene ahead for assistive navigation. Frames are sent to Guide Pup's backend and may be processed by third-party AI providers.

If you need to explain the microphone and speech-recognition permissions, use:

Guide Pup uses the microphone and Apple speech recognition for optional hands-free commands. On-device recognition is preferred when supported; Apple service processing may otherwise occur. Spoken commands are limited to a deterministic command set such as start guidance, stop guidance, repeat, status, and settings changes. Guide Pup does not intentionally log raw voice audio or send voice audio to its vision provider.

## Exact App Review Notes

The block below is rendered from the canonical `appReviewNotes` value in `expo/release/launch-inputs.js`; `expo/store.config.js` sends that exact value to App Store Connect.

<!-- APP_REVIEW_NOTES_START -->
Cold launch Guide Pup. With VoiceOver, complete the three onboarding screens by activating Continue, Continue, then Start using Guide Pup. Guide Pup does not require account sign-in or a demo account. On Home, wait for the spoken ready prompt. Allow microphone and speech-recognition access when iOS requests them, then wait for the success cue indicating listening is ready. For the required no-screen review, say 'start guidance'. Allow camera access when iOS requests it, then wait for the spoken camera-ready prompt and its success cue. Continue in this exact order: say 'status'; say 'help'; say 'slower speech'; say 'faster speech'; say 'more detail'; say 'less detail'; say 'haptics off'; say 'haptics on'; say 'repeat'; say 'what do you see'; then say 'STOP' while speech is playing. After voice STOP completes, guidance is paused and the app does not return Home. Use VoiceOver to activate the on-screen Return Home control before opening Settings. Open Settings, then choose Backup camera check (the camera fallback check). Wait for the spoken backup-camera-ready prompt and its success cue, then repeat the same ordered sequence, including 'STOP' while speech is playing. Guide Pup is an assistive vision and navigation aid and does not guarantee hazard detection or emergency response. Sampled compressed camera frames are sent through the Guide Pup Cloudflare backend to an OpenAI vision provider for structured scene analysis. Optional voice commands use Apple speech recognition; on-device recognition is preferred when supported, and Apple service processing may otherwise occur. Guide Pup does not intentionally log raw camera frames or raw voice audio, and voice audio is not sent to the vision provider. The deterministic command lane controls commands and the bounded conversation lane handles 'what do you see'; neither cloud lane controls camera, speech, haptics, VoiceOver, or STOP. Sanitized Cloudflare request/performance logs may persist for up to 7 days; OpenAI default abuse-monitoring retention may be up to 30 days unless approved retention controls apply. The app speaks a conservative STOP when analysis is unavailable, unsafe, stale, or unclear.
<!-- APP_REVIEW_NOTES_END -->

If you need to explain the safety model, use:

Guide Pup is assistive guidance, not guaranteed hazard detection or emergency response. When the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient.

## Support For Reviewers

- Privacy policy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Marketing URL: `https://guidepup-site.pages.dev`
- Safety disclaimer: see [Launch Inputs](./launch-inputs.md)
- If a reviewer asks for email support, use the support email in [Launch Inputs](./launch-inputs.md).
- The checked-in App Review contact must be reverified in App Store Connect after the candidate build is attached and before submission.
