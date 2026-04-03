export type GuidePupNavigationCoreSessionState = "idle" | "running" | "paused" | "stopped";

export type GuidePupNavigationCoreHapticType =
  | "stop"
  | "left"
  | "right"
  | "forward"
  | "error"
  | "success";

export interface GuidePupNavigationCoreStartOptions {
  preferredCamera?: "back";
}

export interface GuidePupNavigationCoreCaptureOptions {
  compressionQuality?: number;
  maxDimension?: number;
}

export interface GuidePupNavigationCoreCaptureResult {
  base64?: string;
  captureLatencyMs?: number;
  height: number;
  timestampMs: number;
  uri?: string;
  width: number;
}

export interface GuidePupNavigationCoreState {
  available: boolean;
  lastCaptureLatencyMs?: number;
  lastError?: string | null;
  permissionStatus?: string;
  sessionActive: boolean;
  sessionState: GuidePupNavigationCoreSessionState;
  voiceOverRunning?: boolean;
}
