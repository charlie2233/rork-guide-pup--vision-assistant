export type GuidePupConversationLaneMode = "experimental";

export interface GuidePupConversationLaneState {
  enabled: boolean;
  mode: GuidePupConversationLaneMode;
  supportedPrompts: string[];
}

const conversationLaneState: GuidePupConversationLaneState = {
  enabled: false,
  mode: "experimental",
  supportedPrompts: ["what do you see"],
};

export function getConversationLaneState() {
  return conversationLaneState;
}

export function isConversationPrompt(transcript: string) {
  const normalized = transcript.toLowerCase().trim();
  return normalized.includes("what do you see");
}
