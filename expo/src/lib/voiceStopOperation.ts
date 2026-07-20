interface MutableRef<T> {
  current: T;
}

export interface VoiceStopOperationRefs {
  focusGenerationRef: MutableRef<number>;
  operationGenerationRef: MutableRef<number>;
  operationInFlightRef: MutableRef<boolean>;
}

export interface VoiceStopOperationToken {
  focusGeneration: number;
  operationGeneration: number;
}

export function transitionVoiceStopOperationFocus(refs: VoiceStopOperationRefs) {
  refs.focusGenerationRef.current += 1;
  refs.operationGenerationRef.current += 1;
  refs.operationInFlightRef.current = false;
}

export function beginVoiceStopOperation(
  refs: VoiceStopOperationRefs,
): VoiceStopOperationToken | null {
  if (refs.operationInFlightRef.current) {
    return null;
  }

  refs.operationGenerationRef.current += 1;
  refs.operationInFlightRef.current = true;
  return {
    focusGeneration: refs.focusGenerationRef.current,
    operationGeneration: refs.operationGenerationRef.current,
  };
}

export function isVoiceStopOperationCurrent(input: {
  focused: boolean;
  refs: VoiceStopOperationRefs;
  token: VoiceStopOperationToken;
}) {
  return input.focused
    && input.refs.focusGenerationRef.current === input.token.focusGeneration
    && input.refs.operationGenerationRef.current === input.token.operationGeneration;
}

export function finishVoiceStopOperation(input: {
  refs: VoiceStopOperationRefs;
  token: VoiceStopOperationToken;
}) {
  if (
    input.refs.focusGenerationRef.current === input.token.focusGeneration
    && input.refs.operationGenerationRef.current === input.token.operationGeneration
  ) {
    input.refs.operationInFlightRef.current = false;
  }
}

export type VoiceGuidanceResumeDecision =
  | "already-active"
  | "recovery-hold"
  | "resume"
  | "stop-in-flight";

export function decideVoiceGuidanceResume(input: {
  guiding: boolean;
  recoveryHold: boolean;
  stopOperationInFlight: boolean;
}): VoiceGuidanceResumeDecision {
  if (input.stopOperationInFlight) {
    return "stop-in-flight";
  }
  if (input.guiding) {
    return "already-active";
  }
  if (input.recoveryHold) {
    return "recovery-hold";
  }
  return "resume";
}
