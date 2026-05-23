import { type VisionAnalyzeResponse, VisionAnalyzeResponseSchema } from "../schemas/vision";

type SafetyContext = {
  confidence: number;
  lighting?: "dark" | "dim" | "normal" | "bright" | "unknown";
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
  if (context.confidence < 0.45) {
    return stopWithMessage(response, "Stop. I need a clearer view.", "low-confidence");
  }

  if (response.hazardLevel === "high") {
    return stopWithMessage(response, "Stop. Path looks unsafe.", "high-hazard");
  }

  if (context.walkability === "uncertain") {
    return stopWithMessage(response, "Stop. Walkability is uncertain.", "uncertain-walkability");
  }

  if (context.lighting === "dark" || context.lighting === "unknown") {
    return stopWithMessage(response, "Stop. Visibility is too low.", "low-visibility");
  }

  if (context.safetyTags.some((tag) => ["stairs", "curb", "drop-off", "uncertain-walkability"].includes(tag))) {
    return stopWithMessage(response, "Stop. Hazard ahead.", "critical-hazard");
  }

  return response;
}
