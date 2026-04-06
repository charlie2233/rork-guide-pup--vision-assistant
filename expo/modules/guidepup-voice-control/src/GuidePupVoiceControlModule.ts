import { NativeModule, requireNativeModule } from "expo";

import type {
  GuidePupVoiceControlCommandSessionOptions,
  GuidePupVoiceControlEvents,
  GuidePupVoiceControlPermissions,
  GuidePupVoiceControlSpeakOptions,
  GuidePupVoiceControlState,
} from "./GuidePupVoiceControl.types";

declare class GuidePupVoiceControlModule extends NativeModule<GuidePupVoiceControlEvents> {
  getState(): Promise<GuidePupVoiceControlState>;
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<GuidePupVoiceControlPermissions>;
  speak(
    text: string,
    locale?: string | null,
    interrupt?: boolean | null,
    rate?: number | null
  ): Promise<void>;
  startCommandSession(
    locale?: string | null,
    partialResults?: boolean | null
  ): Promise<GuidePupVoiceControlState>;
  stopCommandSession(): Promise<GuidePupVoiceControlState>;
  stopSpeaking(): Promise<void>;
}

export default requireNativeModule<GuidePupVoiceControlModule>("GuidePupVoiceControl");
