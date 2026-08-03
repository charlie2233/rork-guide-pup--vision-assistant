import { z } from "zod";

export const MAX_SAMPLED_IMAGE_LONG_EDGE = 768;
export const MAX_IMAGE_BASE64_CHARACTERS = 1_500_000;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export const DirectionSchema = z.enum(["turn-left", "turn-right", "forward", "stop"]);
export const HazardLevelSchema = z.enum(["none", "low", "medium", "high"]);
export const LightingSchema = z.enum(["dark", "dim", "normal", "bright", "unknown"]);
export const WalkabilitySchema = z.enum(["clear", "caution", "uncertain"]);
export const InteractionModeSchema = z.enum(["guidance", "scene-query"]);
export const PositionSchema = z.enum(["left", "center", "right"]);
export const DistanceSchema = z.enum(["very-close", "close", "medium", "far"]);
export const CaptureHeuristicsSchema = z.object({
  captureLatencyMs: z.number().min(0).max(60000).optional(),
  frameAgeMs: z.number().min(0).max(60000).optional(),
  imageSource: z.enum(["uri", "base64", "unknown"]).optional(),
  resizedForUpload: z.boolean().optional(),
  uploadedHeight: z.number().int().positive().max(MAX_SAMPLED_IMAGE_LONG_EDGE).optional(),
  uploadedWidth: z.number().int().positive().max(MAX_SAMPLED_IMAGE_LONG_EDGE).optional(),
});

export const ObstacleSchema = z.object({
  confidence: z.number().min(0).max(1),
  distance: DistanceSchema,
  position: PositionSchema,
  type: z.string().min(1).max(80),
}).strict();

export const BaseAnalyzeVisionRequestSchema = z.object({
  appVersion: z.string().max(64).optional(),
  captureHeuristics: CaptureHeuristicsSchema.optional(),
  frameId: z.string().min(1).max(80).optional(),
  frameSummary: z.string().trim().min(1).max(280).optional(),
  detail: z.enum(["low", "high"]).default("low"),
  hasImage: z.boolean().optional(),
  locale: z.string().max(32).optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  nativePath: z.enum(["native-core", "js-fallback"]).optional(),
  platform: z.enum(["ios", "android", "web", "unknown"]).optional(),
  priorGuidance: z.string().max(280).optional(),
  sampledFrame: z.boolean().optional(),
  sessionId: z.string().min(1).max(80).optional(),
  sourceHeight: z.number().int().positive().max(MAX_SAMPLED_IMAGE_LONG_EDGE).optional(),
  sourceWidth: z.number().int().positive().max(MAX_SAMPLED_IMAGE_LONG_EDGE).optional(),
  timestampMs: z.number().int().positive().optional(),
  imageBase64: z.string()
    .min(128)
    .max(MAX_IMAGE_BASE64_CHARACTERS)
    .regex(BASE64_PATTERN),
  interactionMode: InteractionModeSchema.default("guidance"),
});

function addPairIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  context.addIssue({
    code: "custom",
    message,
    path,
  });
}

type ImageMetadata = {
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
};

function readUint16BigEndian(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function matchesAscii(bytes: Uint8Array, offset: number, value: string) {
  return [...value].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function readJpegDimensions(bytes: Uint8Array): ImageMetadata | undefined {
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= bytes.length) {
      return undefined;
    }

    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return undefined;
    }
    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
    ].includes(marker);
    if (isStartOfFrame) {
      if (segmentLength < 7) {
        return undefined;
      }
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        mimeType: "image/jpeg",
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }
    if (marker === 0xda) {
      return undefined;
    }

    offset += segmentLength;
  }

  return undefined;
}

function readWebpDimensions(bytes: Uint8Array): ImageMetadata | undefined {
  if (bytes.length < 16 || !matchesAscii(bytes, 0, "RIFF") || !matchesAscii(bytes, 8, "WEBP")) {
    return undefined;
  }

  const chunkType = String.fromCharCode(...bytes.slice(12, 16));
  if (chunkType === "VP8X" && bytes.length >= 30) {
    return {
      height: readUint24LittleEndian(bytes, 27) + 1,
      mimeType: "image/webp",
      width: readUint24LittleEndian(bytes, 24) + 1,
    };
  }
  if (chunkType === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    return {
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      mimeType: "image/webp",
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
    };
  }
  if (
    chunkType === "VP8 " &&
    bytes.length >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
      mimeType: "image/webp",
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
    };
  }

  return undefined;
}

function readImageMetadata(imageBase64: string): ImageMetadata | undefined {
  if (
    imageBase64.length > MAX_IMAGE_BASE64_CHARACTERS ||
    imageBase64.length < 128 ||
    !BASE64_PATTERN.test(imageBase64)
  ) {
    return undefined;
  }

  try {
    const binary = atob(imageBase64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      matchesAscii(bytes, 1, "PNG\r\n\x1a\n") &&
      matchesAscii(bytes, 12, "IHDR")
    ) {
      return {
        height: readUint32BigEndian(bytes, 20),
        mimeType: "image/png",
        width: readUint32BigEndian(bytes, 16),
      };
    }
    if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      return readJpegDimensions(bytes);
    }
    return readWebpDimensions(bytes);
  } catch {
    return undefined;
  }
}

export function validateAnalyzeVisionRequest(
  value: z.infer<typeof BaseAnalyzeVisionRequestSchema>,
  context: z.RefinementCtx,
) {
  const hasSourceWidth = value.sourceWidth !== undefined;
  const hasSourceHeight = value.sourceHeight !== undefined;
  if (hasSourceWidth !== hasSourceHeight) {
    addPairIssue(context, ["sourceWidth"], "Source dimensions must be provided together.");
  }

  const uploadedWidth = value.captureHeuristics?.uploadedWidth;
  const uploadedHeight = value.captureHeuristics?.uploadedHeight;
  const hasUploadedWidth = uploadedWidth !== undefined;
  const hasUploadedHeight = uploadedHeight !== undefined;
  if (hasUploadedWidth !== hasUploadedHeight) {
    addPairIssue(context, ["captureHeuristics", "uploadedWidth"], "Uploaded dimensions must be provided together.");
  }

  if (
    hasSourceWidth &&
    hasSourceHeight &&
    hasUploadedWidth &&
    hasUploadedHeight &&
    (value.sourceWidth !== uploadedWidth || value.sourceHeight !== uploadedHeight)
  ) {
    addPairIssue(context, ["captureHeuristics"], "Source and uploaded image dimensions must agree.");
  }

  if (value.hasImage === false) {
    addPairIssue(context, ["hasImage"], "Analyze payloads must contain an image.");
  }
  if (value.sampledFrame === false) {
    addPairIssue(context, ["sampledFrame"], "Analyze payloads must represent a sampled frame.");
  }
  const imageMetadata = readImageMetadata(value.imageBase64);
  if (!imageMetadata) {
    addPairIssue(context, ["imageBase64"], "Image metadata is invalid.");
    return;
  }
  if (imageMetadata.mimeType !== value.mimeType) {
    addPairIssue(context, ["mimeType"], "Image bytes do not match the declared MIME type.");
  }
  if (
    imageMetadata.width <= 0 ||
    imageMetadata.height <= 0 ||
    Math.max(imageMetadata.width, imageMetadata.height) > MAX_SAMPLED_IMAGE_LONG_EDGE
  ) {
    addPairIssue(context, ["imageBase64"], "Image dimensions exceed the sampled-frame limit.");
  }
  if (
    hasSourceWidth &&
    hasSourceHeight &&
    (value.sourceWidth !== imageMetadata.width || value.sourceHeight !== imageMetadata.height)
  ) {
    addPairIssue(context, ["sourceWidth"], "Declared source dimensions do not match the image bytes.");
  }
  if (
    hasUploadedWidth &&
    hasUploadedHeight &&
    (uploadedWidth !== imageMetadata.width || uploadedHeight !== imageMetadata.height)
  ) {
    addPairIssue(context, ["captureHeuristics"], "Declared uploaded dimensions do not match the image bytes.");
  }
}

export const AnalyzeVisionRequestSchema = BaseAnalyzeVisionRequestSchema.superRefine(validateAnalyzeVisionRequest);

export const ProviderVisionSchema = z.object({
  confidence: z.number().min(0).max(1),
  criticalHazards: z.array(z.string().min(1).max(64)).max(6),
  hazardLevel: HazardLevelSchema,
  lighting: LightingSchema,
  notes: z.string().max(280),
  obstacles: z.array(ObstacleSchema).max(6),
  pathClear: z.boolean(),
  recommendedDirection: DirectionSchema,
  sceneDescription: z.string().trim().min(1).max(280),
  shortMessage: z.string().max(120),
  surfaceType: z.string().trim().min(1).max(80),
  walkability: WalkabilitySchema,
}).strict();

export const VisionAnalyzeResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: DirectionSchema,
  hazardLevel: HazardLevelSchema,
  latencyMs: z.number().min(0),
  fallbackReason: z.string().max(120).nullable(),
  lighting: LightingSchema,
  message: z.string().trim().min(1).max(160),
  model: z.string().min(1).max(128),
  obstacle: z.boolean(),
  promptVersion: z.string().min(1).max(64),
  provider: z.string().min(1).max(64),
  sceneDescription: z.string().trim().min(1).max(280),
  surfaceType: z.string().trim().min(1).max(80),
  walkability: WalkabilitySchema,
});

export const AnalyzeVisionErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  safeResponse: VisionAnalyzeResponseSchema.optional(),
});

export type AnalyzeVisionRequest = z.infer<typeof AnalyzeVisionRequestSchema>;
export type AnalyzeVisionError = z.infer<typeof AnalyzeVisionErrorSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;
export type ProviderVision = z.infer<typeof ProviderVisionSchema>;
export type VisionAnalyzeResponse = z.infer<typeof VisionAnalyzeResponseSchema>;
