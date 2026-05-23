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

export function parseConversationPrompt(transcript: string): GuidePupConversationIntent | null {
  if (!canAnswerWhatDoYouSee()) {
    return null;
  }

  const normalized = transcript.toLowerCase().trim();
  return WHAT_DO_YOU_SEE_ALIASES.some((prompt) => normalized.includes(prompt)) ? "what-do-you-see" : null;
}

export function isConversationPrompt(transcript: string) {
  return parseConversationPrompt(transcript) !== null;
}
