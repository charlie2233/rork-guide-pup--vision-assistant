export type GuidePupVoiceCommandIntent =
  | "start-guidance"
  | "stop-guidance"
  | "repeat"
  | "help"
  | "slower-speech"
  | "faster-speech"
  | "more-detail"
  | "less-detail"
  | "haptics-on"
  | "haptics-off"
  | "status";

export interface GuidePupHandledTranscript {
  normalizedTranscript: string;
  timestampMs: number;
}

const DUPLICATE_TRANSCRIPT_WINDOW_MS = 1500;

const WAKE_PREFIXES = [
  "guide pup",
  "hey guide pup",
  "hi guide pup",
  "ok guide pup",
  "okay guide pup",
];

const POLITE_PREFIXES = [
  "please",
  "can you",
  "could you",
  "would you",
];

const POLITE_SUFFIXES = [
  "please",
];

const NEGATION_MATCHER = /\b(don't|dont|do not|never|not|no)\b/;
const TTS_STOP_SELF_TRIGGER_MATCHER = /\b(stop|stops|stopped|stopping|pause|pauses|paused|pausing)\b/i;

const commandPhrases: Array<[GuidePupVoiceCommandIntent, Set<string>]> = [
  [
    "start-guidance",
    new Set([
      "begin guidance",
      "continue guidance",
      "resume guidance",
      "start guidance",
    ]),
  ],
  [
    "stop-guidance",
    new Set([
      "cancel guidance",
      "end guidance",
      "pause",
      "pause guidance",
      "pause now",
      "stop",
      "stop guidance",
      "stop now",
    ]),
  ],
  [
    "repeat",
    new Set([
      "again",
      "repeat",
      "repeat last",
      "repeat that",
      "say that again",
    ]),
  ],
  [
    "help",
    new Set([
      "help",
      "voice commands",
      "what are my commands",
      "what can i say",
    ]),
  ],
  [
    "slower-speech",
    new Set([
      "slow speech",
      "slow voice",
      "slower speech",
      "slower voice",
      "speak slower",
    ]),
  ],
  [
    "faster-speech",
    new Set([
      "fast speech",
      "faster speech",
      "faster voice",
      "speak faster",
      "speed up speech",
    ]),
  ],
  [
    "more-detail",
    new Set([
      "be more detailed",
      "describe more",
      "detailed guidance",
      "more detail",
      "more details",
    ]),
  ],
  [
    "less-detail",
    new Set([
      "brief guidance",
      "fewer details",
      "less detail",
      "less details",
      "shorter guidance",
    ]),
  ],
  [
    "haptics-on",
    new Set([
      "enable haptics",
      "haptics on",
      "turn on haptics",
    ]),
  ],
  [
    "haptics-off",
    new Set([
      "disable haptics",
      "haptics off",
      "turn off haptics",
    ]),
  ],
  [
    "status",
    new Set([
      "current settings",
      "current status",
      "how am i set up",
      "status",
      "what is my status",
      "what's my status",
    ]),
  ],
];

const stopBargeInCommands = new Set([
  "cancel guidance",
  "end guidance",
  "pause",
  "pause guidance",
  "pause now",
  "stop",
  "stop guidance",
  "stop now",
]);

function stripLeadingPhrase(value: string, phrases: string[]) {
  for (const phrase of phrases) {
    if (value === phrase) {
      return "";
    }
    if (value.startsWith(`${phrase} `)) {
      return value.slice(phrase.length + 1).trim();
    }
  }

  return value;
}

function stripTrailingPhrase(value: string, phrases: string[]) {
  for (const phrase of phrases) {
    if (value === phrase) {
      return "";
    }
    if (value.endsWith(` ${phrase}`)) {
      return value.slice(0, -phrase.length - 1).trim();
    }
  }

  return value;
}

function getCommandCandidate(transcript: string) {
  const normalized = normalizeVoiceTranscript(transcript);
  if (!normalized || NEGATION_MATCHER.test(normalized)) {
    return null;
  }

  let candidate = normalized;
  for (let index = 0; index < 2; index += 1) {
    candidate = stripLeadingPhrase(candidate, POLITE_PREFIXES);
    candidate = stripLeadingPhrase(candidate, WAKE_PREFIXES);
  }
  candidate = stripTrailingPhrase(candidate, POLITE_SUFFIXES);

  return candidate || null;
}

export function normalizeVoiceTranscript(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canKeepListeningForStopBargeInDuringSpeech(spokenText: string) {
  const normalized = normalizeVoiceTranscript(spokenText);
  return Boolean(normalized) && !TTS_STOP_SELF_TRIGGER_MATCHER.test(normalized);
}

export function parseVoiceCommand(transcript: string): GuidePupVoiceCommandIntent | null {
  const candidate = getCommandCandidate(transcript);
  if (!candidate) {
    return null;
  }

  for (const [intent, phrases] of commandPhrases) {
    if (phrases.has(candidate)) {
      return intent;
    }
  }

  return null;
}

export function isStopBargeInCommand(transcript: string) {
  const candidate = getCommandCandidate(transcript);
  return candidate ? stopBargeInCommands.has(candidate) : false;
}

export function isRecentDuplicateTranscript(
  normalizedTranscript: string,
  lastHandledTranscript: GuidePupHandledTranscript | null,
  nowMs = Date.now(),
) {
  return (
    lastHandledTranscript?.normalizedTranscript === normalizedTranscript &&
    nowMs - lastHandledTranscript.timestampMs < DUPLICATE_TRANSCRIPT_WINDOW_MS
  );
}

export function buildVoiceHelpPrompt(isGuiding: boolean, options: { conversationLaneEnabled: boolean }) {
  if (isGuiding) {
    const sceneQueryPrompt = options.conversationLaneEnabled ? ", or what do you see" : "";
    return [
      `You can say stop guidance, repeat, status, slower speech, faster speech, more detail, less detail, haptics on, haptics off${sceneQueryPrompt}.`,
      "Guide Pup only accepts this bounded command list for safety.",
    ].join(" ");
  }

  return [
    "You can say start guidance, status, slower speech, faster speech, more detail, less detail, haptics on, haptics off, or help.",
    "Guide Pup only accepts this bounded command list for safety.",
  ].join(" ");
}
