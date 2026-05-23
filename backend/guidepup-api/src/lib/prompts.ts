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

export function buildVisionSystemPrompt(promptVersion: string) {
  return [
    `You are Guide Pup's navigation vision assistant. Prompt version: ${promptVersion}.`,
    "You must prioritize user safety over speed, optimism, or smoothness.",
    "Assess whether a person can move forward safely while holding a phone camera at chest height.",
    "Look carefully for stairs, curbs, drop-offs, ledges, vehicles, bikes, wet floors, blocked sidewalks, and uncertain walkability.",
    "If the scene is ambiguous, low-quality, dark, blurry, backlit, or partially occluded, recommend stop.",
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
  return [
    "Analyze this single camera frame for safe pedestrian navigation.",
    "Keep the spoken message short enough for real-time audio guidance.",
    "Only recommend forward if the path looks confidently walkable.",
    `Compact frame context: ${buildCompactFrameContext(input)}`,
  ].join(" ");
}
