# Guide Pup Screenshot Shot List

An authenticated read-only observation on 2026-07-24 established that the live iOS 1.0.0 iPhone slot is labeled `6.5-inch Display` and accepts portrait `1242 x 2688` or `1284 x 2778` plus landscape equivalents. Four direct Release-app captures at `1284 x 2778` were subsequently uploaded with the user's authorization. App Store Connect accepted `4/10 screenshots` and confirms the order below.

## Accepted Set

| Order | File | Visible target | Evidence boundary |
| --- | --- | --- | --- |
| 1 | `01-welcome.png` | Welcome, core safety disclosure, privacy/support links, and `Continue`. | Truthful onboarding state; no permission sheet or private content. |
| 2 | `02-how-to-use.png` | Spoken movement cues, forward-facing phone guidance, STOP/reorient behavior, settings, and compressed-frame disclosure. | Truthful onboarding instructions; no claim of provider or hardware validation. |
| 3 | `03-voice-settings.png` | `Speech`, `Descriptions`, `Haptics`, and privacy/safety links. | Truthful settings state; no Bounding boxes control or experimental feature is shown. |
| 4 | `04-safe-stop-fallback.png` | Real `Backup camera unavailable` conservative STOP state. | Direct simulator fallback behavior; it is not labeled as provider-backed, network-loss, or physical-camera evidence. |

The first three are the App Store installation-sheet set. A final authenticated App Store Connect recheck is still required after the processed build is selected and before submission.

## Capture Rules

- Prefer direct app captures at `1284 x 2778`; `1242 x 2688` is also listed for the observed portrait slot. Do not add a device frame.
- Keep the production visual style and exclude debug overlays, experimental tabs, diagnostics evidence, and internal-validation wording.
- Do not show raw camera content or any personal, sensitive, or identifying information.
- Use only real app and provider states. Do not mock guidance, failures, banners, directions, or messages.
- Do not describe the safe-stop screenshot as physical camera, provider, or network-loss proof.
- Keep the focused set to three to five screenshots unless the final processed build exposes a materially better truthful state.

The screenshot upload is complete. This document does not claim that physical blind-user, VoiceOver, TestFlight-install, or App Review validation is complete.
