import { z } from "zod";

export const BootstrapDeviceRequestSchema = z.object({
  appVersion: z.string().max(64).optional(),
  buildVersion: z.string().max(64).optional(),
  deviceId: z.string().uuid().optional(),
  platform: z.enum(["ios", "android", "web", "unknown"]).optional(),
});

export const BootstrapDeviceResponseSchema = z.object({
  apiVersion: z.literal("v1"),
  deviceId: z.string().uuid(),
  expiresAt: z.string(),
  issuedAt: z.string(),
  promptVersion: z.string(),
  rateLimitPerMinute: z.number().int().positive(),
  sessionToken: z.string().min(16),
});

export type BootstrapDeviceRequest = z.infer<typeof BootstrapDeviceRequestSchema>;
export type BootstrapDeviceResponse = z.infer<typeof BootstrapDeviceResponseSchema>;
