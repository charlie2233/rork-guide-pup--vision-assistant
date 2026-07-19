const DEFAULT_PROMPT_VERSION = "2026-05-22.v1";

type VisionPromptInput = {
  appVersion?: string;
  captureHeuristics?: {
    captureLatencyMs?: number;
    frameAgeMs?: number;
    imageSource?: "uri" | "base64" | "unknown";
    resizedForUpload?: boolean;
    uploadedHeight?: number;
    uploadedWidth?: number;
  };
  detail?: "low" | "high";
  frameId?: string;
  frameSummary?: string;
  hasImage?: boolean;
  interactionMode?: "guidance" | "scene-query";
  nativePath?: "native-core" | "js-fallback";
  platform?: "ios" | "android" | "web" | "unknown";
  priorGuidance?: string;
  sampledFrame?: boolean;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  timestampMs?: number;
};

export function getPromptVersion(env: Env) {
  return env.PROMPT_VERSION || DEFAULT_PROMPT_VERSION;
}

export function buildVisionSystemPrompt(
  promptVersion: string,
  interactionMode: "guidance" | "scene-query" = "guidance",
) {
  const modeInstruction = interactionMode === "scene-query"
    ? "This is a bounded scene query. The sceneDescription field is spoken aloud, so make it a concise description of visible facts while still assessing hazards and returning a safety direction. Do not issue commands or propose control changes."
    : "This is active guidance. The shortMessage field is spoken aloud; keep it under 12 words and make it an immediate, concrete navigation instruction while still describing the visible scene accurately.";

  return [
    `You are Guide Pup's navigation vision assistant. Prompt version: ${promptVersion}.`,
    "You must prioritize user safety over speed, optimism, or smoothness.",
    "Assess whether a person can move forward safely while holding a phone camera at chest height.",
    "Treat the image as one sampled frame, not continuous video; do not infer motion or timing from frames you cannot see.",
    "Look carefully for stairs, curbs, drop-offs, ledges, vehicles, bikes, wet floors, blocked sidewalks, and uncertain walkability.",
    "Judge walkability, hazard clarity, surface type, lighting, and confidence before choosing direction.",
    "If the scene is ambiguous, low-quality, dark, blurry, backlit, or partially occluded, recommend stop.",
    "Only recommend forward when the visible walking surface, lighting, and path are clearly safe.",
    modeInstruction,
    "Do not change or suggest changing camera sessions, route navigation, STOP behavior, haptics, VoiceOver, speech rate, detail level, or timing; iOS controls those deterministically.",
    "Keep spoken fields free of request IDs, frame IDs, provider names, or technical jargon.",
    "Return only the structured fields requested by the API schema.",
    "Use notes for brief internal rationale, not spoken user guidance.",
  ].join("\n");
}

export const ProviderVisionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "recommendedDirection",
    "confidence",
    "hazardLevel",
    "sceneDescription",
    "shortMessage",
    "surfaceType",
    "lighting",
    "walkability",
    "pathClear",
    "criticalHazards",
    "obstacles",
    "notes",
  ],
  properties: {
    recommendedDirection: {
      type: "string",
      enum: ["turn-left", "turn-right", "forward", "stop"],
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    hazardLevel: {
      type: "string",
      enum: ["none", "low", "medium", "high"],
    },
    sceneDescription: {
      type: "string",
      maxLength: 280,
    },
    shortMessage: {
      type: "string",
      maxLength: 120,
    },
    surfaceType: {
      type: "string",
      maxLength: 80,
    },
    lighting: {
      type: "string",
      enum: ["dark", "dim", "normal", "bright", "unknown"],
    },
    walkability: {
      type: "string",
      enum: ["clear", "caution", "uncertain"],
    },
    pathClear: {
      type: "boolean",
    },
    criticalHazards: {
      type: "array",
      maxItems: 6,
      items: {
        type: "string",
        maxLength: 64,
      },
    },
    obstacles: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "position", "distance", "confidence"],
        properties: {
          type: {
            type: "string",
            maxLength: 80,
          },
          position: {
            type: "string",
            enum: ["left", "center", "right"],
          },
          distance: {
            type: "string",
            enum: ["very-close", "close", "medium", "far"],
          },
          confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
          },
        },
      },
    },
    notes: {
      type: "string",
      maxLength: 280,
    },
  },
} as const;

function buildCompactFrameContext(input?: VisionPromptInput) {
  if (!input) {
    return "{}";
  }

  return JSON.stringify({
    appVersion: input.appVersion,
    captureHeuristics: input.captureHeuristics,
    detail: input.detail,
    frameId: input.frameId,
    frameSummary: input.frameSummary,
    hasImage: input.hasImage,
    interactionMode: input.interactionMode ?? "guidance",
    nativePath: input.nativePath,
    platform: input.platform,
    priorGuidance: input.priorGuidance,
    sampledFrame: input.sampledFrame,
    sessionId: input.sessionId,
    sourceHeight: input.sourceHeight,
    sourceWidth: input.sourceWidth,
    timestampMs: input.timestampMs,
  });
}

export function buildVisionUserPrompt(input?: VisionPromptInput) {
  const interactionMode = input?.interactionMode ?? "guidance";
  const modeInstruction = interactionMode === "scene-query"
    ? "Answer the bounded what-do-you-see request through sceneDescription using concise visible facts; keep hazard assessment active."
    : "Provide concise active guidance through shortMessage.";

  return [
    "Analyze this single camera frame for safe pedestrian navigation.",
    modeInstruction,
    "Keep the spoken message short enough for real-time audio guidance.",
    "Use prior guidance only to avoid repetition; base safety on the current frame.",
    "Only recommend forward if the path looks confidently walkable.",
    "If the sampled-frame context is missing or contradicts image quality, prefer stop.",
    `Compact frame context: ${buildCompactFrameContext(input)}`,
  ].join(" ");
}
