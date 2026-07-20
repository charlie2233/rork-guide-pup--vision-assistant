import type {
  GuidePupVoiceControlCommandSessionOptions,
  GuidePupVoiceControlPermissions,
  GuidePupVoiceControlSpeakOptions,
  GuidePupVoiceControlState,
} from "./GuidePupVoiceControl.types";

const unavailableState: GuidePupVoiceControlState = {
  available: false,
  lastError: "GuidePupVoiceControl is unavailable on this platform.",
  listening: false,
  microphonePermission: "unsupported",
  speaking: false,
  speechPermission: "unsupported",
  voiceProcessingEnabled: false,
};

export default {
  addListener() {
    return {
      remove() {},
    };
  },
  getState() {
    return Promise.resolve(unavailableState);
  },
  isAvailable() {
    return Promise.resolve(false);
  },
  requestPermissions(): Promise<GuidePupVoiceControlPermissions> {
    return Promise.resolve({
      microphone: "unsupported",
      speech: "unsupported",
    });
  },
  speak(_text: string, _options?: GuidePupVoiceControlSpeakOptions) {
    return Promise.resolve();
  },
  startCommandSession(_options?: GuidePupVoiceControlCommandSessionOptions) {
    return Promise.resolve(unavailableState);
  },
  stopCommandSession() {
    return Promise.resolve(unavailableState);
  },
  stopSpeaking() {
    return Promise.resolve();
  },
};
