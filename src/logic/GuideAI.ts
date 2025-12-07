
// Placeholder for Charlie's AI code
export interface GuideAIDirection {
  direction: "turn-left" | "turn-right" | "forward" | "stop";
  obstacle: boolean;
  message: string;
}

export const GuideAI = {
  startCameraStream() {
    return "mock-stream";
  },
  startGPSTracking() {
    return { lat: 0, lng: 0 };
  },
  async getNextDirection(cameraFrame: any, gps: any): Promise<GuideAIDirection | null> {
    // TODO: Charlie implements AI navigation logic here
    /*
      return {
        direction: "turn-left" | "turn-right" | "forward" | "stop",
        obstacle: boolean,
        message: "Spoken instruction"
      }
    */
    
    // Simulating AI delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Mock random response for demo purposes
    const random = Math.random();
    if (random > 0.9) {
      return {
        direction: "stop",
        obstacle: true,
        message: "Stop. Obstacle ahead."
      };
    } else if (random > 0.7) {
      return {
        direction: "turn-left",
        obstacle: false,
        message: "Turn left."
      };
    } else if (random > 0.5) {
      return {
        direction: "turn-right",
        obstacle: false,
        message: "Turn right."
      };
    } else {
      return {
        direction: "forward",
        obstacle: false,
        message: "Continue forward."
      };
    }
  }
};
