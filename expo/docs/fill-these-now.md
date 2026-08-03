# Guide Pup Launch Handoff

## Current Decision

Guide Pup is not ready to upload to TestFlight or submit to App Review yet. The
signed candidate from `064cf7f` is superseded by the privacy-declaration fix and
must not be uploaded. Account identity is resolved, but the replacement source
has not cleared the cloud, binary, physical no-screen, or TestFlight repeat
gates.

Do not attach a build, submit for review, or merge this branch to `main` until
every required item below has real evidence.

## Required Next

1. Finish the privacy correction and independent review, run the complete
   validation matrix, commit, and push the exact source on
   `codex/guidepup-credentialed-launch`.
2. Deploy that commit to staging and production. Run strict provider-backed
   guidance and scene-query smokes against both environments, and retain the
   sanitized request IDs and exact source revision.
3. Produce one Store IPA and one device-authorized validation IPA from the same
   frozen source and normalized unsigned payload. Inspect both artifacts and
   bind them to the candidate evidence.
4. Install the validation IPA on the connected iPhone. Complete separate
   internal-tester and blind-participant no-screen v3 runs covering the full
   voice sequence, STOP during speech, VoiceOver, audible cues, felt haptics,
   interruption recovery, persisted settings, native capture, and forced
   JavaScript fallback.
5. Upload only the validated Store IPA. After Apple processes it, corroborate
   app ID, version, build, state, and upload time through authenticated App Store
   Connect evidence. The local upload record is not an Apple receipt or digest.
6. Install the processed build through TestFlight and repeat the blind-participant
   no-screen v3 run. The TestFlight evidence must bind to the processed build and
   candidate Store IPA hash.
7. Publish App Privacy answers that match the inspected archive and deployed
   provider behavior. Prepare the optional accessibility label from blind-user
   evidence for publication after `1.0` is live. Recheck agreements, export
   compliance, review notes, contact fields, screenshots, release controls, and
   selected build before submission.

## Resolved Identity

- App: `Guide Pup: Vision Assistant`
- Apple ID: `6756947790`
- Bundle ID: `app.rork.guide-pup-vision-assist`
- SKU: `EX1766553072106`
- Team ID: `K99RADPB9G`
- Version and target build: `1.0.0 (4)`
- Category and age rating: `Navigation`, `4+`
- Copyright: `2026 XIANMIN CHEN`
- Support and App Review email: `charliehan112@gmail.com`
- Review sign-in required: `false`
- Release control: manual

## Current External State

- The user is signed in to Cloudflare in the browser, but Wrangler is not
  authenticated because the callback arrived after the CLI listener expired.
  Run a fresh CLI OAuth round, then verify only required secret names and the
  absence of `SENTRY_DSN`; do not read secret values.
- The live staging and production Workers are healthy and provider-backed but
  still report superseded source `14747bb`. No launch-valid request IDs are
  claimed for the pending source.
- The wired iPhone is paired, trusted, in Developer Mode, USB-visible, and
  visible to `xctrace`, but CoreDevice/DDI services, the tunnel, active process
  probe, and runnable Xcode destination fail. It is not device-ready.
- The public privacy, support, and safety pages are reachable and disclose
  sampled frames, Apple Speech behavior, Cloudflare diagnostics, OpenAI's
  default abuse-monitoring retention limit, and the support email. The corrected
  raw-audio and support-retention wording is not live until the replacement
  commit is deployed and verified.
- App Store Connect currently shows version `1.0.0` as Prepare for Submission,
  four accepted 6.5-inch screenshots, no selected build, the correct review
  email, no login requirement, and manual release. TestFlight has only expired
  build `2`. App Privacy is an unpublished draft and must be corrected before
  publication.
- EAS is logged out and `EXPO_TOKEN` is absent. Expo authentication is required
  only if the EAS path is selected; direct Xcode/App Store upload remains
  available after every earlier gate passes.

## Privacy And Release Boundaries

- Shipping iOS contains no provider key or direct model call.
- MiniCPM remains experimental and is not a launch provider.
- The launch client intentionally contains no Sentry SDK or DSN. Crash Data can
  be answered `No` only after the submitted archive confirms that state.
- Camera frames are sampled rather than continuous video. They may be processed
  by OpenAI through the Guide Pup backend.
- Guide Pup does not collect or retain raw Apple Speech audio. A support email
  may provide and retain the sender's name, email address, message, and
  voluntarily supplied troubleshooting details; users may request deletion.
- `store: false` is requested for provider calls, but Guide Pup does not claim
  zero retention. OpenAI default abuse-monitoring retention may still apply
  unless the account has separately approved retention controls.
- Do not record secrets, raw images, raw audio, credentials, signed URLs, full
  device identifiers, or private contact data in smoke or release artifacts.

After each gate, rerun the matching preflight from `expo/`. The Store gate is
authoritative only after the exact candidate, authenticated Apple build record,
and blind-participant TestFlight evidence all agree.
