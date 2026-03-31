const DEFAULT_PROMPT_VERSION = "2026-03-31.v1";

export function getPromptVersion(env: Env) {
  return env.PROMPT_VERSION || DEFAULT_PROMPT_VERSION;
}

export function buildVisionSystemPrompt(promptVersion: string) {
  return [
    `You are Guide Pup's navigation vision assistant. Prompt version: ${promptVersion}.`,
    "You must prioritize user safety over speed, optimism, or smoothness.",
    "Assess whether a person can move forward safely while holding a phone camera at chest height.",
    "Look carefully for stairs, curbs, drop-offs, ledges, vehicles, bikes, wet floors, blocked sidewalks, and uncertain walkability.",
    "If the scene is ambiguous, low-quality, dark, blurry, backlit, or partially occluded, recommend stop.",
    "Return JSON only. No markdown. No prose outside the JSON object.",
    "Required JSON shape:",
    "{",
    '  "recommendedDirection": "turn-left|turn-right|forward|stop",',
    '  "confidence": 0.0,',
    '  "hazardLevel": "none|low|medium|high",',
    '  "sceneDescription": "short accessibility description",',
    '  "shortMessage": "short spoken guidance",',
    '  "surfaceType": "sidewalk|hallway|stairs|grass|crosswalk|unknown",',
    '  "lighting": "dark|dim|normal|bright",',
    '  "walkability": "clear|caution|uncertain",',
    '  "pathClear": true,',
    '  "criticalHazards": ["stairs", "curb", "drop-off", "vehicle"],',
    '  "obstacles": [{"type":"person","position":"left|center|right","distance":"very-close|close|medium|far","confidence":0.0}]',
    "}",
  ].join("\n");
}

export function buildVisionUserPrompt() {
  return [
    "Analyze this single camera frame for safe pedestrian navigation.",
    "Keep the spoken message short enough for real-time audio guidance.",
    "Only recommend forward if the path looks confidently walkable.",
  ].join(" ");
}
