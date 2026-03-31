import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

import { analyzeVision, type VisionAnalyzeResponse } from "@/src/lib/api";
import { captureAppError } from "@/src/lib/sentry";

const MAX_UPLOAD_WIDTH = 768;

export type VisionAnalysis = VisionAnalyzeResponse;

export interface AnalyzeFrameInput {
  base64?: string;
  height?: number;
  uri?: string;
  width?: number;
}

export interface VisionAIResult {
  success: boolean;
  analysis: VisionAnalysis | null;
  error?: string;
  timestamp: number;
}

async function preprocessFrame(input: AnalyzeFrameInput) {
  if (input.uri) {
    const shouldResize = Boolean(input.width && input.width > MAX_UPLOAD_WIDTH);
    const manipulated = await ImageManipulator.manipulateAsync(
      input.uri,
      shouldResize ? [{ resize: { width: MAX_UPLOAD_WIDTH } }] : [],
      {
        base64: true,
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    if (!manipulated.base64) {
      throw new Error("Image preprocessing did not produce a base64 payload.");
    }

    return {
      base64: manipulated.base64,
      height: manipulated.height,
      mimeType: "image/jpeg" as const,
      width: manipulated.width,
    };
  }

  if (input.base64) {
    return {
      base64: input.base64,
      height: input.height,
      mimeType: "image/jpeg" as const,
      width: input.width,
    };
  }

  throw new Error("No image data was available for vision analysis.");
}

export async function analyzeFrame(frame: AnalyzeFrameInput): Promise<VisionAIResult> {
  const timestamp = Date.now();

  try {
    console.log("[VisionAI] Starting backend-guided frame analysis...");

    const prepared = await preprocessFrame(frame);
    const analysis = await analyzeVision({
      detail: Platform.OS === "web" ? "high" : "low",
      imageBase64: prepared.base64,
      mimeType: prepared.mimeType,
      sourceHeight: prepared.height,
      sourceWidth: prepared.width,
    });

    console.log("[VisionAI] Analysis complete:", JSON.stringify(analysis, null, 2));

    return {
      success: true,
      analysis,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[VisionAI] Analysis failed:", errorMessage);
    void captureAppError(error, {
      module: "VisionAI",
      route: "analyzeFrame",
    });
    
    return {
      success: false,
      analysis: null,
      error: errorMessage,
      timestamp,
    };
  }
}

export const VisionAI = {
  analyzeFrame,
};
