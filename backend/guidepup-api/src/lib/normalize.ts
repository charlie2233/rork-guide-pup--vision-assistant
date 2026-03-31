import {
  type ProviderVision,
  type VisionAnalyzeResponse,
  VisionAnalyzeResponseSchema,
} from "../schemas/vision";
import { applySafetyOverrides } from "../safety/overrides";

type NormalizeMetadata = {
  latencyMs: number;
  model: string;
  promptVersion: string;
  provider: string;
};

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function cleanOptionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function deriveConfidence(raw: ProviderVision) {
  if (typeof raw.confidence === "number") {
    return clamp(raw.confidence);
  }

  if (raw.hazardLevel === "none" && raw.pathClear === true) {
    return 0.85;
  }

  if (raw.hazardLevel === "high") {
    return 0.35;
  }

  return 0.55;
}

function deriveHazardLevel(raw: ProviderVision, tags: string[]) {
  if (raw.hazardLevel) {
    return raw.hazardLevel;
  }

  if (tags.some((tag) => ["stairs", "curb", "drop-off", "uncertain-walkability"].includes(tag))) {
    return "high";
  }

  if (raw.pathClear === false || raw.obstacles.length > 0) {
    return "medium";
  }

  return "low";
}

function deriveDirection(raw: ProviderVision, hazardLevel: VisionAnalyzeResponse["hazardLevel"]) {
  const direction = raw.recommendedDirection || "stop";

  if (direction === "forward" && raw.pathClear === false && hazardLevel !== "none") {
    return "stop";
  }

  return direction;
}

function collectSafetyTags(raw: ProviderVision) {
  const tags = new Set<string>((raw.criticalHazards || []).map((value) => value.toLowerCase().trim()));
  const haystack = [
    raw.sceneDescription,
    raw.shortMessage,
    raw.notes,
    raw.surfaceType,
    ...raw.obstacles.map((obstacle) => obstacle.type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/stairs?|steps?/.test(haystack)) {
    tags.add("stairs");
  }
  if (/curb/.test(haystack)) {
    tags.add("curb");
  }
  if (/drop[ -]?off|ledge|edge/.test(haystack)) {
    tags.add("drop-off");
  }
  if (raw.walkability === "uncertain") {
    tags.add("uncertain-walkability");
  }

  return [...tags];
}

function buildMessage(response: Omit<VisionAnalyzeResponse, "message">, raw: ProviderVision, safetyTags: string[]) {
  const shortMessage = raw.shortMessage?.trim();
  if (shortMessage) {
    return shortMessage.slice(0, 160);
  }

  if (response.direction === "stop") {
    if (safetyTags.some((tag) => ["stairs", "curb", "drop-off"].includes(tag))) {
      return "Stop. Hazard ahead.";
    }
    if (response.hazardLevel === "high") {
      return "Stop. Path looks unsafe.";
    }
    return "Stop. I need a clearer view.";
  }

  if (response.direction === "turn-left") {
    return "Turn left carefully.";
  }

  if (response.direction === "turn-right") {
    return "Turn right carefully.";
  }

  if (response.hazardLevel === "medium") {
    return "Move forward cautiously.";
  }

  return "Continue forward.";
}

export function createSafeFallbackResponse(
  metadata: NormalizeMetadata,
  message = "Stop. Vision guidance is unavailable.",
) {
  return VisionAnalyzeResponseSchema.parse({
    confidence: 0,
    direction: "stop",
    hazardLevel: "high",
    latencyMs: metadata.latencyMs,
    message,
    model: metadata.model,
    obstacle: true,
    promptVersion: metadata.promptVersion,
    provider: metadata.provider,
  });
}

export function normalizeProviderVision(raw: ProviderVision, metadata: NormalizeMetadata) {
  const safetyTags = collectSafetyTags(raw);
  const hazardLevel = deriveHazardLevel(raw, safetyTags);
  const confidence = clamp(deriveConfidence(raw));
  const direction = deriveDirection(raw, hazardLevel);
  const obstacle = hazardLevel !== "none" || raw.obstacles.length > 0 || direction === "stop";

  const normalizedBase: Omit<VisionAnalyzeResponse, "message"> = {
    confidence,
    direction,
    hazardLevel,
    latencyMs: metadata.latencyMs,
    lighting: raw.lighting,
    model: metadata.model,
    obstacle,
    promptVersion: metadata.promptVersion,
    provider: metadata.provider,
    sceneDescription: cleanOptionalText(raw.sceneDescription),
    surfaceType: cleanOptionalText(raw.surfaceType),
  };

  const normalized = VisionAnalyzeResponseSchema.parse({
    ...normalizedBase,
    message: buildMessage(normalizedBase, raw, safetyTags),
  });

  return applySafetyOverrides(normalized, {
    confidence,
    safetyTags,
    walkability: raw.walkability,
  });
}
