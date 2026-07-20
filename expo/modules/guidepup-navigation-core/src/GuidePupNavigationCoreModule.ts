import { NativeModule, requireNativeModule } from "expo";

import type {
  GuidePupNavigationCoreCaptureOptions,
  GuidePupNavigationCoreCaptureResult,
  GuidePupNavigationCoreAudioCueType,
  GuidePupNavigationCoreHapticType,
  GuidePupNavigationCoreEvents,
  GuidePupNavigationCoreStartOptions,
  GuidePupNavigationCoreState,
} from "./GuidePupNavigationCore.types";

declare class GuidePupNavigationCoreModule extends NativeModule<GuidePupNavigationCoreEvents> {
  announce(message: string, ownerToken: string): Promise<void>;
  cancelAnnouncement(ownerToken: string): Promise<void>;
  claimAnnouncementOwner(ownerToken: string): Promise<void>;
  captureFrame(options?: GuidePupNavigationCoreCaptureOptions): Promise<GuidePupNavigationCoreCaptureResult>;
  getState(): Promise<GuidePupNavigationCoreState>;
  interruptAllAnnouncements(): Promise<void>;
  isAvailable(): Promise<boolean>;
  playAudioCue(type: GuidePupNavigationCoreAudioCueType): Promise<void>;
  playHaptic(type: GuidePupNavigationCoreHapticType): Promise<void>;
  releaseAnnouncementOwner(ownerToken: string): Promise<void>;
  startSession(options?: GuidePupNavigationCoreStartOptions): Promise<GuidePupNavigationCoreState>;
  stopSession(): Promise<GuidePupNavigationCoreState>;
  supersedeAnnouncement(message: string, ownerToken: string): Promise<void>;
}

export default requireNativeModule<GuidePupNavigationCoreModule>("GuidePupNavigationCore");
