# Guide Pup Privacy Answer Matrix

Use this file to answer Apple's App Privacy questions based on the current repo behavior.
Do not claim deletion, retention, or purpose limits that are not implemented in code or policy.

## Current data flows

| Category | Current behavior | App Privacy implication |
| --- | --- | --- |
| Camera frames | The shipping navigation path captures camera frames and sends compressed images to the Guide Pup backend for scene analysis. | Answer `Yes` for photos or videos transmitted off-device for app functionality. |
| Third-party AI processing | The backend may send frames to an OpenAI-compatible provider, and benchmark-only MiniCPM-o stays non-production. | Disclose third-party processing in review notes and privacy policy. |
| Anonymous device/session bootstrap | The app stores an anonymous device ID and session token in `expo-secure-store`, then sends them to the backend for rate limiting and request authorization. | Answer `Yes` for identifiers collected for app functionality, but mark them as anonymous / not user-linked where allowed. |
| Crash / performance telemetry | `@sentry/react-native` is present, but launch configuration currently sets `sentryMode: "disabled"` and leaves `EXPO_PUBLIC_SENTRY_DSN` unset for release profiles. If enabled later, default config avoids sending default PII. | Current launch answer: `No` for diagnostics collection. If Sentry mode changes to `enabled`, answer `Yes` for diagnostics / crash data and complete the Sentry release credential gate first. |
| Microphone / speech recognition | Optional hands-free commands request microphone and iOS speech-recognition access. Spoken commands are parsed into a bounded command set such as start, stop, repeat, status, and settings changes. Raw voice audio is not intentionally logged or sent to model providers by Guide Pup. | Disclose microphone and speech-recognition usage for app functionality. Do not claim raw audio collection unless release policy changes. |
| Health / location / contacts | Not collected in the shipping path. No location APIs are used in the current shipping path. | Answer `No` for health, precise location, coarse location, and contacts. |

## Code evidence

- Camera permission copy: `expo/app.json`
- Frame preprocessing and upload: `expo/src/logic/VisionAI.ts`
- Backend analyze request and request IDs: `expo/src/lib/api.ts`
- Anonymous device/session storage: `expo/src/lib/device.ts`
- Sentry SDK init and privacy scrubbing: `expo/src/lib/sentry.ts`
- Voice permission copy and bounded commands: `expo/app.json`, `expo/src/lib/voiceCommands.ts`, `expo/modules/guidepup-voice-control`
- OpenAI-compatible provider default and MiniCPM benchmark-only flag: `backend/guidepup-api/wrangler.jsonc`
- iOS privacy manifest discloses sampled camera frames as photos/videos and anonymous device/session IDs for app functionality: `expo/ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy`
- Native iOS Info.plist must not carry unused location or photo-library permission copy for this shipping path: `expo/ios/GuidePupVisionAssistant/Info.plist`

## Apple privacy answers to prepare

- Data used to track the user: `No` based on current code.
- Contact info: `No` in-app collection.
- User content: `Yes` for camera frames sent for app functionality.
- Identifiers: `Yes` for anonymous device/session identifier used for app functionality.
- Diagnostics: `No` for the current launch source of truth because Sentry mode is `disabled`.
- Microphone and speech recognition: `Yes` for app functionality.
- Audio data: `No` for raw audio collection unless release policy changes.
- Location: `No`.
- Purchases / financial data: `No`.

## Review-note language

- Guide Pup uses the camera to analyze the scene ahead for assistive navigation.
- Camera frames are sent to the Guide Pup backend and may be processed by third-party AI providers.
- Optional voice commands use microphone and iOS speech recognition for a bounded command set.
- The app uses anonymous device/session bootstrap instead of user accounts.
