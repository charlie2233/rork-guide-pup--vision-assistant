# Guide Pup Privacy Answer Matrix

Use this file to answer Apple's App Privacy questions based on the current repo behavior.
Do not claim deletion, retention, or purpose limits that are not implemented in code or policy.

## Current data flows

| Category | Current behavior | App Privacy implication |
| --- | --- | --- |
| Camera frames | The shipping navigation path captures camera frames and sends compressed images to the Guide Pup backend for scene analysis. | Answer `Yes` for photos or videos transmitted off-device for app functionality. |
| Third-party AI processing | The backend may send frames to an OpenAI-compatible provider, and benchmark-only MiniCPM-o stays non-production. | Disclose third-party processing in review notes and privacy policy. |
| Anonymous device/session bootstrap | The app stores an anonymous device ID and session token in `expo-secure-store`, then sends them to the backend for rate limiting and request authorization. | Answer `Yes` for identifiers collected for app functionality, but mark them as anonymous / not user-linked where allowed. |
| Crash / performance telemetry | `@sentry/react-native` is present and can be enabled with `EXPO_PUBLIC_SENTRY_DSN`. Default config avoids sending default PII. | If Sentry is enabled in release, answer `Yes` for diagnostics / crash data. If it stays disabled, answer `No` for diagnostics collection. |
| Health / location / contacts / microphone | Not collected in the shipping path. The shipping app does not request microphone permission. No location APIs are used in the current shipping path. | Answer `No` for health, precise location, coarse location, contacts, microphone, and audio recording. |

## Code evidence

- Camera permission copy: `expo/app.json`
- Frame preprocessing and upload: `expo/src/logic/VisionAI.ts`
- Backend analyze request and request IDs: `expo/src/lib/api.ts`
- Anonymous device/session storage: `expo/src/lib/device.ts`
- Sentry SDK init and privacy scrubbing: `expo/src/lib/sentry.ts`
- OpenAI-compatible provider default and MiniCPM benchmark-only flag: `backend/guidepup-api/wrangler.jsonc`

## Apple privacy answers to prepare

- Data used to track the user: `No` based on current code.
- Contact info: `No` in-app collection.
- User content: `Yes` for camera frames sent for app functionality.
- Identifiers: `Yes` for anonymous device/session identifier used for app functionality.
- Diagnostics: `Optional` depending on whether `EXPO_PUBLIC_SENTRY_DSN` is set in release.
- Audio data: `No`.
- Location: `No`.
- Purchases / financial data: `No`.

## Review-note language

- Guide Pup uses the camera to analyze the scene ahead for assistive navigation.
- Camera frames are sent to the Guide Pup backend and may be processed by third-party AI providers.
- The app uses anonymous device/session bootstrap instead of user accounts.
- The shipping path does not request microphone access.
