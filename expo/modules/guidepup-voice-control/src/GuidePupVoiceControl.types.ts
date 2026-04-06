export type GuidePupVoicePermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "restricted"
  | "unsupported";

export interface GuidePupVoiceControlPermissions {
  microphone: GuidePupVoicePermissionStatus;
  speech: GuidePupVoicePermissionStatus;
}

export interface GuidePupVoiceControlCommandSessionOptions {
  locale?: string;
  partialResults?: boolean;
}

export interface GuidePupVoiceControlSpeakOptions {
  interrupt?: boolean;
  locale?: string;
  rate?: number;
}

export interface GuidePupVoiceControlState {
  available: boolean;
  lastError?: string | null;
  listening: boolean;
  microphonePermission: GuidePupVoicePermissionStatus;
  speaking: boolean;
  speechPermission: GuidePupVoicePermissionStatus;
}

export interface GuidePupVoiceRecognitionEvent {
  isFinal: boolean;
  timestampMs: number;
  transcript: string;
}

export type GuidePupVoiceControlEvents = {
  onCommandRecognized(event: GuidePupVoiceRecognitionEvent): void;
  onStateChanged(event: GuidePupVoiceControlState): void;
};
