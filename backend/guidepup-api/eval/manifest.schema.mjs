import { z } from "zod";

export const EvalScenarioSchema = z.enum([
  "clear-path",
  "obstacle-ahead",
  "stairs-curb-drop-off",
  "doorway-hallway",
  "low-light",
]);

export const EvalFixtureSchema = z.object({
  expectedDirection: z.enum(["turn-left", "turn-right", "forward", "stop"]).optional(),
  expectedHazard: z.boolean().default(false),
  expectedHazardLevel: z.enum(["none", "low", "medium", "high"]).optional(),
  id: z.string().min(1).max(64),
  imageBase64: z.string().min(16).optional(),
  imagePath: z.string().min(1).optional(),
  label: z.string().min(1).max(120),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
  notes: z.string().max(240).optional(),
  detail: z.enum(["low", "high"]).default("low"),
  scenario: EvalScenarioSchema,
});

export const EvalBenchmarkSchema = z.object({
  debugToken: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  providers: z.array(z.enum(["openai-compatible", "huggingface-minicpm-o"])).default(["openai-compatible"]),
  samples: z.number().int().min(1).max(3).default(1),
});

export const EvalManifestSchema = z.object({
  apiBaseUrl: z.string().url().optional(),
  benchmark: EvalBenchmarkSchema.default({ enabled: false }),
  deviceId: z.string().uuid().optional(),
  fixtures: z.array(EvalFixtureSchema).min(1),
  name: z.string().min(1).max(120),
  notes: z.string().max(500).optional(),
});

export function loadEvalManifest(manifestJson) {
  return EvalManifestSchema.parse(manifestJson);
}
