import { requireOptionalNativeModule } from "expo";
import * as Speech from "expo-speech";
import { AccessibilityInfo, Platform } from "react-native";

import type {
  GuidePupVoiceControlCommandSessionOptions,
  GuidePupVoiceControlEvents,
  GuidePupVoiceControlPermissions,
  GuidePupVoiceControlSpeakOptions,
  GuidePupVoiceControlState,
  GuidePupVoiceControlStopSessionOptions,
  GuidePupVoiceRecognitionEvent,
} from "@/modules/guidepup-voice-control";

interface GuidePupVoiceControlNativeModule {
  addListener<EventName extends keyof GuidePupVoiceControlEvents>(
    eventName: EventName,
    listener: GuidePupVoiceControlEvents[EventName],
  ): { remove(): void };
  getState(): Promise<GuidePupVoiceControlState>;
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<GuidePupVoiceControlPermissions>;
  speak(text: string, locale?: string | null, interrupt?: boolean | null, rate?: number | null): Promise<void>;
  startCommandSession(locale?: string | null, partialResults?: boolean | null, ownerToken?: string | null): Promise<GuidePupVoiceControlState>;
  stopCommandSession(ownerToken?: string | null): Promise<GuidePupVoiceControlState>;
  stopSpeaking(): Promise<void>;
}

const nativeModule =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<GuidePupVoiceControlNativeModule>("GuidePupVoiceControl")
    : null;

const fallbackState: GuidePupVoiceControlState = {
  available: false,
  lastError: null,
  listening: false,
  microphonePermission: Platform.OS === "web" ? "unsupported" : "undetermined",
  recoveryState: "idle",
  speaking: false,
  speechPermission: Platform.OS === "web" ? "unsupported" : "undetermined",
  voiceProcessingEnabled: false,
};

let voiceSessionOwnerSequence = 0;

export function createGuidePupVoiceSessionOwnerToken(scope: string) {
  voiceSessionOwnerSequence += 1;
  return `${scope}-${Date.now().toString(36)}-${voiceSessionOwnerSequence.toString(36)}`;
}

async function fallbackSpeak(text: string, options?: GuidePupVoiceControlSpeakOptions) {
  const trimmed = text.trim();
  if (!trimmed) {
    return;
  }

  if (Platform.OS === "ios") {
    const voiceOverRunning = await AccessibilityInfo.isScreenReaderEnabled().catch(() => false);
    if (voiceOverRunning) {
      await AccessibilityInfo.announceForAccessibility(trimmed);
      return;
    }
  }

  return new Promise<void>((resolve) => {
    Speech.stop();
    Speech.speak(trimmed, {
      language: options?.locale,
      onDone: () => resolve(),
      onError: () => resolve(),
      onStopped: () => resolve(),
      rate: options?.rate,
    });
  });
}

export type {
  GuidePupVoiceControlCommandSessionOptions,
  GuidePupVoiceControlPermissions,
  GuidePupVoiceControlSpeakOptions,
  GuidePupVoiceControlState,
  GuidePupVoiceControlStopSessionOptions,
  GuidePupVoiceRecognitionEvent,
};

export const GuidePupVoiceControl = {
  addRecognitionListener(listener: (event: GuidePupVoiceRecognitionEvent) => void) {
    if (!nativeModule) {
      return {
        remove() {},
      };
    }

    return nativeModule.addListener("onCommandRecognized", listener);
  },
  addStateListener(listener: (event: GuidePupVoiceControlState) => void) {
    if (!nativeModule) {
      return {
        remove() {},
      };
    }

    return nativeModule.addListener("onStateChanged", listener);
  },
  async getState() {
    if (nativeModule) {
      return nativeModule.getState();
    }

    return fallbackState;
  },
  implementation: nativeModule ? "native-voice" : "js-fallback",
  async isAvailable() {
    if (nativeModule) {
      return nativeModule.isAvailable();
    }

    return false;
  },
  isNativeModuleAvailable() {
    return Boolean(nativeModule);
  },
  async requestPermissions() {
    if (nativeModule) {
      return nativeModule.requestPermissions();
    }

    return {
      microphone: fallbackState.microphonePermission,
      speech: fallbackState.speechPermission,
    };
  },
  async speak(text: string, options?: GuidePupVoiceControlSpeakOptions) {
    if (nativeModule) {
      return nativeModule.speak(
        text,
        options?.locale ?? null,
        options?.interrupt ?? true,
        options?.rate ?? null,
      );
    }

    return fallbackSpeak(text, options);
  },
  async startCommandSession(options?: GuidePupVoiceControlCommandSessionOptions) {
    const ownerToken = options?.ownerToken ?? createGuidePupVoiceSessionOwnerToken("voice");
    if (nativeModule) {
      return nativeModule.startCommandSession(
        options?.locale ?? null,
        options?.partialResults ?? false,
        ownerToken,
      );
    }

    return fallbackState;
  },
  async stopCommandSession(options?: GuidePupVoiceControlStopSessionOptions) {
    if (nativeModule) {
      return nativeModule.stopCommandSession(options?.ownerToken ?? null);
    }

    return fallbackState;
  },
  async stopSpeaking() {
    if (nativeModule) {
      return nativeModule.stopSpeaking();
    }

    Speech.stop();
  },
};
