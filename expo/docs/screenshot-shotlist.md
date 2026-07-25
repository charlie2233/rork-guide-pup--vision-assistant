# Guide Pup Screenshot Shot List

Capture these screens directly from the shipping app for App Store Connect. An authenticated read-only observation on 2026-07-24 showed the live iOS 1.0.0 iPhone slot labeled `6.5-inch Display`, accepting portrait `1242 x 2688` or `1284 x 2778` plus landscape equivalents, with `0/10 screenshots`. Prefer direct capture at `1284 x 2778` when the simulator or device can produce it. Perform a final authenticated App Store Connect recheck before upload; this observation does not claim that a screenshot asset exists.

## Capture Set

| Shot | Visible target | Trigger | Scroll position |
| --- | --- | --- | --- |
| Home | The first screen with `Start Guidance` visible and no permission sheet. | Complete onboarding and dismiss or resolve any permission sheet before capture. | Initial position; do not scroll. |
| Active guidance | A consented, staged empty indoor path with no people or private text. Show the real `Guidance active` state plus the current direction and message from a provider-backed result. Spoken output by itself is not screenshot evidence. | With network access available and permissions granted, say `start guidance`; wait for a real provider-backed result before capture. | Initial guidance position; do not scroll. |
| Safe STOP | The real `Backend unavailable` safe STOP state after at least one provider-backed result. | Deliberately remove network access, wait for the app to enter the real safe STOP state, capture it, then restore network access. Do not mock the result or UI state. | Initial guidance position; do not scroll. |
| Settings | `Speech`, `Descriptions`, and `Haptics` visible. No Bounding boxes control is present. | Open Settings from Home after permissions are settled. | Top position; do not scroll. |
| Optional Safety / emergency | The assistive-only limitation and emergency disclaimer visible. | Open `Safety / emergency` from Settings. | Top position; do not scroll. |

## Capture Rules

- Prefer direct app captures at `1284 x 2778`; `1242 x 2688` is also listed for the observed portrait slot. Do not add a device frame.
- Keep the production visual style and exclude debug overlays, experimental tabs, diagnostics evidence, and internal-validation wording.
- Do not show raw camera content or any personal, sensitive, or identifying information.
- Use only real app and provider states. Do not mock guidance, failures, banners, directions, or messages.
- Treat the Safety / emergency page as optional; keep the focused set to three to five screenshots.

This plan does not claim that screenshots have been uploaded or that accessibility validation is complete.
