import type { ProviderVision } from "../schemas/vision";

export type VisionInteractionMode = "guidance" | "scene-query";

export type CaptureHeuristics = {
  captureLatencyMs?: number;
  frameAgeMs?: number;
  imageSource?: "uri" | "base64" | "unknown";
  resizedForUpload?: boolean;
  uploadedHeight?: number;
  uploadedWidth?: number;
};

export type ProviderInput = {
  appVersion?: string;
  captureHeuristics?: CaptureHeuristics;
  detail: "low" | "high";
  frameId?: string;
  frameSummary?: string;
  hasImage?: boolean;
  imageBase64: string;
  interactionMode: VisionInteractionMode;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  nativePath?: "native-core" | "js-fallback";
  platform?: "ios" | "android" | "web" | "unknown";
  promptVersion: string;
  priorGuidance?: string;
  requestId: string;
  sampledFrame?: boolean;
  sessionId?: string;
  sourceHeight?: number;
  sourceWidth?: number;
  timestampMs?: number;
};

export type ProviderResult = {
  latencyMs: number;
  model: string;
  parsed: ProviderVision;
  provider: string;
  transport: string;
  rawText: string;
};

export interface VisionProvider {
  analyze(input: ProviderInput, env: Env): Promise<ProviderResult>;
  readonly model: string;
  readonly name: string;
}
