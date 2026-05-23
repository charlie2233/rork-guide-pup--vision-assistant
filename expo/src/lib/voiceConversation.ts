export type GuidePupConversationLaneMode = "experimental";

export interface GuidePupConversationLaneState {
  enabled: boolean;
  mode: GuidePupConversationLaneMode;
  supportedPrompts: string[];
}

const WHAT_DO_YOU_SEE_PROMPT = "what do you see";
const WHAT_DO_YOU_SEE_ALIASES = [
  WHAT_DO_YOU_SEE_PROMPT,
  "what's around me",
  "whats around me",
  "what is around me",
  "describe the scene",
  "what is in front of me",
];

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

const conversationLaneState: GuidePupConversationLaneState = {
  enabled: true,
  mode: "experimental",
  supportedPrompts: [WHAT_DO_YOU_SEE_PROMPT],
};

export function getConversationLaneState() {
  return conversationLaneState;
}

export function canAnswerWhatDoYouSee() {
  return conversationLaneState.enabled && conversationLaneState.supportedPrompts.includes(WHAT_DO_YOU_SEE_PROMPT);
}

export type GuidePupConversationIntent = "what-do-you-see";

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

function normalizeConversationTranscript(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getConversationCandidate(transcript: string) {
  const normalized = normalizeConversationTranscript(transcript);
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

export function parseConversationPrompt(transcript: string): GuidePupConversationIntent | null {
  if (!canAnswerWhatDoYouSee()) {
    return null;
  }

  const candidate = getConversationCandidate(transcript);
  return candidate && WHAT_DO_YOU_SEE_ALIASES.includes(candidate) ? "what-do-you-see" : null;
}

export function isConversationPrompt(transcript: string) {
  return parseConversationPrompt(transcript) !== null;
}
