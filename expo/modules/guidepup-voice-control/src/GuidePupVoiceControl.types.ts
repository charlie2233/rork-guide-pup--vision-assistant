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
  ownerToken?: string;
  partialResults?: boolean;
}

export interface GuidePupVoiceControlStopSessionOptions {
  ownerToken?: string;
}

export interface GuidePupVoiceControlSpeakOptions {
  interrupt?: boolean;
  locale?: string;
  rate?: number;
}

export type GuidePupVoiceControlRecoveryState =
  | "idle"
  | "recovering"
  | "interrupted"
  | "background"
  | "exhausted";

export interface GuidePupVoiceControlState {
  available: boolean;
  lastError?: string | null;
  listening: boolean;
  microphonePermission: GuidePupVoicePermissionStatus;
  recoveryState?: GuidePupVoiceControlRecoveryState;
  speaking: boolean;
  speechPermission: GuidePupVoicePermissionStatus;
  voiceProcessingEnabled: boolean;
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
