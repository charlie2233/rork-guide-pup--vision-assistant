export const MIN_SAFE_CONFIDENCE: 0.65;

export type SafetyStopInput = {
  confidence?: number;
  direction?: "turn-left" | "turn-right" | "forward" | "stop";
  fallbackReason?: string | null;
  hasCloseObstacle?: boolean;
  hasPathBlockingObstacle?: boolean;
  hazardLevel?: "none" | "low" | "medium" | "high";
  lighting?: "dark" | "dim" | "normal" | "bright" | "unknown";
  obstacle?: boolean;
  pathClear?: boolean;
  safetyTags?: string[];
  walkability?: "clear" | "caution" | "uncertain";
};

export type SafetyStopReason =
  | "fallback"
  | "close-obstacle"
  | "path-blocking-obstacle"
  | "path-not-clear"
  | "high-hazard"
  | "medium-hazard"
  | "uncertain-walkability"
  | "low-visibility"
  | "critical-hazard"
  | "low-confidence"
  | "provider-stop"
  | "obstacle";

export function getSafetyStopReason(input: SafetyStopInput): SafetyStopReason | null;
export function requiresSafetyStop(input: SafetyStopInput): boolean;
