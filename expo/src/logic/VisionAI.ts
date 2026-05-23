import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

import {
  analyzeVision,
  type GuidePupCaptureHeuristics,
  type VisionAnalyzeResponse,
} from "@/src/lib/api";
import { recordAnalyzeEvent } from "@/src/lib/diagnostics";
import { captureAppError } from "@/src/lib/sentry";

const MAX_UPLOAD_WIDTH = 768;

export type VisionAnalysis = VisionAnalyzeResponse;

export interface AnalyzeFrameInput {
  base64?: string;
  captureLatencyMs?: number;
  height?: number;
  source?: "native-core" | "js-fallback";
  timestampMs?: number;
  uri?: string;
  width?: number;
}

export interface VisionAIResult {
  success: boolean;
  analysis: VisionAnalysis | null;
  error?: string;
  timestamp: number;
}

export interface AnalyzeFrameOptions {
  detail?: "low" | "high";
  frameId?: string;
  priorGuidance?: string;
  sessionId?: string;
  updateNavigationMemory?: boolean;
}

type PreparedFrame = {
  base64: string;
  height?: number;
  mimeType: "image/jpeg";
  resizedForUpload: boolean;
  width?: number;
};

function buildCaptureHeuristics(frame: AnalyzeFrameInput, prepared?: PreparedFrame): GuidePupCaptureHeuristics {
  const frameAgeMs = frame.timestampMs ? Math.max(0, Date.now() - frame.timestampMs) : undefined;

  return {
    captureLatencyMs: frame.captureLatencyMs,
    frameAgeMs,
    imageSource: frame.uri ? "uri" : frame.base64 ? "base64" : "unknown",
    resizedForUpload: prepared?.resizedForUpload,
    uploadedHeight: prepared?.height,
    uploadedWidth: prepared?.width,
  };
}

function buildFrameSummary(frame: AnalyzeFrameInput, heuristics: GuidePupCaptureHeuristics) {
  const sourcePath = frame.source || "unknown";
  const sourceSize = frame.width && frame.height ? `${frame.width}x${frame.height}` : "unknown-size";
  const uploadedSize = heuristics.uploadedWidth && heuristics.uploadedHeight
    ? `${heuristics.uploadedWidth}x${heuristics.uploadedHeight}`
    : "unknown-upload-size";
  const captureLatency = typeof heuristics.captureLatencyMs === "number"
    ? `${Math.round(heuristics.captureLatencyMs)}ms-capture`
    : "unknown-capture-latency";

  return `Sampled ${sourcePath} frame, source ${sourceSize}, upload ${uploadedSize}, ${captureLatency}.`;
}

async function preprocessFrame(input: AnalyzeFrameInput): Promise<PreparedFrame> {
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
      resizedForUpload: shouldResize,
      width: manipulated.width,
    };
  }

  if (input.base64) {
    return {
      base64: input.base64,
      height: input.height,
      mimeType: "image/jpeg" as const,
      resizedForUpload: false,
      width: input.width,
    };
  }

  throw new Error("No image data was available for vision analysis.");
}

export async function analyzeFrame(frame: AnalyzeFrameInput, options?: AnalyzeFrameOptions): Promise<VisionAIResult> {
  const timestamp = Date.now();
  const detail = options?.detail ?? (Platform.OS === "web" ? "high" : "low");

  try {
    const prepared = await preprocessFrame(frame);
    const captureHeuristics = buildCaptureHeuristics(frame, prepared);
    const frameSummary = buildFrameSummary(frame, captureHeuristics);

    const analysis = await analyzeVision({
      captureHeuristics,
      detail,
      frameId: options?.frameId,
      frameSummary,
      hasImage: true,
      imageBase64: prepared.base64,
      mimeType: prepared.mimeType,
      nativePath: frame.source,
      priorGuidance: options?.priorGuidance,
      sampledFrame: true,
      sessionId: options?.sessionId,
      sourceHeight: prepared.height,
      sourceWidth: prepared.width,
      timestampMs: frame.timestampMs,
    });

    return {
      success: true,
      analysis,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const captureHeuristics = buildCaptureHeuristics(frame);
    recordAnalyzeEvent({
      captureHeuristics,
      detail,
      error: errorMessage,
      frameSummary: buildFrameSummary(frame, captureHeuristics),
      frameTimestampMs: frame.timestampMs,
      hasImage: Boolean(frame.uri || frame.base64),
      latencyMs: Date.now() - timestamp,
      nativePath: frame.source,
      outcome: "preprocess-failure",
      sampledFrame: Boolean(frame.uri || frame.base64),
      safeReason: "image-preprocessing",
      sourceHeight: frame.height,
      sourceWidth: frame.width,
      timestamp,
    });
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
