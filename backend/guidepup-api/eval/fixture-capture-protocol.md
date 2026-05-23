# Guide Pup Fixture Capture Protocol

Use this when you do not yet have a labeled local fixture set for eval runs.

## Goal

Capture 15 to 30 representative scenes from the real navigation use case without committing the images to git.

## Scene buckets

- 5 clear-path scenes
- 5 obstacle-ahead scenes
- 3 stairs / curb / drop-off scenes
- 3 doorway / hallway scenes
- 3 low-light scenes

## Capture rules

- Use the same iPhone camera position you expect in normal app use.
- Keep people and personally identifying details out of frame when possible.
- Avoid recording addresses, faces, license plates, or documents.
- Capture one still frame per scenario, then store it outside the repo.
- Label every file with scene bucket, expected safe direction, and expected hazard level.

## Suggested manifest labels

- `scenario`
- `expectedDirection`
- `expectedHazard`
- `expectedHazardLevel`
- `expectedLighting`
- `expectedSurfaceType`
- `expectedWalkability`
- `notes`

Every expected label should be deliberate. The eval harness treats a mismatch for expected direction, hazard level, lighting, surface type, or walkability as an invalid fixture result, even when the provider returns structurally valid JSON.

## Example naming

- `clear-path_hallway_forward_none_01.jpg`
- `obstacle-ahead_box-stop-medium_02.jpg`
- `stairs-curb-drop-off_stairs-stop-high_03.jpg`

## Storage guidance

- Keep raw fixtures in a private folder outside the repository.
- Add only the manifest path references locally.
- Do not commit raw captures or base64 payloads.
