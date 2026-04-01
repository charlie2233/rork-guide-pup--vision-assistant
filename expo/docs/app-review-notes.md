# Guide Pup App Review Notes

Use this copy in App Store Connect review notes and internal handoff.

## What The App Does

Guide Pup is an assistive navigation app for blind and low-vision users. It analyzes camera frames, sends them to a backend, and returns spoken guidance such as turn, forward, or stop.

## What Reviewers Should Know

- The shipping path uses the camera only.
- The shipping path does not request microphone access.
- Camera frames are compressed and sent to the Guide Pup backend.
- The backend may route requests through third-party AI providers.
- The app uses anonymous device/session bootstrap instead of user sign-in.
- The app is designed to fail safe and return `STOP` when the scene is unclear, the backend is unavailable, or the response is invalid.
- Crash reporting may be enabled through Sentry in release builds, but the SDK is configured to avoid collecting default PII.

## Review Copy

If you need to explain the camera permission, use:

Guide Pup uses the camera to analyze the scene ahead for assistive navigation. Frames are sent to Guide Pup's backend and may be processed by third-party AI providers.

If you need to explain the safety model, use:

Guide Pup is assistive guidance, not guaranteed hazard detection or emergency response. When the app cannot confidently analyze the scene, it stops and tells the user to pause and reorient.

## Support For Reviewers

- Privacy policy URL: see [Launch Inputs](./launch-inputs.md) or `expo/store.config.js`
- Support URL: see [Launch Inputs](./launch-inputs.md) or `expo/store.config.js`
- Marketing URL: see [Launch Inputs](./launch-inputs.md) or `expo/store.config.js`
- Safety disclaimer: see [Launch Inputs](./launch-inputs.md)
- If a reviewer asks for email support, use the support email in [Launch Inputs](./launch-inputs.md).
