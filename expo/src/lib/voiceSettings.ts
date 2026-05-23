import type {
  DescriptionMode,
  Settings,
  SpeechRate,
} from "@/src/providers/SettingsProvider";

export function describeSpeechRate(rate: SpeechRate) {
  switch (rate) {
    case "slow":
      return "slow";
    case "fast":
      return "fast";
    default:
      return "normal";
  }
}

export function slowerSpeechRate(current: SpeechRate): SpeechRate {
  if (current === "fast") {
    return "normal";
  }
  return "slow";
}

export function fasterSpeechRate(current: SpeechRate): SpeechRate {
  if (current === "slow") {
    return "normal";
  }
  return "fast";
}

export function describeDetailLevel(mode: DescriptionMode) {
  return mode === "detailed" ? "detailed" : "short";
}

export function moreDetailedMode(_current: DescriptionMode): DescriptionMode {
  return "detailed";
}

export function lessDetailedMode(_current: DescriptionMode): DescriptionMode {
  return "short";
}

export function describeHaptics(enabled: boolean) {
  return enabled ? "on" : "off";
}

export function buildVoiceStatusSummary(input: {
  cameraReady?: boolean;
  conversationLaneEnabled?: boolean;
  isGuiding: boolean;
  settings: Settings;
  voiceControlAvailable?: boolean;
}) {
  const lines = [
    `Guidance is ${input.isGuiding ? "active" : "paused"}.`,
    `Speech rate is ${describeSpeechRate(input.settings.speechRate)}.`,
    `Detail level is ${describeDetailLevel(input.settings.descriptionMode)}.`,
    `Haptics are ${describeHaptics(input.settings.hapticsEnabled)}.`,
  ];

  if (typeof input.cameraReady === "boolean") {
    lines.push(`Camera is ${input.cameraReady ? "ready" : "not ready"}.`);
  }

  if (typeof input.voiceControlAvailable === "boolean") {
    lines.push(`Voice input is ${input.voiceControlAvailable ? "native" : "using fallback controls"}.`);
  }

  if (typeof input.conversationLaneEnabled === "boolean") {
    lines.push(`Scene question is ${input.conversationLaneEnabled ? "available" : "unavailable here"}.`);
  }

  return lines.join(" ");
}
