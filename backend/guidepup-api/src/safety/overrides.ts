import { type VisionAnalyzeResponse, VisionAnalyzeResponseSchema } from "../schemas/vision";

type SafetyContext = {
  confidence: number;
  hasCloseObstacle: boolean;
  lighting?: "dark" | "dim" | "normal" | "bright" | "unknown";
  pathClear?: boolean;
  safetyTags: string[];
  walkability?: "clear" | "caution" | "uncertain";
};

const MIN_SAFE_CONFIDENCE = 0.65;

function stopWithMessage(response: VisionAnalyzeResponse, message: string, fallbackReason: string) {
  return VisionAnalyzeResponseSchema.parse({
    ...response,
    confidence: Math.min(response.confidence, 0.45),
    direction: "stop",
    fallbackReason,
    hazardLevel: "high",
    message,
    obstacle: true,
  });
}

export function applySafetyOverrides(response: VisionAnalyzeResponse, context: SafetyContext) {
  if (context.hasCloseObstacle) {
    return stopWithMessage(response, "Stop. Obstacle is very close.", "close-obstacle");
  }

  if (context.pathClear === false) {
    return stopWithMessage(response, "Stop. Path is not clear.", "path-not-clear");
  }

  if (response.hazardLevel === "high") {
    return stopWithMessage(response, "Stop. Path looks unsafe.", "high-hazard");
  }

  if (response.hazardLevel === "medium") {
    return stopWithMessage(response, "Stop. Path may be unsafe.", "medium-hazard");
  }

  if (context.walkability === "caution" || context.walkability === "uncertain") {
    return stopWithMessage(response, "Stop. Walkability is uncertain.", "uncertain-walkability");
  }

  if (context.lighting === "dark" || context.lighting === "dim" || context.lighting === "unknown") {
    return stopWithMessage(response, "Stop. Visibility is too low.", "low-visibility");
  }

  if (context.safetyTags.some((tag) => ["stairs", "curb", "drop-off", "uncertain-walkability"].includes(tag))) {
    return stopWithMessage(response, "Stop. Hazard ahead.", "critical-hazard");
  }

  if (context.confidence < MIN_SAFE_CONFIDENCE) {
    return stopWithMessage(response, "Stop. I need a clearer view.", "low-confidence");
  }

  return response;
}
