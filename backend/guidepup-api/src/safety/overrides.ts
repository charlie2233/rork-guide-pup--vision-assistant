import { type VisionAnalyzeResponse, VisionAnalyzeResponseSchema } from "../schemas/vision";

type SafetyContext = {
  confidence: number;
  safetyTags: string[];
  walkability?: "clear" | "caution" | "uncertain";
};

function stopWithMessage(response: VisionAnalyzeResponse, message: string) {
  return VisionAnalyzeResponseSchema.parse({
    ...response,
    confidence: Math.min(response.confidence, 0.45),
    direction: "stop",
    hazardLevel: "high",
    message,
    obstacle: true,
  });
}

export function applySafetyOverrides(response: VisionAnalyzeResponse, context: SafetyContext) {
  if (context.confidence < 0.45) {
    return stopWithMessage(response, "Stop. I need a clearer view.");
  }

  if (response.hazardLevel === "high") {
    return stopWithMessage(response, "Stop. Path looks unsafe.");
  }

  if (context.walkability === "uncertain") {
    return stopWithMessage(response, "Stop. Walkability is uncertain.");
  }

  if (context.safetyTags.some((tag) => ["stairs", "curb", "drop-off", "uncertain-walkability"].includes(tag))) {
    return stopWithMessage(response, "Stop. Hazard ahead.");
  }

  return response;
}
