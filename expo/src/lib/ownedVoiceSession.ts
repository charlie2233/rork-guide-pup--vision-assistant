export async function startOwnedVoiceSession<T>(input: {
  isCurrent: () => boolean;
  ownerToken: string;
  start: (ownerToken: string) => Promise<T>;
  stop: (ownerToken: string) => Promise<unknown>;
}) {
  let state: T;
  try {
    state = await input.start(input.ownerToken);
  } catch (error) {
    if (!input.isCurrent()) {
      await input.stop(input.ownerToken);
    }
    throw error;
  }
  if (!input.isCurrent()) {
    await input.stop(input.ownerToken);
    return null;
  }
  return state;
}

export async function stopOwnedVoiceSession<T>(input: {
  ownerRef: { current: string | null };
  stop: (ownerToken: string) => Promise<T>;
}) {
  const ownerToken = input.ownerRef.current;
  if (!ownerToken) {
    return null;
  }

  input.ownerRef.current = null;
  return input.stop(ownerToken);
}

export interface VoiceRecognitionRearmState {
  generation: number;
  inFlight: boolean;
  needed: boolean;
}

export function createVoiceRecognitionRearmState(): VoiceRecognitionRearmState {
  return {
    generation: 0,
    inFlight: false,
    needed: false,
  };
}

export function markVoiceRecognitionRearmNeeded(input: {
  current: VoiceRecognitionRearmState;
}) {
  input.current.needed = true;
}

export function cancelVoiceRecognitionRearm(input: {
  current: VoiceRecognitionRearmState;
}) {
  input.current = {
    generation: input.current.generation + 1,
    inFlight: false,
    needed: false,
  };
}

export function beginVoiceRecognitionRearm(input: {
  current: VoiceRecognitionRearmState;
}) {
  if (!input.current.needed || input.current.inFlight) {
    return null;
  }

  const generation = input.current.generation + 1;
  input.current = {
    generation,
    inFlight: true,
    needed: false,
  };
  return generation;
}

export function finishVoiceRecognitionRearm(
  input: { current: VoiceRecognitionRearmState },
  generation: number,
  started: boolean,
) {
  if (
    input.current.generation !== generation
    || !input.current.inFlight
  ) {
    return false;
  }

  input.current = {
    generation,
    inFlight: false,
    needed: !started,
  };
  return true;
}

export async function drainVoiceRecognitionRearm(input: {
  isListeningReady: () => boolean;
  promiseRef: { current: Promise<boolean> | null };
  start: () => Promise<boolean>;
  stateRef: { current: VoiceRecognitionRearmState };
}) {
  if (input.promiseRef.current) {
    return input.promiseRef.current;
  }

  if (!input.stateRef.current.needed && !input.stateRef.current.inFlight) {
    return input.isListeningReady();
  }

  const generation = beginVoiceRecognitionRearm(input.stateRef);
  if (generation === null) {
    return false;
  }

  const rearmPromise = input.start().then(
    (started) => (
      finishVoiceRecognitionRearm(input.stateRef, generation, started)
      && started
    ),
    () => {
      finishVoiceRecognitionRearm(input.stateRef, generation, false);
      return false;
    },
  );
  input.promiseRef.current = rearmPromise;
  try {
    return await rearmPromise;
  } finally {
    if (input.promiseRef.current === rearmPromise) {
      input.promiseRef.current = null;
    }
  }
}

export async function releaseOwnedAnnouncementOwner<T>(input: {
  ownerRef: { current: string | null };
  release: (ownerToken: string) => Promise<T>;
}) {
  const ownerToken = input.ownerRef.current;
  if (!ownerToken) {
    return null;
  }

  input.ownerRef.current = null;
  return input.release(ownerToken);
}

export function invalidateOwnedVoiceSessionAttempts(input: {
  current: number;
}) {
  input.current += 1;
}

type VoiceRouteSubscription = {
  remove(): void;
};

export function subscribeToStableVoiceRoute<RecognitionEvent, StateEvent>(input: {
  addRecognitionListener: (
    listener: (event: RecognitionEvent) => void,
  ) => VoiceRouteSubscription;
  addStateListener: (
    listener: (event: StateEvent) => void,
  ) => VoiceRouteSubscription;
  recognitionHandlerRef: {
    current: (event: RecognitionEvent) => void;
  };
  stateHandlerRef: {
    current: (event: StateEvent) => void;
  };
}) {
  const recognitionSubscription = input.addRecognitionListener((event) => {
    input.recognitionHandlerRef.current(event);
  });
  const stateSubscription = input.addStateListener((event) => {
    input.stateHandlerRef.current(event);
  });

  return () => {
    recognitionSubscription.remove();
    stateSubscription.remove();
  };
}
