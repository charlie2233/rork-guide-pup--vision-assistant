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

const commandMatchers: Array<[GuidePupVoiceCommandIntent, RegExp[]]> = [
  [
    "start-guidance",
    [
      /\b(start|begin|resume|continue)( the)? guidance\b/,
      /\b(start|begin|resume)\b/,
      /\blet'?s go\b/,
    ],
  ],
  [
    "stop-guidance",
    [
      /\b(stop|pause)( the)? guidance\b/,
      /\b(stop|pause)\b/,
    ],
  ],
  [
    "repeat",
    [
      /\b(repeat|again|say that again|repeat that|repeat last)\b/,
    ],
  ],
  [
    "help",
    [
      /\b(help|what can i say|what are my commands|voice commands)\b/,
    ],
  ],
  [
    "slower-speech",
    [
      /\b(slown?er speech|speak slower|slow down|slower)\b/,
    ],
  ],
  [
    "faster-speech",
    [
      /\b(fast(?:er)? speech|speak faster|speed up|faster)\b/,
    ],
  ],
  [
    "more-detail",
    [
      /\b(more detail|more details|describe more|be more detailed|detailed)\b/,
    ],
  ],
  [
    "less-detail",
    [
      /\b(less detail|fewer details|shorter|less detailed|short)\b/,
    ],
  ],
  [
    "haptics-on",
    [
      /\b(haptics on|turn on haptics|enable haptics)\b/,
    ],
  ],
  [
    "haptics-off",
    [
      /\b(haptics off|turn off haptics|disable haptics)\b/,
    ],
  ],
  [
    "status",
    [
      /\b(status|current status|current settings|how am i set up)\b/,
    ],
  ],
];

export function normalizeVoiceTranscript(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceCommand(transcript: string): GuidePupVoiceCommandIntent | null {
  const normalized = normalizeVoiceTranscript(transcript);
  if (!normalized) {
    return null;
  }

  for (const [intent, matchers] of commandMatchers) {
    if (matchers.some((matcher) => matcher.test(normalized))) {
      return intent;
    }
  }

  return null;
}

const stopBargeInCommands = new Set([
  "guide pup stop",
  "guide pup stop guidance",
  "pause",
  "pause guidance",
  "please pause",
  "please pause guidance",
  "please stop",
  "please stop guidance",
  "stop",
  "stop guidance",
]);

export function isStopBargeInCommand(transcript: string) {
  return stopBargeInCommands.has(normalizeVoiceTranscript(transcript));
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
