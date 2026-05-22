import type { ProviderVision } from "../schemas/vision";

export type ProviderInput = {
  detail: "low" | "high";
  frameId?: string;
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  nativePath?: "native-core" | "js-fallback";
  promptVersion: string;
  priorGuidance?: string;
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
