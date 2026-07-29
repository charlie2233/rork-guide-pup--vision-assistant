import { type VisionAnalyzeResponse, VisionAnalyzeResponseSchema } from "../schemas/vision";
import { getSafetyStopReason } from "../../eval/safety-policy.mjs";

type SafetyContext = {
  confidence: number;
  hasCloseObstacle: boolean;
  hasPathBlockingObstacle: boolean;
  lighting?: "dark" | "dim" | "normal" | "bright" | "unknown";
  pathClear?: boolean;
  safetyTags: string[];
  walkability?: "clear" | "caution" | "uncertain";
};

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
  const stopReason = getSafetyStopReason({
    confidence: context.confidence,
    direction: response.direction,
    fallbackReason: response.fallbackReason,
    hasCloseObstacle: context.hasCloseObstacle,
    hasPathBlockingObstacle: context.hasPathBlockingObstacle,
    hazardLevel: response.hazardLevel,
    lighting: context.lighting,
    obstacle: response.obstacle,
    pathClear: context.pathClear,
    safetyTags: context.safetyTags,
    walkability: context.walkability,
  });

  switch (stopReason) {
    case "close-obstacle":
    case "obstacle":
      return stopWithMessage(response, "Stop. Obstacle is very close.", stopReason);
    case "path-blocking-obstacle":
      return stopWithMessage(response, "Stop. Obstacle blocks the path.", stopReason);
    case "path-not-clear":
      return stopWithMessage(response, "Stop. Path is not clear.", stopReason);
    case "high-hazard":
      return stopWithMessage(response, "Stop. Path looks unsafe.", stopReason);
    case "medium-hazard":
      return stopWithMessage(response, "Stop. Path may be unsafe.", stopReason);
    case "uncertain-walkability":
      return stopWithMessage(response, "Stop. Walkability is uncertain.", stopReason);
    case "low-visibility":
      return stopWithMessage(response, "Stop. Visibility is too low.", stopReason);
    case "critical-hazard":
      return stopWithMessage(response, "Stop. Hazard ahead.", stopReason);
    case "fallback":
    case "low-confidence":
    case "provider-stop":
      return stopWithMessage(response, "Stop. I need a clearer view.", stopReason);
    default:
      return response;
  }
}
