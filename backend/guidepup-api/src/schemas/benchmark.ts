import { z } from "zod";
import {
  BaseAnalyzeVisionRequestSchema,
  DirectionSchema,
  HazardLevelSchema,
  validateAnalyzeVisionRequest,
} from "./vision";

export const BenchmarkProviderNameSchema = z.enum(["openai-compatible", "huggingface-minicpm-o"]);

export const BenchmarkVisionRequestSchema = BaseAnalyzeVisionRequestSchema.extend({
  providers: z.array(BenchmarkProviderNameSchema).min(1).max(2).default(["openai-compatible"]),
  samples: z.number().int().min(1).max(3).default(1),
}).superRefine(validateAnalyzeVisionRequest);

export const BenchmarkVisionResultSchema = z.object({
  averageLatencyMs: z.number().min(0),
  confidence: z.number().min(0).max(1).optional(),
  direction: DirectionSchema.optional(),
  error: z.string().optional(),
  hazardLevel: HazardLevelSchema.optional(),
  model: z.string().min(1).max(128).optional(),
  provider: BenchmarkProviderNameSchema,
  samples: z.number().int().min(1).max(3),
  transport: z.string().max(64).optional(),
  valid: z.boolean(),
});

export const BenchmarkVisionResponseSchema = z.object({
  apiVersion: z.literal("v1"),
  environment: z.enum(["development", "staging"]),
  promptVersion: z.string().min(1).max(64),
  requestedProviders: z.array(BenchmarkProviderNameSchema),
  results: z.array(BenchmarkVisionResultSchema),
});

export type BenchmarkVisionRequest = z.infer<typeof BenchmarkVisionRequestSchema>;
export type BenchmarkVisionResponse = z.infer<typeof BenchmarkVisionResponseSchema>;
export type BenchmarkVisionResult = z.infer<typeof BenchmarkVisionResultSchema>;
