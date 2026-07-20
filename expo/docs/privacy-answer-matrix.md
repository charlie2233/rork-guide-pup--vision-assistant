# Guide Pup Privacy Answer Matrix

Use this file to answer Apple's App Privacy questions based on the current repo behavior.
Do not claim deletion, retention, or purpose limits that are not implemented in code or policy.

## Current data flows

| Category | Current behavior | App Privacy implication |
| --- | --- | --- |
| Camera frames | The shipping navigation path captures camera frames and sends compressed images to the Guide Pup backend for scene analysis. | Answer `Yes` for photos or videos transmitted off-device for app functionality. |
| Environment scanning | The backend derives scene classification, obstacle, surface, lighting, and walkability information from sampled frames and returns those structured results with installation/session and request context for spoken guidance. | Answer `Yes` for Environment Scanning, linked, for App Functionality only, with no tracking. Apple defines this category to include scene classification and image detection of the user's surroundings. |
| Third-party AI processing | The backend may send frames to an OpenAI-compatible provider, and benchmark-only MiniCPM-o stays non-production. | Disclose third-party processing in review notes and privacy policy. |
| Anonymous device/session bootstrap | The app stores an installation-scoped device ID and session token in `expo-secure-store`, then sends them to the backend for rate limiting and request authorization. | Answer `Yes` for Device ID used for App Functionality. Conservatively mark collected data as linked because the installation ID can be associated with requests and provider/platform context. |
| Cloudflare request observability | Cloudflare platform invocation logs are explicitly disabled in development, staging, and production to avoid automatic header and request capture. Sanitized custom Guide Pup request/quality logs remain enabled and record bounded fields such as request ID, latency, provider/model, prompt version, result class, and sanitized errors. They redact raw frames, credentials, tokens, signed URLs, authorization values, and device IDs. Cloudflare documents a maximum Workers Logs retention of 3 days on Free plans and 7 days on Paid plans; because the account plan is not verified, disclose custom-log retention as up to 7 days. Cloudflare still processes network and platform data to provide the service. | Answer `Yes` for Product Interaction, Performance Data, and Other Diagnostic Data for App Functionality and Analytics. Conservatively mark them linked. Cite [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) and do not claim zero retention. |
| Crash reporting | `@sentry/react-native` is present, but the intended shipping configuration sets `sentryMode: "disabled"`, leaves the runtime DSN blank, and disables uploads. | Answer `No` for Crash Data only if the submitted archive proves the runtime DSN is blank and uploads are disabled. If Sentry is enabled, reassess Crash Data, Performance Data, and Other Diagnostic Data before submission. |
| Microphone / speech recognition | Optional hands-free commands request microphone and iOS speech-recognition access. The native request prefers on-device recognition when Apple reports support and otherwise retains Apple speech-service fallback. For third-party Speech Recognition, Apple states that audio may be sent to Apple; unless the user has enabled Improve Siri & Dictation, audio is not stored, while transcripts and related request data associated with a rotating random identifier may be retained for up to two years. Spoken commands remain in a deterministic bounded command set. Guide Pup does not intentionally log raw voice audio or send it to its vision provider. | Answer `Yes` for Audio Data used for App Functionality, conservatively linked, with no tracking. Cite [Ask Siri, Dictation & Privacy](https://www.apple.com/legal/privacy/data/en/ask-siri-dictation/). |
| Health / location / contacts | Not collected in the shipping path. No location APIs are used in the current shipping path. | Answer `No` for health, precise location, coarse location, and contacts. |

## Code evidence

- Camera permission copy: `expo/app.json`
- Frame preprocessing and upload: `expo/src/logic/VisionAI.ts`
- Backend analyze request and request IDs: `expo/src/lib/api.ts`
- Anonymous device/session storage: `expo/src/lib/device.ts`
- Sentry SDK init and privacy scrubbing: `expo/src/lib/sentry.ts`
- Voice permission copy and bounded commands: `expo/app.json`, `expo/src/lib/voiceCommands.ts`, `expo/modules/guidepup-voice-control`
- OpenAI-compatible provider default and MiniCPM benchmark-only flag: `backend/guidepup-api/wrangler.jsonc`
- iOS privacy manifest discloses Photos or Videos, Environment Scanning, Audio Data, Device ID, Product Interaction, Performance Data, and Other Diagnostic Data: `expo/ios/GuidePupVisionAssistant/PrivacyInfo.xcprivacy`
- Native iOS Info.plist must not carry unused location or photo-library permission copy for this shipping path: `expo/ios/GuidePupVisionAssistant/Info.plist`

## Apple privacy answers to prepare

- Data used to track the user: `No` based on current code.
- Contact info: `No` in-app collection.
- Photos or Videos: `Yes`, linked, for App Functionality. Sampled frames are sent with installation/request context.
- Environment Scanning: `Yes`, linked, for App Functionality only. Image-derived scene classification, obstacle, surface, lighting, and walkability results are associated with installation/session and request context to provide guidance.
- Audio Data: `Yes`, linked, for App Functionality. On-device recognition is preferred when supported, but Apple speech-service fallback remains available.
- Device ID: `Yes`, linked, for App Functionality.
- Product Interaction: `Yes`, linked, for App Functionality and Analytics.
- Performance Data: `Yes`, linked, for App Functionality and Analytics.
- Other Diagnostic Data: `Yes`, linked, for App Functionality and Analytics.
- Crash Data: `No` only for the intended shipping build with a blank runtime Sentry DSN and disabled uploads, pending submitted-archive proof.
- Location: `No`.
- Purchases / financial data: `No`.

All collected categories above are `No` for tracking, third-party advertising, developer advertising/marketing, and product personalization. Do not publish these answers until the submitted archive and deployed provider/platform behavior are verified against this matrix.

## Review-note language

- Guide Pup uses the camera to analyze the scene ahead for assistive navigation.
- The backend derives environment-scanning data, including scene classification, obstacles, surface, lighting, and walkability, solely to provide spoken guidance.
- Camera frames are sent to the Guide Pup backend and may be processed by third-party AI providers.
- Optional voice commands use microphone and iOS speech recognition for a bounded command set. On-device recognition is preferred when supported. Apple states third-party Speech Recognition audio may be sent to Apple; unless Improve Siri & Dictation is enabled, audio is not stored, while transcripts and related request data associated with a rotating random identifier may be retained for up to two years.
- The app uses an installation-scoped device/session bootstrap instead of user accounts.
- Cloudflare platform invocation logs are disabled to avoid automatic header/request capture. Sanitized custom request, performance, and quality logs may persist in Workers Logs for up to 7 days because the account plan is not yet verified. OpenAI may retain customer content in default abuse-monitoring logs for up to 30 days unless approved data-retention controls apply.
