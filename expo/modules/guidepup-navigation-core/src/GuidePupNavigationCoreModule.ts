import { NativeModule, requireNativeModule } from "expo";

import type {
  GuidePupNavigationCoreCaptureOptions,
  GuidePupNavigationCoreCaptureResult,
  GuidePupNavigationCoreHapticType,
  GuidePupNavigationCoreStartOptions,
  GuidePupNavigationCoreState,
} from "./GuidePupNavigationCore.types";

declare class GuidePupNavigationCoreModule extends NativeModule {
  announce(message: string): Promise<void>;
  captureFrame(options?: GuidePupNavigationCoreCaptureOptions): Promise<GuidePupNavigationCoreCaptureResult>;
  getState(): Promise<GuidePupNavigationCoreState>;
  isAvailable(): Promise<boolean>;
  playHaptic(type: GuidePupNavigationCoreHapticType): Promise<void>;
  startSession(options?: GuidePupNavigationCoreStartOptions): Promise<GuidePupNavigationCoreState>;
  stopSession(): Promise<GuidePupNavigationCoreState>;
}

export default requireNativeModule<GuidePupNavigationCoreModule>("GuidePupNavigationCore");
