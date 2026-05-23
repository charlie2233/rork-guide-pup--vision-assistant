# Guide Pup App Review Notes

Use this copy in App Store Connect review notes and internal handoff.

## What The App Does

Guide Pup is an assistive navigation app for blind and low-vision users. It analyzes camera frames, sends them to a backend, and returns spoken guidance such as turn, forward, or stop.

## What Reviewers Should Know

- The shipping path uses camera input for scene analysis.
- Optional hands-free voice commands request microphone and speech-recognition access.
- Spoken commands are parsed into a bounded command lane for actions such as start, stop, repeat, status, and settings changes.
- Camera frames are compressed and sent to the Guide Pup backend.
- The backend may route requests through third-party AI providers.
- Raw voice audio is not intentionally logged or sent to model providers by Guide Pup.
- The app uses anonymous device/session bootstrap instead of user sign-in.
- App Review sign-in / demo account required should be set to `No` / `false`.
- Do not provide demo credentials; there is no account flow in the shipping app.
- The app is designed to fail safe and return `STOP` when the scene is unclear, the backend is unavailable, or the response is invalid.
- Crash reporting may be enabled through Sentry in release builds, but the SDK is configured to avoid collecting default PII.

## Review Copy

If you need to explain the camera permission, use:

Guide Pup uses the camera to analyze the scene ahead for assistive navigation. Frames are sent to Guide Pup's backend and may be processed by third-party AI providers.

If you need to explain the microphone and speech-recognition permissions, use:

Guide Pup uses the microphone and iOS speech recognition for optional hands-free commands. Spoken commands are parsed into a bounded command set such as start guidance, stop guidance, repeat, status, and settings changes. Guide Pup does not intentionally log raw voice audio or send it to AI providers.

If you need to explain the safety model, use:

Guide Pup is assistive guidance, not guaranteed hazard detection or emergency response. When the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient.

## Support For Reviewers

- Privacy policy URL: `https://guidepup-site.pages.dev/privacy`
- Support URL: `https://guidepup-site.pages.dev/support`
- Marketing URL: `https://guidepup-site.pages.dev`
- Safety disclaimer: see [Launch Inputs](./launch-inputs.md)
- If a reviewer asks for email support, use the support email in [Launch Inputs](./launch-inputs.md).
- App Review contact name, email, and phone must be filled in [Launch Inputs](./launch-inputs.md) before metadata push or submission.
