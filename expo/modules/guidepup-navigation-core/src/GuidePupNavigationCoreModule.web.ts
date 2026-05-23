import type {
  GuidePupNavigationCoreCaptureOptions,
  GuidePupNavigationCoreCaptureResult,
  GuidePupNavigationCoreAudioCueType,
  GuidePupNavigationCoreHapticType,
  GuidePupNavigationCoreStartOptions,
  GuidePupNavigationCoreState,
} from "./GuidePupNavigationCore.types";

const unavailableState: GuidePupNavigationCoreState = {
  available: false,
  lastError: "GuidePupNavigationCore is unavailable on web.",
  permissionStatus: "unsupported",
  sessionActive: false,
  sessionState: "idle",
  voiceOverRunning: false,
};

export default {
  announce() {
    return Promise.resolve();
  },
  captureFrame(_options?: GuidePupNavigationCoreCaptureOptions): Promise<GuidePupNavigationCoreCaptureResult> {
    return Promise.reject(new Error("GuidePupNavigationCore capture is unavailable on web."));
  },
  getState() {
    return Promise.resolve(unavailableState);
  },
  isAvailable() {
    return Promise.resolve(false);
  },
  playAudioCue(_type: GuidePupNavigationCoreAudioCueType) {
    return Promise.resolve();
  },
  playHaptic(_type: GuidePupNavigationCoreHapticType) {
    return Promise.resolve();
  },
  startSession(_options?: GuidePupNavigationCoreStartOptions) {
    return Promise.resolve(unavailableState);
  },
  stopSession() {
    return Promise.resolve(unavailableState);
  },
};
