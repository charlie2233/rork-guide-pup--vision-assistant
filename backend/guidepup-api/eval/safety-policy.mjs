export const MIN_SAFE_CONFIDENCE = 0.65;

export function getSafetyStopReason(input) {
  if (typeof input.fallbackReason === "string" && input.fallbackReason.trim()) {
    return "fallback";
  }
  if (input.hasCloseObstacle === true) {
    return "close-obstacle";
  }
  if (input.pathClear === false) {
    return "path-not-clear";
  }
  if (input.hazardLevel === "high") {
    return "high-hazard";
  }
  if (input.hazardLevel === "medium") {
    return "medium-hazard";
  }
  if (input.walkability === "caution" || input.walkability === "uncertain") {
    return "uncertain-walkability";
  }
  if (input.lighting === "dark" || input.lighting === "dim" || input.lighting === "unknown") {
    return "low-visibility";
  }
  if (Array.isArray(input.safetyTags) && input.safetyTags.length > 0) {
    return "critical-hazard";
  }
  if (typeof input.confidence === "number" && input.confidence < MIN_SAFE_CONFIDENCE) {
    return "low-confidence";
  }
  if (input.direction === "stop") {
    return "provider-stop";
  }
  if (input.obstacle === true) {
    return "obstacle";
  }
  return null;
}

export function requiresSafetyStop(input) {
  return getSafetyStopReason(input) !== null;
}
