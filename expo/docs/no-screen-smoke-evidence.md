# No-Screen Smoke Evidence

Use v3 evidence for physical iPhone launch validation. Every core action must work without reading the screen. Never include names, email addresses, phone numbers, raw images, raw audio, credentials, signed URLs, provider keys, or full device identifiers.

The historical v1 example at `expo/docs/no-screen-smoke-evidence.example.json` remains readable for reference but is launch-invalid.

## Required Files

- `expo/release/candidate-build.latest.json`: generated from the signed archive, the Store IPA intended for upload, and a separately signed validation IPA authorized for the evidence iPhone. Its structured Expo Constants binding proves the release track, API environment, API URL, public URLs, and shipping feature flags; `release.candidateBinding.candidateIdentifier` identifies the signed runtime configuration and `ipa.sha256` identifies the Store upload artifact. Fresh inspection requires archive, Store IPA, and validation IPA to have the same normalized unsigned app payload after removing signing-only material. The Store IPA must use App Store signing; the validation IPA must use development or ad hoc signing with at least one provisioned device.
- `expo/release/ios-submission.latest.json`: a privacy-safe local upload-attempt record generated after the validated submit command reports success. It binds the candidate ID, source revision, Store IPA SHA-256, app/version/build, hashed App Store Connect app ID, and bounded attempt window without storing paths, CLI output, URLs, credentials, or tokens. It is not an Apple receipt and cannot prove which bytes Apple received.
- `expo/release/no-screen-smoke.internal.latest.json`: pre-upload ad hoc run by an `internal-tester`.
- `expo/release/no-screen-smoke.blind-participant.latest.json`: pre-upload ad hoc repeat by a separate `blind-participant`.
- `expo/release/no-screen-smoke.testflight.latest.json`: post-processing repeat installed from TestFlight and completed by a `blind-participant`.

Both pre-upload run files are required by TestFlight preflight. They must come from the inspected validation IPA and set `installationEvidence.installedValidationIpaSha256` to candidate `validationIpa.sha256`; they must not claim an uploaded Store IPA. Store preflight requires all three run files. Each file needs a unique run ID and unique native/fallback execution, analyze request, and per-step event IDs. The two pre-upload files also need distinct pseudonymous operators and participant labels. Use `operator-*`, `internal-*`, and `blind-*` prefixes without real names or contact details. The TestFlight repeat must use an iOS 16-or-newer evidence device, begin after both pre-upload executions and App Store Connect's authenticated `uploadedAt` value, include the exact sanitized App Store Connect build record identifier, and report `installationEvidence.appTransactionVerified: true`, `appIdentityMatched: true`, `appStoreAppIdMatched: true`, `bundleVersionMatched: true`, `distributionEnvironment: "apple-sandbox"`, `storeKitEvidencePurpose: "apple-signed-app-identity-only"`, and `uploadedIpaSha256` equal to the candidate Store `ipa.sha256`. TestFlight evidence must not carry the validation IPA hash.

The Diagnostics screen omits all free-form scene, guidance, and error content before it enters the visible or VoiceOver-accessible snapshot. The `Export no-screen JSON draft` action also privacy-scans before sharing and emits a deliberately failing v3 worksheet. It does not prove participant role, installation source, device readiness, sensory observations, interruptions, candidate binding, or backend provenance. A verified Apple sandbox app transaction proves signed app identity when its bundle/version match, but sandbox is also used outside TestFlight and does not prove the installation channel. TestFlight installation and blind-participant role therefore remain explicit sanitized human attestations corroborated by App Store Connect evidence.

Standalone evidence validation checks the local schema and attestations only. Store preflight additionally performs an authenticated App Store Connect API lookup and requires exactly one unexpired `VALID` iOS build matching the configured app ID, marketing version, and build number. Its authenticated `uploadedAt` value must fall inside the sanitized local attempt window. This time/app/version/build correlation corroborates the upload attempt but is not a cryptographic Apple receipt or Apple-provided IPA digest. Supply either a short-lived `APP_STORE_CONNECT_API_TOKEN` or the issuer ID, key ID, and private-key file path used to generate a ten-minute token. Never put the token or private key in evidence, logs, source control, or an `EXPO_PUBLIC_*` variable.

## Each Run

1. Start from a clean install or reset. Enable VoiceOver and use no visual screen inspection or visual prompting. Record `visualScreenUse: "none"` and `noScreen.voiceAndVoiceOverOnly: true`.
2. Record only the bounded role, prefixed pseudonyms, visual-prompting and interaction-assistance flags, installation source/evidence, and explicit human attestation fields; never record a name or contact detail. Immediately before the command run, execute the CoreDevice `devicectl-process-info` probe against the same connected iPhone. Record its structured `type`, `outcome`, zero `exitStatus`, and fresh `checkedAt` timestamp. A paired/trusted transport snapshot without a successful executable process probe is not device evidence.
3. Run the exact command sequence on `native-core`: Cold prompt, `start guidance`, `status`, `help`, `slower speech`, `faster speech`, `more detail`, `less detail`, `haptics off`, `haptics on`, `repeat`, `what do you see`, and `stop guidance`.
4. Complete the native execution, then force `js-fallback` and repeat the complete sequence. Each path object must have its own execution ID, start/completion timestamps, analyze request ID, execution-path label, and ordered `steps`. The camera-path request ID must match that path's command-sequence analyze request ID. Every step needs a unique UUID-like `eventId` and strictly increasing ISO `observedAt` inside that path's execution window. Command steps use only the fields defined for that exact command: `id` must match its ordered command, outcome fields must be strict booleans, and command-inapplicable fields are rejected even when they are valid fields for another command. A `notes` field or any other free-form step field is rejected. No execution, analyze, or step event ID may be reused within a file or across internal, blind-participant, and TestFlight runs. A successful frame must be at most 2 seconds old, finish capture within 5 seconds, and upload dimensions from 32 through 768 pixels on each edge. Use only the fixed privacy-safe `frameSummary` values `Sanitized native-core sampled frame summary.` and `Sanitized js fallback sampled frame summary.`. Never write scene, address, person, or object prose into evidence.
5. During active speech, use partial-result STOP on each camera-path run. Bind that path's `stopBargeIn.eventId` and `observedAt` to its `stop-guidance` step. Confirm same-event cue/haptic success within 1 second and confirmed inactive analysis, camera, speech, and listening with no stale speech within 3 seconds. Earlier global cue or haptic counters cannot satisfy this gate, and a merely ordered but slow STOP cannot pass.
6. Background and foreground the app during guidance. Confirm conservative STOP, no continued guidance, bounded recovery within 10 seconds, and an explicit user restart.
7. Cause a real audio-route interruption or route change. Confirm the same conservative STOP and explicit-restart behavior.
8. Change speech rate, detail, and haptics by voice; relaunch; confirm persistence; then restore defaults.
9. Bind the run to the candidate binary SHA-256, signed-config `candidateIdentifier`, source revision, app identity, production backend smoke provenance, and request IDs. Ad hoc runs require `installedValidationIpaSha256` equal to candidate `validationIpa.sha256`, `appTransactionVerified: false`, `appIdentityMatched: false`, `appStoreAppIdMatched: false`, `bundleVersionMatched: false`, and `distributionEnvironment: "none"`. TestFlight runs require iOS 16+, a verified identity-matched Apple sandbox app transaction with matching App Store app ID and embedded build number, an App Store Connect `uploadedAt` value before execution, and `uploadedIpaSha256` equal to the candidate Store `ipa.sha256`. Treat StoreKit as corroborating identity evidence, not proof of TestFlight installation.

A sighted safety spotter may protect the walking area for the blind-participant run, but must not prompt app interaction. Record this as `interactionAssistance: "safety-spotter-only"`; otherwise use `"none"`.

## Commands

Before upload:

```bash
npm --prefix expo run check:ios-device -- --json
npm --prefix expo run check:no-screen-evidence
npm --prefix expo run check:no-screen-evidence:blind
npm --prefix expo run release:preflight:testflight -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa
npm --prefix expo run submit:testflight:ios -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa
```

After Apple reports a matching processed build and that build is installed from TestFlight:

```bash
npm --prefix expo run check:no-screen-evidence:testflight
npm --prefix expo run release:preflight:store -- --archive /path/to/GuidePup.xcarchive --ipa /path/to/GuidePup-store.ipa --validation-ipa /path/to/GuidePup-validation.ipa
```

Each preflight freshly reinspects the supplied archive, Store IPA, and validation IPA and rejects stale candidate JSON, normalized payload disagreement, wrong signing class, extra signed Store entitlements, or a changed artifact. The submit wrapper copies the proven Store IPA into a private `0700` directory, makes the copy read-only, reruns preflight against that copy and the validation IPA, gives only the private Store copy to EAS, verifies the local copy again after the CLI returns, removes it, and atomically writes a sanitized local-attempt record. This protects against accidental local path changes; it is not an Apple byte receipt and cannot defeat a malicious same-user process. `release:preflight:testflight` derives the required evidence profile from the validated structured candidate binding. A direct-Xcode `app-store` candidate truthfully uses `store` evidence even when uploaded for TestFlight processing. A `testflight` candidate uses `testflight` evidence. `release:preflight:store` accepts only an embedded `app-store` candidate normalized to `store`.

## Fail Conditions

- A required file is absent, reused for another role, stale, out of order, or bound to another candidate.
- The CoreDevice process probe is missing, unsuccessful, nonzero, stale, predates the candidate, or is not bound close to the command execution.
- The blind participant and internal tester share an operator, run ID, or participant label.
- Either camera path lacks a distinct, timed, request-bound complete ordered voice sequence, any step lacks a unique in-window event ID/timestamp, or any path/event ID is reused across runs.
- A sampled frame is older than 2 seconds, capture takes longer than 5 seconds, an uploaded edge is outside 32-768 pixels, or the camera-path and command-sequence request IDs differ.
- Background/foreground or audio-route recovery lacks conservative STOP, no continued guidance, bounded recovery, or explicit restart.
- STOP does not interrupt speech, speech/listening overlap is not bounded to `stop-barge-in`, the STOP event is not bound to the path's `stop-guidance` step, same-event cue/haptic success takes over 1 second, or confirmed runtime shutdown takes over 3 seconds.
- Either pre-upload run does not bind to candidate `validationIpa.sha256`, claims the Store upload IPA, or the validation IPA does not freshly match the archive and Store IPA normalized payload.
- The TestFlight repeat is not completed by a blind participant, starts before either pre-upload run completes or before App Store Connect's authenticated upload time, lacks the exact live build record, lacks verified app-ID/build-matched `apple-sandbox` evidence on iOS 16+, or lacks the exact uploaded IPA SHA-256 binding.
- The local upload-attempt record is missing, privacy-unsafe, bound to another candidate, or its attempt window does not contain App Store Connect's authenticated build upload time.
- Evidence contains identity/contact data, raw media, secrets, signed or tokenized URLs, full device identifiers, a command-step `notes` field, another unexpected free-form step field, or free-form frame-summary prose.
