import type { VisionInteractionMode } from "./api";
import { canKeepListeningForStopBargeInDuringSpeech } from "./voiceCommands";

type VisionLaneDirection = "turn-left" | "turn-right" | "forward" | "stop";

export type VisionLaneResult = {
  direction: VisionLaneDirection;
  message: string;
  obstacle: boolean;
  sceneDescription?: string;
};

export type VisionLaneEffectPlan<TResult extends VisionLaneResult> = {
  announcement: string | null;
  audioCue: "stop" | null;
  directionUpdate: TResult | null;
  guidanceMessageUpdate: string | null;
  haptic: VisionLaneDirection | null;
  keepListeningDuringSpeech: boolean;
  repeatMessageUpdate: string | null;
  settingsUpdate: null;
  speech: string | null;
};

export function planVisionLaneResult<TResult extends VisionLaneResult>(input: {
  hapticsEnabled: boolean;
  isGuiding: boolean;
  isSpeaking: boolean;
  mode: VisionInteractionMode;
  result: TResult;
}): VisionLaneEffectPlan<TResult> {
  const { hapticsEnabled, isGuiding, isSpeaking, mode, result } = input;
  const isSceneQuery = mode === "scene-query";
  const isSafetyStop = result.obstacle || result.direction === "stop";
  const stopMessage = /^stop(?:[.!,:;\s]|$)/i.test(result.message.trim())
    ? result.message
    : `Stop. ${result.message}`;
  const spokenMessage = isSafetyStop
    ? stopMessage
    : isSceneQuery
    ? result.sceneDescription || result.message
    : result.message;
  const speech = spokenMessage && (isSceneQuery || isSafetyStop || !isSpeaking)
    ? spokenMessage
    : null;
  const keepListeningDuringSpeech = Boolean(
    speech
      && isGuiding
      && canKeepListeningForStopBargeInDuringSpeech(speech),
  );
  const haptic = result.obstacle || result.direction === "stop"
    ? "stop"
    : result.direction;

  return {
    announcement: null,
    audioCue: isSafetyStop ? "stop" : null,
    directionUpdate: isSceneQuery && !isSafetyStop ? null : result,
    guidanceMessageUpdate: (!isSceneQuery || isSafetyStop) && speech ? speech : null,
    haptic: (!isSceneQuery || isSafetyStop) && hapticsEnabled ? haptic : null,
    keepListeningDuringSpeech,
    repeatMessageUpdate: speech,
    settingsUpdate: null,
    speech,
  };
}
