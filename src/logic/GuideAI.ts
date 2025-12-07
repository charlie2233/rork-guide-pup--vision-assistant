// Lightweight, deterministic navigation heuristics for the guide experience.
// Public interface remains unchanged; all enhancements are internal.
export interface GuideAIDirection {
  direction: "turn-left" | "turn-right" | "forward" | "stop";
  obstacle: boolean;
  message: string;
}

type Direction = GuideAIDirection["direction"];

// Tunable parameters (kept local to this module)
const SAFE_DISTANCE_M = 2.0;
const MIN_CONFIDENCE_TO_MOVE = 0.35;
const SWITCH_MARGIN = 0.15;
const OBSTACLE_STOP_THRESHOLD = 0.75;
const VECTOR_WEIGHT = 0.55; // How much to trust directional vectors vs. clearance heuristics

let lastDirection: Direction = "stop";
let lastConfidence = 0;

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && !Number.isNaN(value);

const normalizePosition = (value: unknown): number => {
  if (!isNumber(value)) return 0;
  // Accept either [-1, 1] or [0, 1] coordinate systems
  if (value >= 0 && value <= 1) return clamp((value - 0.5) * 2, -1, 1);
  return clamp(value, -1, 1);
};

const proximityFromDistance = (distance?: number) => {
  if (!isNumber(distance)) return 0;
  return clamp(1 - distance / SAFE_DISTANCE_M);
};

const bearingToVector = (bearing: number) => {
  const radians = (bearing * Math.PI) / 180;
  return { x: Math.sin(radians), y: Math.cos(radians) };
};

const pickBearing = (gps: any): number | null => {
  const candidates = [
    gps?.bearing,
    gps?.heading,
    gps?.course,
    gps?.targetBearing
  ];
  for (const value of candidates) {
    if (isNumber(value)) return value;
  }
  return null;
};

const extractCandidates = (frame: any) => {
  const candidates: any[] = [];
  const buckets = [
    frame?.obstacles,
    frame?.objects,
    frame?.detections,
    frame?.boxes,
    frame?.boundingBoxes
  ];
  buckets.forEach(bucket => {
    if (Array.isArray(bucket)) {
      bucket.forEach(item => candidates.push(item));
    }
  });
  return candidates;
};

const detectObstacles = (frame: any) => {
  let forwardRisk = 0;
  let leftRisk = 0;
  let rightRisk = 0;

  const proximity = isNumber(frame?.proximity) ? clamp(frame.proximity, 0, 1) : 0;
  const minDepth =
    frame?.depth &&
    (isNumber(frame.depth.min)
      ? frame.depth.min
      : isNumber(frame.depth.nearest)
      ? frame.depth.nearest
      : undefined);
  const depthRisk = proximityFromDistance(minDepth);
  forwardRisk = Math.max(forwardRisk, depthRisk, proximity);

  const candidates = extractCandidates(frame);
  candidates.forEach(item => {
    const position =
      item?.position ??
      item?.center ??
      item?.centre ??
      item?.centroid ??
      {};
    const posX = normalizePosition(
      item?.x ?? item?.cx ?? item?.px ?? position.x ?? position[0]
    );
    const distance =
      item?.distance ??
      item?.depth ??
      item?.range ??
      item?.d ??
      item?.z ??
      SAFE_DISTANCE_M * 2;
    const risk = proximityFromDistance(distance) || 0.3; // Default caution if distance is unknown
    if (posX < -0.2) {
      leftRisk = Math.max(leftRisk, risk);
    } else if (posX > 0.2) {
      rightRisk = Math.max(rightRisk, risk);
    } else {
      forwardRisk = Math.max(forwardRisk, risk);
    }
  });

  const overall = clamp(Math.max(forwardRisk, leftRisk, rightRisk, proximity));

  return {
    overall,
    spatial: {
      forward: clamp(forwardRisk, 0, 1),
      left: clamp(leftRisk, 0, 1),
      right: clamp(rightRisk, 0, 1)
    }
  };
};

const computeVectorIntent = (frame: any, gps: any) => {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  const pushVector = (vector: any) => {
    if (!vector) return;
    const vx =
      (Array.isArray(vector) && isNumber(vector[0])) || isNumber(vector?.x)
        ? (Array.isArray(vector) ? vector[0] : vector.x)
        : undefined;
    const vy =
      (Array.isArray(vector) && isNumber(vector[1])) || isNumber(vector?.y)
        ? (Array.isArray(vector) ? vector[1] : vector.y)
        : undefined;
    if (!isNumber(vx) && !isNumber(vy)) return;
    sumX += vx ?? 0;
    sumY += vy ?? 0;
    count += 1;
  };

  const bearing = pickBearing(gps);
  if (isNumber(bearing)) {
    pushVector(bearingToVector(bearing));
  }

  const vectorFields = [
    frame?.headingVector,
    frame?.motionVector,
    frame?.path?.vector,
    frame?.vector,
    frame?.flow
  ];
  vectorFields.forEach(pushVector);

  if (Array.isArray(frame?.vectors)) {
    frame.vectors.forEach(pushVector);
  }
  if (Array.isArray(frame?.flowVectors)) {
    frame.flowVectors.forEach(pushVector);
  }

  if (count === 0) {
    // Unknown intent: bias slightly forward but stay cautious
    return { forward: 0.55, left: 0.25, right: 0.25, magnitude: 0 };
  }

  const avgX = sumX / count;
  const avgY = sumY / count;
  const magnitude = clamp(Math.hypot(avgX, avgY), 0, 1);

  // Map vector components to directional preferences
  const forward = clamp((avgY + 1) / 2, 0, 1);
  const right = clamp((avgX + 1) / 2, 0, 1);
  const left = clamp((1 - avgX) / 2, 0, 1);

  return { forward, left, right, magnitude };
};

const selectDirection = (cameraFrame: any, gps: any) => {
  const obstacleInfo = detectObstacles(cameraFrame);
  const intent = computeVectorIntent(cameraFrame, gps);

  const clearance = {
    forward: 1 - obstacleInfo.spatial.forward,
    left: 1 - obstacleInfo.spatial.left,
    right: 1 - obstacleInfo.spatial.right
  };

  // When intent is strong, lean more on vectors; otherwise trust clearance.
  const intentBias = VECTOR_WEIGHT * (0.5 + intent.magnitude / 2);
  const clearanceBias = 1 - intentBias;

  const scores: Record<Direction, number> = {
    forward:
      intent.forward * intentBias + clearance.forward * clearanceBias,
    "turn-left":
      intent.left * intentBias + clearance.left * clearanceBias,
    "turn-right":
      intent.right * intentBias + clearance.right * clearanceBias,
    stop: obstacleInfo.overall
  };

  let direction: Direction = "forward";
  let highestScore = scores.forward;

  (["turn-left", "turn-right"] as Direction[]).forEach(candidate => {
    if (scores[candidate] > highestScore) {
      highestScore = scores[candidate];
      direction = candidate;
    }
  });

  const obstacleDominant =
    obstacleInfo.overall >= OBSTACLE_STOP_THRESHOLD ||
    scores.stop >= highestScore;

  if (obstacleDominant || highestScore < MIN_CONFIDENCE_TO_MOVE) {
    direction = "stop";
  }

  const obstacle = obstacleInfo.overall > 0.35;
  const confidence = clamp(
    highestScore * (0.7 + intent.magnitude * 0.3) -
      obstacleInfo.overall * 0.35,
    0,
    1
  );

  return { direction, confidence, obstacle, obstacleInfo };
};

const smoothDirection = (
  proposedDirection: Direction,
  confidence: number,
  obstacle: boolean
) => {
  let direction = proposedDirection;
  let smoothedConfidence = confidence;

  const shouldHold =
    direction !== lastDirection &&
    !obstacle &&
    smoothedConfidence + SWITCH_MARGIN < lastConfidence;

  if (shouldHold) {
    direction = lastDirection;
    smoothedConfidence = clamp(
      (lastConfidence * 0.7 + smoothedConfidence * 0.3) || smoothedConfidence,
      0,
      1
    );
  }

  const retainedConfidence =
    direction === lastDirection
      ? clamp((lastConfidence + smoothedConfidence * 2) / 3, 0, 1)
      : smoothedConfidence;

  smoothedConfidence = retainedConfidence;

  if (smoothedConfidence < MIN_CONFIDENCE_TO_MOVE) {
    direction = "stop";
  }

  lastDirection = direction;
  lastConfidence = smoothedConfidence;

  return { direction, confidence: smoothedConfidence };
};

const buildMessage = (
  direction: Direction,
  obstacle: boolean,
  dataMissing: boolean
) => {
  if (dataMissing) {
    return "Stopping: waiting for better sensor data.";
  }
  if (direction === "stop" && obstacle) {
    return "Stop. Possible obstacle ahead.";
  }
  if (direction === "stop") {
    return "Pausing to reassess the path.";
  }
  if (direction === "turn-left") {
    return obstacle
      ? "Turn left to avoid the obstacle."
      : "Turn left toward the path.";
  }
  if (direction === "turn-right") {
    return obstacle
      ? "Turn right to avoid the obstacle."
      : "Turn right toward the path.";
  }
  return obstacle
    ? "Move forward cautiously; minor obstacle detected."
    : "Continue forward.";
};

export const GuideAI = {
  startCameraStream() {
    return "mock-stream";
  },
  startGPSTracking() {
    return { lat: 0, lng: 0 };
  },
  async getNextDirection(
    cameraFrame: any,
    gps: any
  ): Promise<GuideAIDirection | null> {
    const missingCamera = cameraFrame == null;
    const missingGps = gps == null;

    if (missingCamera && missingGps) {
      lastDirection = "stop";
      lastConfidence = 0;
      return {
        direction: "stop",
        obstacle: true,
        message: buildMessage("stop", true, true)
      };
    }

    // Fallback: if camera is missing, do not move without vision.
    if (missingCamera) {
      lastDirection = "stop";
      lastConfidence = 0;
      return {
        direction: "stop",
        obstacle: true,
        message: buildMessage("stop", true, true)
      };
    }

    const decision = selectDirection(cameraFrame, gps);
    const smoothed = smoothDirection(
      decision.direction,
      decision.confidence,
      decision.obstacle
    );

    return {
      direction: smoothed.direction,
      obstacle: decision.obstacle,
      message: buildMessage(smoothed.direction, decision.obstacle, false)
    };
  }
};
