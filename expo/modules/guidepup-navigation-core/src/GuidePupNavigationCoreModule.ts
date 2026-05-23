import { NativeModule, requireNativeModule } from "expo";

import type {
  GuidePupNavigationCoreCaptureOptions,
  GuidePupNavigationCoreCaptureResult,
  GuidePupNavigationCoreAudioCueType,
  GuidePupNavigationCoreHapticType,
  GuidePupNavigationCoreStartOptions,
  GuidePupNavigationCoreState,
} from "./GuidePupNavigationCore.types";

declare class GuidePupNavigationCoreModule extends NativeModule {
  announce(message: string): Promise<void>;
  captureFrame(options?: GuidePupNavigationCoreCaptureOptions): Promise<GuidePupNavigationCoreCaptureResult>;
  getState(): Promise<GuidePupNavigationCoreState>;
  isAvailable(): Promise<boolean>;
  playAudioCue(type: GuidePupNavigationCoreAudioCueType): Promise<void>;
  playHaptic(type: GuidePupNavigationCoreHapticType): Promise<void>;
  startSession(options?: GuidePupNavigationCoreStartOptions): Promise<GuidePupNavigationCoreState>;
  stopSession(): Promise<GuidePupNavigationCoreState>;
}

export default requireNativeModule<GuidePupNavigationCoreModule>("GuidePupNavigationCore");
