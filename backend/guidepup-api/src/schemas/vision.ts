import { z } from "zod";

export const DirectionSchema = z.enum(["turn-left", "turn-right", "forward", "stop"]);
export const HazardLevelSchema = z.enum(["none", "low", "medium", "high"]);
export const LightingSchema = z.enum(["dark", "dim", "normal", "bright", "unknown"]);
export const PositionSchema = z.enum(["left", "center", "right"]);
export const DistanceSchema = z.enum(["very-close", "close", "medium", "far"]);

export const ObstacleSchema = z.object({
  confidence: z.number().min(0).max(1).default(0.5),
  distance: DistanceSchema.default("medium"),
  position: PositionSchema.default("center"),
  type: z.string().min(1).max(80),
});

export const AnalyzeVisionRequestSchema = z.object({
  appVersion: z.string().max(64).optional(),
  frameId: z.string().min(1).max(80).optional(),
  detail: z.enum(["low", "high"]).default("low"),
  hasImage: z.boolean().optional(),
  locale: z.string().max(32).optional(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  nativePath: z.enum(["native-core", "js-fallback"]).optional(),
  platform: z.enum(["ios", "android", "web", "unknown"]).optional(),
  priorGuidance: z.string().max(280).optional(),
  sampledFrame: z.boolean().optional(),
  sessionId: z.string().min(1).max(80).optional(),
  sourceHeight: z.number().int().positive().optional(),
  sourceWidth: z.number().int().positive().optional(),
  timestampMs: z.number().int().positive().optional(),
  imageBase64: z.string().min(128),
});

export const ProviderVisionSchema = z.object({
  confidence: z.number().min(0).max(1).optional(),
  criticalHazards: z.array(z.string().min(1).max(64)).optional(),
  hazardLevel: HazardLevelSchema.optional(),
  lighting: LightingSchema,
  notes: z.string().max(280).optional(),
  obstacles: z.array(ObstacleSchema).default([]),
  pathClear: z.boolean().optional(),
  recommendedDirection: DirectionSchema.optional(),
  sceneDescription: z.string().trim().min(1).max(280),
  shortMessage: z.string().max(120).optional(),
  surfaceType: z.string().trim().min(1).max(80),
  walkability: z.enum(["clear", "caution", "uncertain"]).optional(),
});

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
