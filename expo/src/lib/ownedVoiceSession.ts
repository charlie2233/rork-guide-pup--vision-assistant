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
