import { requireOptionalNativeModule } from "expo";
import * as Speech from "expo-speech";
import { AccessibilityInfo, Platform } from "react-native";

import type {
  GuidePupVoiceControlCommandSessionOptions,
  GuidePupVoiceControlEvents,
  GuidePupVoiceControlPermissions,
  GuidePupVoiceControlSpeakOptions,
  GuidePupVoiceControlState,
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
  startCommandSession(locale?: string | null, partialResults?: boolean | null): Promise<GuidePupVoiceControlState>;
  stopCommandSession(): Promise<GuidePupVoiceControlState>;
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
  speaking: false,
  speechPermission: Platform.OS === "web" ? "unsupported" : "undetermined",
};

function fallbackSpeak(text: string, options?: GuidePupVoiceControlSpeakOptions) {
  const trimmed = text.trim();
  if (!trimmed) {
    return Promise.resolve();
  }

  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibility(trimmed);
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
    if (nativeModule) {
      return nativeModule.startCommandSession(options?.locale ?? null, options?.partialResults ?? false);
    }

    return fallbackState;
  },
  async stopCommandSession() {
    if (nativeModule) {
      return nativeModule.stopCommandSession();
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
