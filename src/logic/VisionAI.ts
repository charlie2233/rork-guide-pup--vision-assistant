import { generateObject } from "@rork-ai/toolkit-sdk";
import { z } from "zod";

const ObstacleSchema = z.object({
  type: z.string().describe("Type of obstacle detected (person, vehicle, wall, furniture, etc.)"),
  position: z.enum(["left", "center", "right"]).describe("Position in the frame"),
  distance: z.enum(["very-close", "close", "medium", "far"]).describe("Estimated distance"),
  confidence: z.number().min(0).max(1).describe("Detection confidence 0-1"),
});

const VisionAnalysisSchema = z.object({
  obstacles: z.array(ObstacleSchema).describe("List of detected obstacles"),
  pathClear: z.boolean().describe("Whether the forward path appears clear"),
  recommendedDirection: z.enum(["forward", "turn-left", "turn-right", "stop"]).describe("Recommended movement direction"),
  hazardLevel: z.enum(["none", "low", "medium", "high"]).describe("Overall hazard level"),
  sceneDescription: z.string().describe("Brief description of the scene for accessibility"),
  lighting: z.enum(["dark", "dim", "normal", "bright"]).describe("Lighting conditions"),
  surfaceType: z.string().optional().describe("Type of walking surface if visible (sidewalk, grass, stairs, etc.)"),
});

export type VisionAnalysis = z.infer<typeof VisionAnalysisSchema>;
export type Obstacle = z.infer<typeof ObstacleSchema>;

export interface VisionAIResult {
  success: boolean;
  analysis: VisionAnalysis | null;
  error?: string;
  timestamp: number;
}

const SYSTEM_PROMPT = `You are a vision AI assistant helping visually impaired users navigate safely. 
Analyze the camera frame and identify:
1. Any obstacles in the path (people, vehicles, objects, walls, furniture)
2. Whether the forward path is clear for walking
3. The recommended direction to move
4. Overall hazard level
5. A brief scene description for context

Be conservative - when in doubt, recommend stopping or caution.
Prioritize safety over speed. Detect edges, stairs, curbs, and drop-offs.`;

export async function analyzeFrame(base64Image: string): Promise<VisionAIResult> {
  const timestamp = Date.now();
  
  try {
    console.log("[VisionAI] Starting frame analysis...");
    
    const analysis = await generateObject({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            { type: "image", image: base64Image },
            { type: "text", text: "Analyze this camera frame for navigation assistance. Identify obstacles, path clearance, and provide guidance." },
          ],
        },
      ],
      schema: VisionAnalysisSchema,
    });

    console.log("[VisionAI] Analysis complete:", JSON.stringify(analysis, null, 2));

    return {
      success: true,
      analysis,
      timestamp,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[VisionAI] Analysis failed:", errorMessage);
    
    return {
      success: false,
      analysis: null,
      error: errorMessage,
      timestamp,
    };
  }
}

export function convertAnalysisToGuideFormat(analysis: VisionAnalysis) {
  const obstacleRisks = {
    forward: 0,
    left: 0,
    right: 0,
  };

  const distanceToRisk: Record<string, number> = {
    "very-close": 0.95,
    "close": 0.7,
    "medium": 0.4,
    "far": 0.15,
  };

  analysis.obstacles.forEach((obstacle) => {
    const risk = distanceToRisk[obstacle.distance] * obstacle.confidence;
    
    if (obstacle.position === "center") {
      obstacleRisks.forward = Math.max(obstacleRisks.forward, risk);
    } else if (obstacle.position === "left") {
      obstacleRisks.left = Math.max(obstacleRisks.left, risk);
    } else {
      obstacleRisks.right = Math.max(obstacleRisks.right, risk);
    }
  });

  const hazardToOverall: Record<string, number> = {
    "none": 0.1,
    "low": 0.35,
    "medium": 0.6,
    "high": 0.9,
  };

  return {
    obstacles: analysis.obstacles.map((o) => ({
      type: o.type,
      x: o.position === "left" ? -0.5 : o.position === "right" ? 0.5 : 0,
      distance: o.distance === "very-close" ? 0.5 : o.distance === "close" ? 1.2 : o.distance === "medium" ? 2.5 : 4,
      confidence: o.confidence,
    })),
    spatial: obstacleRisks,
    overall: hazardToOverall[analysis.hazardLevel],
    pathClear: analysis.pathClear,
    recommendedDirection: analysis.recommendedDirection,
    sceneDescription: analysis.sceneDescription,
    lighting: analysis.lighting,
    surfaceType: analysis.surfaceType,
  };
}

export const VisionAI = {
  analyzeFrame,
  convertAnalysisToGuideFormat,
};
