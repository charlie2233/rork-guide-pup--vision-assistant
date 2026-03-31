import { Platform } from "react-native";
import { z } from "zod";

import { appConfig, requireApiBaseUrl } from "./config";
import { clearDeviceSession, ensureDeviceSession } from "./device";

export const VisionAnalyzeResponseSchema = z.object({
  confidence: z.number().min(0).max(1),
  direction: z.enum(["turn-left", "turn-right", "forward", "stop"]),
  hazardLevel: z.enum(["none", "low", "medium", "high"]),
  latencyMs: z.number().min(0),
  lighting: z.enum(["dark", "dim", "normal", "bright"]).optional(),
  message: z.string().min(1),
  model: z.string().min(1),
  obstacle: z.boolean(),
  promptVersion: z.string().min(1),
  provider: z.string().min(1),
  sceneDescription: z.string().optional(),
  surfaceType: z.string().optional(),
});

const AnalyzeVisionErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  safeResponse: VisionAnalyzeResponseSchema.optional(),
});

export type VisionAnalyzeResponse = z.infer<typeof VisionAnalyzeResponseSchema>;

export type AnalyzeVisionPayload = {
  detail?: "low" | "high";
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceHeight?: number;
  sourceWidth?: number;
};

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), appConfig.apiTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getPlatform() {
  if (Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web") {
    return Platform.OS;
  }

  return "unknown";
}

export async function analyzeVision(payload: AnalyzeVisionPayload, allowRetry = true): Promise<VisionAnalyzeResponse> {
  const session = await ensureDeviceSession();
  const response = await fetchWithTimeout(`${requireApiBaseUrl()}/v1/vision/analyze`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${session.sessionToken}`,
      "content-type": "application/json",
      "x-guidepup-device-id": session.deviceId,
    },
    body: JSON.stringify({
      appVersion: undefined,
      detail: payload.detail || "low",
      imageBase64: payload.imageBase64,
      mimeType: payload.mimeType,
      platform: getPlatform(),
      sourceHeight: payload.sourceHeight,
      sourceWidth: payload.sourceWidth,
    }),
  });

  const rawText = await response.text();
  const rawJson = rawText ? JSON.parse(rawText) : {};

  if (response.status === 401 && allowRetry) {
    await clearDeviceSession();
    return analyzeVision(payload, false);
  }

  if (!response.ok) {
    const parsedError = AnalyzeVisionErrorSchema.safeParse(rawJson);
    if (parsedError.success && parsedError.data.safeResponse) {
      return parsedError.data.safeResponse;
    }

    const message =
      parsedError.success ? parsedError.data.error.message : `Guide Pup API request failed (${response.status}).`;
    throw new Error(message);
  }

  const parsedResponse = VisionAnalyzeResponseSchema.safeParse(rawJson);
  if (!parsedResponse.success) {
    throw new Error("Guide Pup API returned an invalid response.");
  }

  return parsedResponse.data;
}
