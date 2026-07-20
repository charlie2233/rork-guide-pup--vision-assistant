import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useVoice } from "@/src/components/VoiceAnnouncer";
import Colors from "@/constants/colors";
import { GuideAI, GuideAIDirection } from "@/src/logic/GuideAI";
import { canAnswerWhatDoYouSee, parseConversationPrompt } from "@/src/lib/voiceConversation";
import {
  buildVoiceHelpPrompt,
  canKeepListeningForStopBargeInDuringSpeech,
  isRecentDuplicateTranscript,
  isStopBargeInCommand,
  normalizeVoiceTranscript,
  parseVoiceCommand,
  type GuidePupHandledTranscript,
} from "@/src/lib/voiceCommands";
import {
  buildVoiceStatusSummary,
  describeHaptics,
  describeSpeechRate,
  fasterSpeechRate,
  slowerSpeechRate,
} from "@/src/lib/voiceSettings";
import { captureAppError } from "@/src/lib/sentry";
import { planVisionLaneResult } from "@/src/lib/conversationLane";
import {
  invalidateOwnedVoiceSessionAttempts,
  releaseOwnedAnnouncementOwner,
  startOwnedVoiceSession,
  stopOwnedVoiceSession,
  subscribeToStableVoiceRoute,
} from "@/src/lib/ownedVoiceSession";
import {
  beginVoiceStopOperation,
  decideVoiceGuidanceResume,
  finishVoiceStopOperation,
  isVoiceStopOperationCurrent,
  transitionVoiceStopOperationFocus,
} from "@/src/lib/voiceStopOperation";
import {
  applyDeterministicVisionSafetyGuard,
  assertFreshFrameForUpload,
  evaluateStopRuntimeObservation,
  isAbortError,
  isStaleFrameError,
  resolveInitialNavigationCorePath,
  shouldOwnFallbackCamera,
  shouldForceJsFallbackValidation,
} from "@/src/lib/runtimeSafety";
import { useGuidePupRouter } from "@/src/lib/router";
import {
  classifyAnalyzeError,
  recordCameraPermissionSnapshot,
  recordNavigationLoopSnapshot,
  recordStopBargeInSnapshot,
  recordVoiceSnapshot,
  resetStopBargeInSnapshot,
} from "@/src/lib/diagnostics";
import {
  createGuidePupAnnouncementOwnerToken,
  GuidePupNavigationCore,
  type GuidePupNavigationCoreExecutionPath,
  type GuidePupNavigationCoreHapticType,
} from "@/src/native/GuidePupNavigationCore";
import {
  createGuidePupVoiceSessionOwnerToken,
  GuidePupVoiceControl,
  type GuidePupVoiceControlState,
  type GuidePupVoiceRecognitionEvent,
} from "@/src/native/GuidePupVoiceControl";
import { useSettings } from "@/src/providers/SettingsProvider";

const ANALYSIS_INTERVAL_MS = 4500;
const STOP_OBSERVATION_TIMEOUT_MS = 2_000;
const STOP_OBSERVATION_POLL_MS = 100;
const STOP_OBSERVATION_QUIET_WINDOW_MS = 400;

type VoiceOverState = "disabled" | "enabled" | "unknown";

type StatusTone = "neutral" | "warning" | "critical";

interface StatusBanner {
  detail: string;
  tone: StatusTone;
  title: string;
}

const initialStatus: StatusBanner = {
  detail: "Waiting for camera access.",
  tone: "neutral",
  title: "Guidance ready",
};

function getStatusColors(tone: StatusTone) {
  switch (tone) {
    case "warning":
      return {
        accent: "#FFB44C",
        background: "rgba(255,180,76,0.16)",
      };
    case "critical":
      return {
        accent: "#FF6B6B",
        background: "rgba(255,107,107,0.14)",
      };
    default:
      return {
        accent: Colors.palette.accent,
        background: "rgba(255,255,255,0.06)",
      };
  }
}

export default function NavigationScreen() {
  const router = useGuidePupRouter();
  const navigation = useNavigation();
  const { cameraPath } = useLocalSearchParams<{ cameraPath?: string | string[] }>();
  const forceJsFallbackValidation = shouldForceJsFallbackValidation(cameraPath);
  const { speak, stop: stopVoice, isSpeaking } = useVoice();
  const {
    settings,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  } = useSettings();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [direction, setDirection] = useState<GuideAIDirection | null>(null);
  const [guidanceStatus, setGuidanceStatus] = useState<StatusBanner>(initialStatus);
  const [isGuiding, setIsGuiding] = useState(true);
  const [runtimeSafetyHold, setRuntimeSafetyHold] = useState(false);
  const [isScreenFocused, setIsScreenFocused] = useState(false);
  const [navigationCorePath, setNavigationCorePath] = useState<GuidePupNavigationCoreExecutionPath>(
    () => resolveInitialNavigationCorePath({
      nativeAvailable: GuidePupNavigationCore.isNativeAvailable(),
      requestedCameraPath: cameraPath,
    }),
  );
  const [fallbackCameraError, setFallbackCameraError] = useState<string | null>(null);
  const [fallbackCameraReady, setFallbackCameraReady] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const activeAnalysisControllerRef = useRef<AbortController | null>(null);
  const analysisGenerationRef = useRef(0);
  const analyzingRef = useRef(false);
  const guidingRef = useRef(true);
  const hasAnnouncedCameraPermissionRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const hasAnnouncedStartRef = useRef(false);
  const lastHandledTranscriptRef = useRef<GuidePupHandledTranscript | null>(null);
  const lastGuidanceMessageRef = useRef("Guidance started. Analyzing your surroundings.");
  const lastSpokenMessageRef = useRef("Guidance started. Analyzing your surroundings.");
  const lastStopHandledAtRef = useRef(0);
  const guidanceSessionIdRef = useRef(`guidepup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const frameSequenceRef = useRef(0);
  const isScreenFocusedRef = useRef(false);
  const stopOperationInFlightRef = useRef(false);
  const stopOperationGenerationRef = useRef(0);
  const voiceRouteFocusGenerationRef = useRef(0);
  const fallbackCameraActiveRef = useRef(false);
  const runtimeSafetyHoldRef = useRef(false);
  const recoveryFreshFrameAfterMsRef = useRef(0);
  const cameraRecoveryGateActiveRef = useRef(false);
  const voiceRecoveryGateActiveRef = useRef(false);
  const lastVoiceRecoveryStateRef = useRef("idle");
  const lastCameraRecoveryStateRef = useRef("idle");
  const voiceRecoveryExhaustedHandledRef = useRef(false);
  const announcementOwnerTokenRef = useRef<string | null>(null);
  const voiceSessionAttemptGenerationRef = useRef(0);
  const voiceSessionOwnerTokenRef = useRef<string | null>(null);
  const voiceRecognitionHandlerRef = useRef<(event: GuidePupVoiceRecognitionEvent) => void>(() => undefined);
  const voiceStateHandlerRef = useRef<(event: GuidePupVoiceControlState) => void>(() => undefined);
  const voiceOverAnnouncementActiveRef = useRef(false);
  const voiceOverSpeechGenerationRef = useRef(0);
  const voiceOverResolutionRef = useRef<Promise<VoiceOverState> | null>(null);
  const voiceOverStateRef = useRef<VoiceOverState>("unknown");

  const resolveVoiceOverRunning = useCallback(() => {
    if (voiceOverStateRef.current !== "unknown") {
      return Promise.resolve(voiceOverStateRef.current);
    }
    if (!voiceOverResolutionRef.current) {
      voiceOverResolutionRef.current = AccessibilityInfo.isScreenReaderEnabled()
        .then((enabled) => {
          const nextState = enabled ? "enabled" : "disabled";
          voiceOverStateRef.current = nextState;
          return nextState;
        })
        .catch(() => {
          voiceOverStateRef.current = "enabled";
          voiceOverResolutionRef.current = null;
          return "enabled" as const;
        });
    }
    return voiceOverResolutionRef.current;
  }, []);

  const invalidateAndAbortAnalysis = useCallback((requireFreshFrame = true) => {
    analysisGenerationRef.current += 1;
    activeAnalysisControllerRef.current?.abort();
    if (requireFreshFrame) {
      recoveryFreshFrameAfterMsRef.current = Math.max(
        recoveryFreshFrameAfterMsRef.current,
        Date.now(),
      );
    }
  }, []);

  useEffect(() => {
    let isActive = true;
    void resolveVoiceOverRunning().then((state) => {
      if (isActive) {
        voiceOverStateRef.current = state;
      }
    });

    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
      voiceOverStateRef.current = enabled ? "enabled" : "disabled";
      voiceOverResolutionRef.current = Promise.resolve(enabled ? "enabled" : "disabled");
      voiceOverSpeechGenerationRef.current += 1;
      voiceOverAnnouncementActiveRef.current = false;
      stopVoice();
      void GuidePupVoiceControl.stopSpeaking();
      const announcementOwnerToken = announcementOwnerTokenRef.current;
      if (announcementOwnerToken) {
        void GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken);
      }
    });

    return () => {
      isActive = false;
      subscription.remove();
    };
  }, [resolveVoiceOverRunning, stopVoice]);

  const refreshNavigationCoreState = useCallback(
    async (partial?: {
      executionPath?: GuidePupNavigationCoreExecutionPath;
      lastCaptureLatencyMs?: number;
      lastError?: string | null;
      lastTotalGuidanceLoopLatencyMs?: number;
      recoveryState?: "idle" | "recovering" | "interrupted" | "background" | "exhausted";
      sessionActive?: boolean;
    }) => {
      const [runtimeAvailable, state] = await Promise.all([
        GuidePupNavigationCore.isAvailable().catch(() => false),
        GuidePupNavigationCore.getState().catch(() => null),
      ]);
      const moduleAvailable = GuidePupNavigationCore.isNativeAvailable();
      const executionPath: GuidePupNavigationCoreExecutionPath =
        forceJsFallbackValidation
          ? "js-fallback"
          : partial?.executionPath ?? (moduleAvailable && runtimeAvailable ? "native-core" : "js-fallback");
      setNavigationCorePath(executionPath);
      recordNavigationLoopSnapshot({
        available: moduleAvailable,
        executionPath,
        lastCaptureLatencyMs: partial?.lastCaptureLatencyMs ?? state?.lastCaptureLatencyMs,
        lastError: partial?.lastError !== undefined ? partial.lastError : state?.lastError ?? null,
        lastTotalGuidanceLoopLatencyMs: partial?.lastTotalGuidanceLoopLatencyMs,
        recoveryState: partial?.recoveryState ?? state?.recoveryState,
        sessionActive: partial?.sessionActive ?? state?.sessionActive ?? false,
        voiceOverRunning: state?.voiceOverRunning,
      });
    },
    [forceJsFallbackValidation],
  );

  const syncVoiceState = useCallback(async () => {
    const state = await GuidePupVoiceControl.getState().catch(() => null);
    if (!state) {
      return;
    }

    recordVoiceSnapshot({
      available: GuidePupVoiceControl.isNativeModuleAvailable(),
      executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
      lastError: state.lastError ?? undefined,
      listening: state.listening,
      microphonePermission: state.microphonePermission,
      recoveryState: state.recoveryState,
      speaking: state.speaking,
      speechPermission: state.speechPermission,
      voiceProcessingEnabled: state.voiceProcessingEnabled,
    });
  }, []);

  const startVoiceSession = useCallback(async () => {
    const attemptGeneration = voiceSessionAttemptGenerationRef.current + 1;
    voiceSessionAttemptGenerationRef.current = attemptGeneration;
    const ownerToken = createGuidePupVoiceSessionOwnerToken("navigation");
    const attemptIsCurrent = () =>
      isScreenFocusedRef.current
      && voiceSessionAttemptGenerationRef.current === attemptGeneration;
    if (!attemptIsCurrent()) {
      return;
    }

    if (!GuidePupVoiceControl.isNativeModuleAvailable()) {
      recordVoiceSnapshot({
        available: false,
        executionPath: "js-fallback",
        listening: false,
      });
      return;
    }

    try {
      const permissions = await GuidePupVoiceControl.requestPermissions();
      if (!attemptIsCurrent()) {
        return;
      }
      recordVoiceSnapshot({
        available: true,
        executionPath: "native-voice",
        listening: false,
        microphonePermission: permissions.microphone,
        speechPermission: permissions.speech,
      });

      if (permissions.microphone !== "granted" || permissions.speech !== "granted") {
        if (!attemptIsCurrent()) {
          return;
        }
        const permissionMessage = permissions.microphone !== "granted" && permissions.speech !== "granted"
          ? "Microphone and speech recognition permissions are required for hands-free commands. STOP remains available from the screen."
          : permissions.microphone !== "granted"
            ? "Microphone permission is required for hands-free commands. STOP remains available from the screen."
            : "Speech recognition permission is required for hands-free commands. STOP remains available from the screen.";
        lastSpokenMessageRef.current = permissionMessage;
        recordVoiceSnapshot({
          lastError: permissionMessage,
          listening: false,
        });
        const voiceOverState = await resolveVoiceOverRunning();
        if (!attemptIsCurrent()) {
          return;
        }
        const announcementOwnerToken = announcementOwnerTokenRef.current;
        if (!announcementOwnerToken) {
          return;
        }
        if (voiceOverState === "enabled") {
          stopVoice();
          await GuidePupVoiceControl.stopSpeaking().catch(() => undefined);
          await GuidePupNavigationCore.announce(permissionMessage, announcementOwnerToken).catch(() => undefined);
        } else {
          await GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken).catch(() => undefined);
          await GuidePupVoiceControl.speak(permissionMessage, {
            interrupt: true,
          }).catch(() => undefined);
        }
        return;
      }

      if (!attemptIsCurrent()) {
        return;
      }

      lastHandledTranscriptRef.current = null;
      voiceSessionOwnerTokenRef.current = ownerToken;
      const state = await startOwnedVoiceSession({
        isCurrent: attemptIsCurrent,
        ownerToken,
        start: (ownedToken) => GuidePupVoiceControl.startCommandSession({
          ownerToken: ownedToken,
          partialResults: true,
        }),
        stop: (ownedToken) => GuidePupVoiceControl.stopCommandSession({ ownerToken: ownedToken }),
      }).catch(() => null);

      if (!attemptIsCurrent()) {
        if (voiceSessionOwnerTokenRef.current === ownerToken) {
          voiceSessionOwnerTokenRef.current = null;
        }
        return;
      }

      if (state) {
        recordVoiceSnapshot({
          available: true,
          executionPath: "native-voice",
          lastError: state.lastError ?? undefined,
          listening: state.listening,
          microphonePermission: state.microphonePermission,
          recoveryState: state.recoveryState,
          speaking: state.speaking,
          speechPermission: state.speechPermission,
          voiceProcessingEnabled: state.voiceProcessingEnabled,
        });
      }
    } catch (error) {
      recordVoiceSnapshot({
        available: true,
        executionPath: "js-fallback",
        lastError: error instanceof Error ? error.message : "Unable to start voice control.",
        listening: false,
      });
    }
  }, [resolveVoiceOverRunning, stopVoice]);

  useFocusEffect(useCallback(() => {
    const announcementOwnerToken = createGuidePupAnnouncementOwnerToken("navigation-announcement");
    announcementOwnerTokenRef.current = announcementOwnerToken;
    void GuidePupNavigationCore.claimAnnouncementOwner(announcementOwnerToken);
    invalidateAndAbortAnalysis();
    transitionVoiceStopOperationFocus({
      focusGenerationRef: voiceRouteFocusGenerationRef,
      operationGenerationRef: stopOperationGenerationRef,
      operationInFlightRef: stopOperationInFlightRef,
    });
    voiceRecoveryExhaustedHandledRef.current = false;
    isScreenFocusedRef.current = true;
    setIsScreenFocused(true);
    void startVoiceSession();
    void syncVoiceState();

    return () => {
      invalidateAndAbortAnalysis();
      invalidateOwnedVoiceSessionAttempts(voiceSessionAttemptGenerationRef);
      voiceOverSpeechGenerationRef.current += 1;
      voiceOverAnnouncementActiveRef.current = false;
      fallbackCameraActiveRef.current = false;
      isScreenFocusedRef.current = false;
      transitionVoiceStopOperationFocus({
        focusGenerationRef: voiceRouteFocusGenerationRef,
        operationGenerationRef: stopOperationGenerationRef,
        operationInFlightRef: stopOperationInFlightRef,
      });
      isSpeakingRef.current = false;
      setIsScreenFocused(false);
      stopVoice();
      void releaseOwnedAnnouncementOwner({
        ownerRef: announcementOwnerTokenRef,
        release: (ownerToken) => GuidePupNavigationCore.releaseAnnouncementOwner(ownerToken),
      });
      void GuidePupNavigationCore.stopSession();
      void stopOwnedVoiceSession({
        ownerRef: voiceSessionOwnerTokenRef,
        stop: (ownerToken) => GuidePupVoiceControl.stopCommandSession({ ownerToken }),
      });
    };
  }, [invalidateAndAbortAnalysis, startVoiceSession, stopVoice, syncVoiceState]));

  const speakCommandResponse = useCallback((
    message: string,
    rateOverride?: number,
    options?: { keepListeningDuringSpeech?: boolean },
  ) => {
    if (!isScreenFocusedRef.current) {
      return;
    }
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    if (!announcementOwnerToken) {
      return;
    }

    const keepListeningDuringSpeech =
      (guidingRef.current || options?.keepListeningDuringSpeech === true)
      && canKeepListeningForStopBargeInDuringSpeech(message);
    lastSpokenMessageRef.current = message;

    const speechGeneration = voiceOverSpeechGenerationRef.current + 1;
    voiceOverSpeechGenerationRef.current = speechGeneration;
    void (async () => {
      const voiceOverState = await resolveVoiceOverRunning();
      if (
        !isScreenFocusedRef.current
        || announcementOwnerTokenRef.current !== announcementOwnerToken
        || voiceOverSpeechGenerationRef.current !== speechGeneration
      ) {
        return;
      }

      if (voiceOverState === "enabled") {
        stopVoice();
        await GuidePupVoiceControl.stopSpeaking().catch(() => undefined);
        const voiceState = await GuidePupVoiceControl.getState().catch(() => null);
        if (
          !isScreenFocusedRef.current
          || announcementOwnerTokenRef.current !== announcementOwnerToken
          || voiceOverSpeechGenerationRef.current !== speechGeneration
        ) {
          return;
        }

        voiceOverAnnouncementActiveRef.current = true;
        isSpeakingRef.current = true;
        recordVoiceSnapshot({
          listening: voiceState?.listening,
          speaking: true,
          speechListeningOverlapReason: keepListeningDuringSpeech ? "stop-barge-in" : undefined,
        });
        await GuidePupNavigationCore.announce(message, announcementOwnerToken).catch(() => undefined);

        if (
          announcementOwnerTokenRef.current !== announcementOwnerToken
          || voiceOverSpeechGenerationRef.current !== speechGeneration
        ) {
          return;
        }
        voiceOverAnnouncementActiveRef.current = false;
        isSpeakingRef.current = false;
        recordVoiceSnapshot({ speaking: false });
        return;
      }

      await GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken);
      if (
        !isScreenFocusedRef.current
        || announcementOwnerTokenRef.current !== announcementOwnerToken
        || voiceOverSpeechGenerationRef.current !== speechGeneration
      ) {
        return;
      }
      speak(message, {
        keepListeningDuringSpeech,
        rate: rateOverride ?? (
          settings.speechRate === "slow"
            ? 0.7
            : settings.speechRate === "fast"
              ? 1.2
            : 0.9
        ),
      });
    })();
  }, [resolveVoiceOverRunning, settings.speechRate, speak, stopVoice]);

  const pauseGuidanceForVoice = useCallback(() => {
    invalidateAndAbortAnalysis();
    fallbackCameraActiveRef.current = false;
    lastHandledTranscriptRef.current = null;
    guidingRef.current = false;
    hasAnnouncedStartRef.current = false;
    setIsGuiding(false);
    setDirection({
      confidence: 1,
      direction: "stop",
      fallbackReason: "user-stop",
      hazardLevel: "none",
      lighting: "unknown",
      message: "Guidance paused. Say start guidance to continue.",
      obstacle: false,
      walkability: "uncertain",
    });
    setGuidanceStatus({
      detail: "Guide Pup is paused. Say start guidance to continue.",
      tone: "warning",
      title: "Guidance paused",
    });
    void GuidePupNavigationCore.stopSession();
  }, [invalidateAndAbortAnalysis]);

  const enterVoiceRecoveryHold = useCallback((recoveryState: "background" | "exhausted" | "interrupted" | "recovering") => {
    const message = recoveryState === "exhausted"
      ? "Stop. Voice control could not recover. Guidance is paused."
      : recoveryState === "background"
        ? "Stop. Guide Pup is in the background. Guidance remains stopped."
        : recoveryState === "interrupted"
          ? "Stop. Audio was interrupted. Guidance remains stopped while voice control recovers."
          : "Stop. Voice control is recovering. Guidance remains stopped.";

    voiceRecoveryGateActiveRef.current = true;
    runtimeSafetyHoldRef.current = true;
    setRuntimeSafetyHold(true);
    fallbackCameraActiveRef.current = false;
    invalidateAndAbortAnalysis();
    const speechGeneration = voiceOverSpeechGenerationRef.current + 1;
    voiceOverSpeechGenerationRef.current = speechGeneration;
    voiceOverAnnouncementActiveRef.current = false;
    isSpeakingRef.current = false;
    stopVoice();
    void GuidePupVoiceControl.stopSpeaking();
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    if (announcementOwnerToken) {
      void GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken);
    }
    void GuidePupNavigationCore.stopSession();
    setDirection({
      confidence: 0,
      direction: "stop",
      fallbackReason: `voice-${recoveryState}`,
      hazardLevel: "high",
      lighting: "unknown",
      message,
      obstacle: true,
      walkability: "uncertain",
    });
    setGuidanceStatus({
      detail: message,
      tone: "critical",
      title: recoveryState === "exhausted" ? "Voice control unavailable" : "Voice recovery hold",
    });
    lastGuidanceMessageRef.current = message;
    lastSpokenMessageRef.current = message;
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("stop");
    }
    void GuidePupNavigationCore.playAudioCue("stop");
    void resolveVoiceOverRunning().then(async (voiceOverState) => {
      if (
        voiceOverState !== "enabled"
        || !announcementOwnerToken
        || announcementOwnerTokenRef.current !== announcementOwnerToken
        || voiceOverSpeechGenerationRef.current !== speechGeneration
        || !voiceRecoveryGateActiveRef.current
      ) {
        return;
      }
      voiceOverAnnouncementActiveRef.current = true;
      isSpeakingRef.current = true;
      await GuidePupNavigationCore.supersedeAnnouncement(message, announcementOwnerToken).catch(() => undefined);
      if (
        announcementOwnerTokenRef.current === announcementOwnerToken
        && voiceOverSpeechGenerationRef.current === speechGeneration
      ) {
        voiceOverAnnouncementActiveRef.current = false;
        isSpeakingRef.current = false;
      }
    });
  }, [invalidateAndAbortAnalysis, resolveVoiceOverRunning, settings.hapticsEnabled, stopVoice]);

  const clearVoiceRecoveryHold = useCallback(() => {
    if (!voiceRecoveryGateActiveRef.current) {
      return;
    }

    voiceRecoveryGateActiveRef.current = false;
    runtimeSafetyHoldRef.current = false;
    recoveryFreshFrameAfterMsRef.current = Math.max(
      recoveryFreshFrameAfterMsRef.current,
      Date.now(),
    );
    setRuntimeSafetyHold(false);
    setGuidanceStatus({
      detail: "Voice control recovered. Stay stopped while Guide Pup checks a fresh frame.",
      tone: "warning",
      title: "Checking a fresh frame",
    });
  }, []);

  const observeStoppedRuntime = useCallback(async () => {
    const deadlineMs = Date.now() + STOP_OBSERVATION_TIMEOUT_MS;
    let quietSinceMs: number | null = null;
    let staleSpeechObserved = false;
    let lastObservation = evaluateStopRuntimeObservation({
      analysisActive: true,
      fallbackCameraActive: true,
      nativeCameraActive: true,
      voiceListening: true,
      voiceSpeaking: true,
    });

    while (Date.now() <= deadlineMs) {
      const [cameraState, voiceState] = await Promise.all([
        GuidePupNavigationCore.getState().catch(() => null),
        GuidePupVoiceControl.getState().catch(() => null),
      ]);
      const nativeCameraStateUnknown = GuidePupNavigationCore.isNativeAvailable() && !cameraState;
      const nativeVoiceStateUnknown = GuidePupVoiceControl.isNativeModuleAvailable() && !voiceState;

      lastObservation = evaluateStopRuntimeObservation({
        analysisActive:
          analyzingRef.current
          || activeAnalysisControllerRef.current !== null,
        fallbackCameraActive: fallbackCameraActiveRef.current,
        nativeCameraActive: cameraState?.sessionActive ?? nativeCameraStateUnknown,
        voiceListening: voiceState?.listening ?? nativeVoiceStateUnknown,
        voiceSpeaking:
          (voiceState?.speaking ?? nativeVoiceStateUnknown)
          || isSpeakingRef.current
          || voiceOverAnnouncementActiveRef.current,
      });
      staleSpeechObserved ||= lastObservation.staleSpeechAfterStop;

      const nowMs = Date.now();
      if (lastObservation.quiescent) {
        quietSinceMs ??= nowMs;
        if (nowMs - quietSinceMs >= STOP_OBSERVATION_QUIET_WINDOW_MS) {
          return {
            ...lastObservation,
            analysisInactive: true,
            observedAt: nowMs,
            staleSpeechAfterStop: staleSpeechObserved,
          };
        }
      } else {
        quietSinceMs = null;
      }

      await new Promise<void>((resolve) => setTimeout(resolve, STOP_OBSERVATION_POLL_MS));
    }

    return {
      ...lastObservation,
      analysisInactive:
        !analyzingRef.current
        && activeAnalysisControllerRef.current === null,
      observedAt: Date.now(),
      staleSpeechAfterStop: staleSpeechObserved,
    };
  }, []);

  const stopRuntimeAndObserve = useCallback(async () => {
    invalidateAndAbortAnalysis();
    fallbackCameraActiveRef.current = false;
    invalidateOwnedVoiceSessionAttempts(voiceSessionAttemptGenerationRef);
    voiceOverSpeechGenerationRef.current += 1;
    voiceOverAnnouncementActiveRef.current = false;
    isSpeakingRef.current = false;
    stopVoice();
    voiceSessionOwnerTokenRef.current = null;
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    const voiceOverState = voiceOverStateRef.current;

    await Promise.allSettled([
      GuidePupVoiceControl.stopSpeaking(),
      GuidePupVoiceControl.stopCommandSession(),
      GuidePupNavigationCore.interruptAllAnnouncements(),
      GuidePupNavigationCore.stopSession(),
    ]);
    if (
      voiceOverState === "enabled"
      && announcementOwnerToken
      && announcementOwnerTokenRef.current === announcementOwnerToken
    ) {
      voiceOverAnnouncementActiveRef.current = true;
      isSpeakingRef.current = true;
      await GuidePupNavigationCore.supersedeAnnouncement("Stop.", announcementOwnerToken).catch(() => undefined);
    }
    voiceOverAnnouncementActiveRef.current = false;
    isSpeakingRef.current = false;

    return observeStoppedRuntime();
  }, [invalidateAndAbortAnalysis, observeStoppedRuntime, stopVoice]);

  const speakStopConfirmation = useCallback(async (message: string) => {
    const speechGeneration = voiceOverSpeechGenerationRef.current + 1;
    voiceOverSpeechGenerationRef.current = speechGeneration;
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    if (!announcementOwnerToken) {
      return;
    }
    const voiceOverState = await resolveVoiceOverRunning();
    if (
      !isScreenFocusedRef.current
      || announcementOwnerTokenRef.current !== announcementOwnerToken
      || voiceOverSpeechGenerationRef.current !== speechGeneration
    ) {
      return;
    }

    stopVoice();
    await GuidePupVoiceControl.stopSpeaking().catch(() => undefined);
    if (voiceOverState === "enabled") {
      voiceOverAnnouncementActiveRef.current = true;
      isSpeakingRef.current = true;
      await GuidePupNavigationCore.supersedeAnnouncement(message, announcementOwnerToken).catch(() => undefined);
      if (
        announcementOwnerTokenRef.current === announcementOwnerToken
        && voiceOverSpeechGenerationRef.current === speechGeneration
      ) {
        voiceOverAnnouncementActiveRef.current = false;
        isSpeakingRef.current = false;
      }
      return;
    }

    await GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken).catch(() => undefined);
    if (
      !isScreenFocusedRef.current
      || announcementOwnerTokenRef.current !== announcementOwnerToken
      || voiceOverSpeechGenerationRef.current !== speechGeneration
    ) {
      return;
    }
    isSpeakingRef.current = true;
    await GuidePupVoiceControl.speak(message, {
      interrupt: true,
      rate:
        settings.speechRate === "slow"
          ? 0.7
          : settings.speechRate === "fast"
            ? 1.2
            : 0.9,
    }).catch(() => undefined);
    if (voiceOverSpeechGenerationRef.current === speechGeneration) {
      isSpeakingRef.current = false;
    }
  }, [resolveVoiceOverRunning, settings.speechRate, stopVoice]);

  const handleVoiceStopCommand = useCallback(async (input: {
    hapticAttempted: boolean;
    nowMs: number;
    recognizedCommand: "stop-guidance-partial" | "stop-guidance";
    recognizedDuringSpeech: boolean;
    recognizedPhase: "partial" | "final";
  }) => {
    if (!guidingRef.current) {
      return;
    }
    const stopOperationRefs = {
      focusGenerationRef: voiceRouteFocusGenerationRef,
      operationGenerationRef: stopOperationGenerationRef,
      operationInFlightRef: stopOperationInFlightRef,
    };
    const stopOperation = beginVoiceStopOperation(stopOperationRefs);
    if (!stopOperation) {
      return;
    }
    const stopOperationIsCurrent = () => isVoiceStopOperationCurrent({
      focused: isScreenFocusedRef.current,
      refs: stopOperationRefs,
      token: stopOperation,
    });
    lastStopHandledAtRef.current = input.nowMs;
    recordStopBargeInSnapshot({
      analysisInactiveAfterStop: null,
      attemptedDuringSpeech: input.recognizedDuringSpeech,
      audioCueAttempted: true,
      cameraInactiveAfterStop: null,
      cutThrough: null,
      guidancePaused: true,
      hapticAttempted: input.hapticAttempted,
      lastRecognizedAt: input.nowMs,
      listeningStoppedAfterStop: null,
      postStopObservedAt: null,
      recognizedCommand: input.recognizedCommand,
      recognizedDuringSpeech: input.recognizedDuringSpeech,
      recognizedPhase: input.recognizedPhase,
      staleSpeechAfterStop: null,
    });

    pauseGuidanceForVoice();
    if (input.hapticAttempted) {
      void GuidePupNavigationCore.playHaptic("stop");
    }
    void GuidePupNavigationCore.playAudioCue("stop");

    try {
      const observation = await stopRuntimeAndObserve();
      if (!stopOperationIsCurrent()) {
        return;
      }
      recordStopBargeInSnapshot({
        analysisInactiveAfterStop: observation.analysisInactive,
        cameraInactiveAfterStop: observation.cameraInactive,
        cutThrough:
          input.recognizedDuringSpeech
          && observation.quiescent
          && !observation.staleSpeechAfterStop,
        listeningStoppedAfterStop: observation.listeningStopped,
        postStopObservedAt: observation.observedAt,
        staleSpeechAfterStop: observation.staleSpeechAfterStop,
      });

      await speakStopConfirmation("Guidance paused. Say start guidance to resume.");
      if (!stopOperationIsCurrent()) {
        return;
      }
      if (
        !guidingRef.current
        && !voiceRecoveryGateActiveRef.current
      ) {
        await startVoiceSession();
      }
    } finally {
      finishVoiceStopOperation({
        refs: stopOperationRefs,
        token: stopOperation,
      });
    }
  }, [pauseGuidanceForVoice, speakStopConfirmation, startVoiceSession, stopRuntimeAndObserve]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        if (isScreenFocusedRef.current && guidingRef.current) {
          enterVoiceRecoveryHold("background");
        }
      }
    });

    return () => subscription.remove();
  }, [enterVoiceRecoveryHold]);

  const handleCameraFrameUnavailable = useCallback(async (
    error: unknown,
    errorMessage: string,
    mode: "guidance" | "scene-query",
  ) => {
    const fallbackMessage = mode === "guidance"
      ? "Guide Pup could not capture a camera frame and switched to a safe stop. Check camera access and retry."
      : "I could not capture a camera frame. Guide Pup switched to a safe stop. Guidance settings are unchanged.";
    setGuidanceStatus({
      detail: fallbackMessage,
      tone: "critical",
      title: "Camera frame unavailable",
    });
    setDirection({
      confidence: 0,
      direction: "stop",
      fallbackReason: "ios-camera-frame-unavailable",
      hazardLevel: "high",
      lighting: "unknown",
      message: fallbackMessage,
      obstacle: true,
      walkability: "uncertain",
    });
    lastGuidanceMessageRef.current = fallbackMessage;
    lastSpokenMessageRef.current = fallbackMessage;
    stopVoice();
    speakCommandResponse(fallbackMessage);
    if (settings.hapticsEnabled) {
      await GuidePupNavigationCore.playHaptic("stop");
    }
    void GuidePupNavigationCore.playAudioCue("stop");
    await refreshNavigationCoreState({
      executionPath: "js-fallback",
      lastError: errorMessage,
      sessionActive: fallbackCameraActiveRef.current,
    });

    void captureAppError(error, {
      screen: "NavigationScreen",
      stage: "captureFrame.jsFallback",
    });
  }, [fallbackCameraError, fallbackCameraReady, refreshNavigationCoreState, settings.hapticsEnabled, speakCommandResponse, stopVoice]);

  const handleFallbackCameraReady = useCallback(() => {
    setFallbackCameraReady(true);
    setFallbackCameraError(null);
    const sessionActive =
      isScreenFocusedRef.current
      && guidingRef.current
      && !runtimeSafetyHoldRef.current;
    fallbackCameraActiveRef.current = sessionActive;
    void refreshNavigationCoreState({
      executionPath: "js-fallback",
      lastError: null,
      sessionActive,
    });
  }, [refreshNavigationCoreState]);

  const handleFallbackCameraMountError = useCallback((event: { message?: string }) => {
    const errorMessage = event.message?.trim() || "Fallback camera preview could not start.";
    setFallbackCameraReady(false);
    setFallbackCameraError(errorMessage);
    fallbackCameraActiveRef.current = false;
    void refreshNavigationCoreState({
      executionPath: "js-fallback",
      lastError: errorMessage,
      sessionActive: false,
    });
  }, [refreshNavigationCoreState]);

  const fallbackCameraActive = shouldOwnFallbackCamera({
    focused: isScreenFocused,
    guiding: isGuiding,
    permissionGranted: permission?.granted === true,
    runtimeSafetyHold,
    usingFallback: navigationCorePath !== "native-core",
  });

  useEffect(() => {
    fallbackCameraActiveRef.current = fallbackCameraActive;
  }, [fallbackCameraActive]);

  useEffect(() => {
    guidingRef.current = isGuiding;
  }, [isGuiding]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking || voiceOverAnnouncementActiveRef.current;
  }, [isSpeaking]);

  useEffect(() => {
    setFallbackCameraReady(false);
    setFallbackCameraError(null);
  }, [navigationCorePath, permission?.granted]);

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!permission) {
      return;
    }

    recordCameraPermissionSnapshot({
      canAskAgain: permission.canAskAgain,
      expires: permission.expires,
      granted: permission.granted,
      status: permission.status,
    });

    if (!permission.granted) {
      setDirection(null);
      setGuidanceStatus({
        detail:
          "Guide Pup needs camera access to analyze the scene. Voice commands remain optional and fall back cleanly when speech permissions are denied.",
        tone: "critical",
        title: "Camera access needed",
      });
      void GuidePupNavigationCore.stopSession();
      void refreshNavigationCoreState({
        lastError: "Camera permission not granted.",
        sessionActive: false,
      });
      if (!hasAnnouncedCameraPermissionRef.current) {
        hasAnnouncedCameraPermissionRef.current = true;
        const cameraMessage = "Camera access is required before Guide Pup can analyze the scene.";
        lastSpokenMessageRef.current = cameraMessage;
        speakCommandResponse(cameraMessage);
      }
      return;
    }

    hasAnnouncedCameraPermissionRef.current = false;

    if (isGuiding) {
      setGuidanceStatus({
        detail: "Analyzing your surroundings.",
        tone: "neutral",
        title: "Guidance active",
      });

      if (!hasAnnouncedStartRef.current) {
        hasAnnouncedStartRef.current = true;
        const startMessage = forceJsFallbackValidation
          ? "JavaScript camera fallback validation started. Safety controls are unchanged. Analyzing your surroundings."
          : "Guidance started. Analyzing your surroundings.";
        lastGuidanceMessageRef.current = startMessage;
        lastSpokenMessageRef.current = startMessage;
        speakCommandResponse(startMessage, undefined, {
          keepListeningDuringSpeech: true,
        });
        void GuidePupNavigationCore.playAudioCue("success");
      }
    }
  }, [forceJsFallbackValidation, isGuiding, permission, refreshNavigationCoreState, speakCommandResponse]);

  useEffect(() => {
    if (permission?.status === "undetermined") {
      void requestPermission();
    }
  }, [permission?.status, requestPermission]);

  useEffect(() => {
    let isCancelled = false;

    const syncNavigationSession = async () => {
      if (!isScreenFocused || !permission?.granted || !isGuiding || runtimeSafetyHold) {
        fallbackCameraActiveRef.current = false;
        await GuidePupNavigationCore.stopSession();
        if (!isCancelled) {
          await refreshNavigationCoreState({
            executionPath: navigationCorePath,
            lastError: null,
            sessionActive: false,
          });
        }
        return;
      }

      if (navigationCorePath === "js-fallback") {
        await GuidePupNavigationCore.stopSession();
        if (!isCancelled) {
          await refreshNavigationCoreState({
            executionPath: "js-fallback",
            lastError: fallbackCameraError,
            sessionActive: fallbackCameraActive && fallbackCameraReady && !fallbackCameraError,
          });
        }
        return;
      }

      try {
        await GuidePupNavigationCore.startSession({
          preferredCamera: "back",
        });

        if (!isCancelled) {
          await refreshNavigationCoreState({
            executionPath: "native-core",
            lastError: null,
            sessionActive: true,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unable to start navigation core.";
        await GuidePupNavigationCore.stopSession().catch(() => undefined);
        if (!isCancelled) {
          setNavigationCorePath("js-fallback");
          await refreshNavigationCoreState({
            executionPath: "js-fallback",
            lastError: errorMessage,
            sessionActive: false,
          });
        }
        void captureAppError(error, {
          screen: "NavigationScreen",
          stage: "startNavigationSession",
        });
      }
    };

    void syncNavigationSession();

    return () => {
      isCancelled = true;
      void GuidePupNavigationCore.stopSession();
    };
  }, [
    fallbackCameraError,
    fallbackCameraActive,
    fallbackCameraReady,
    isGuiding,
    isScreenFocused,
    navigationCorePath,
    permission?.granted,
    refreshNavigationCoreState,
    runtimeSafetyHold,
  ]);

  const resumeGuidanceForVoice = useCallback(() => {
    const decision = decideVoiceGuidanceResume({
      guiding: guidingRef.current,
      recoveryHold: runtimeSafetyHoldRef.current || voiceRecoveryGateActiveRef.current,
      stopOperationInFlight: stopOperationInFlightRef.current,
    });
    if (decision === "stop-in-flight") {
      return false;
    }
    if (decision === "already-active") {
      speakCommandResponse("Guidance is already active.");
      return false;
    }
    if (decision === "recovery-hold") {
      speakCommandResponse("Voice control is still recovering. Guidance remains stopped.");
      return false;
    }

    resetStopBargeInSnapshot();
    invalidateAndAbortAnalysis();
    cameraRecoveryGateActiveRef.current = false;
    lastStopHandledAtRef.current = 0;
    hasAnnouncedStartRef.current = false;
    guidingRef.current = true;
    setIsGuiding(true);
    setGuidanceStatus({
      detail: "Analyzing your surroundings.",
      tone: "neutral",
      title: "Guidance active",
    });
    return true;
  }, [invalidateAndAbortAnalysis, speakCommandResponse]);

  useEffect(() => {
    resetStopBargeInSnapshot();
  }, []);

  const analyzeCurrentFrame = useCallback(async (mode: "guidance" | "scene-query" = "guidance") => {
    if (
      analyzingRef.current
      || !guidingRef.current
      || !isScreenFocusedRef.current
      || runtimeSafetyHoldRef.current
      || cameraRecoveryGateActiveRef.current
    ) {
      return;
    }

    const analysisController = new AbortController();
    activeAnalysisControllerRef.current = analysisController;
    const analysisGeneration = analysisGenerationRef.current;
    const analysisIsCurrent = () =>
      analysisGenerationRef.current === analysisGeneration
      && !analysisController.signal.aborted
      && guidingRef.current
      && isScreenFocusedRef.current
      && !runtimeSafetyHoldRef.current
      && !cameraRecoveryGateActiveRef.current;
    const loopStartedAt = Date.now();
    try {
      analyzingRef.current = true;

      let frame: Awaited<ReturnType<typeof GuidePupNavigationCore.captureFrame>>;

      try {
        if (navigationCorePath !== "native-core" && (!cameraRef.current || !fallbackCameraReady || fallbackCameraError)) {
          throw new Error(fallbackCameraError || "Fallback camera preview is not ready.");
        }

        frame = await GuidePupNavigationCore.captureFrame({
          cameraRef: cameraRef.current,
          compressionQuality: 0.4,
          forceFallback: navigationCorePath !== "native-core",
          maxDimension: 768,
        });
      } catch (captureError) {
        if (!analysisIsCurrent()) {
          return;
        }
        const captureErrorMessage =
          captureError instanceof Error ? captureError.message : "Guide Pup could not capture a frame.";

        if (navigationCorePath === "native-core") {
          await GuidePupNavigationCore.stopSession().catch(() => undefined);
          setNavigationCorePath("js-fallback");
          await refreshNavigationCoreState({
            executionPath: "js-fallback",
            lastError: captureErrorMessage,
            sessionActive: false,
          });

          await handleCameraFrameUnavailable(captureError, captureErrorMessage, mode);
          return;
        }

        await handleCameraFrameUnavailable(captureError, captureErrorMessage, mode);
        return;
      }

      if (!analysisIsCurrent()) {
        return;
      }

      assertFreshFrameForUpload({
        capturedAtMs: frame.timestampMs,
        minimumCapturedAtMs: recoveryFreshFrameAfterMsRef.current || undefined,
        signal: analysisController.signal,
      });

      if (mode === "guidance") {
        await refreshNavigationCoreState({
          executionPath: frame.executionPath,
          lastCaptureLatencyMs: frame.captureLatencyMs,
          lastError: null,
          sessionActive: true,
        });
      }

      if (!analysisIsCurrent()) {
        return;
      }

      const analysisStartedAtMs = Date.now();
      const rawResult = await GuideAI.analyzeWithVision(frame, {
        detail: settings.descriptionMode === "detailed" ? "high" : "low",
        frameId: `${guidanceSessionIdRef.current}-${(frameSequenceRef.current += 1)}`,
        interactionMode: mode,
        minimumFrameTimestampMs: recoveryFreshFrameAfterMsRef.current || undefined,
        priorGuidance: lastGuidanceMessageRef.current,
        recoveryGateActive: voiceRecoveryGateActiveRef.current,
        sessionId: guidanceSessionIdRef.current,
        signal: analysisController.signal,
        updateNavigationMemory: mode === "guidance",
      });

      if (!analysisIsCurrent() || !rawResult) {
        return;
      }

      const result = applyDeterministicVisionSafetyGuard(rawResult, {
        analysisLatencyMs: Date.now() - analysisStartedAtMs,
        capturedAtMs: frame.timestampMs,
        minimumCapturedAtMs: recoveryFreshFrameAfterMsRef.current || undefined,
        recoveryGateActive: voiceRecoveryGateActiveRef.current,
      });

      const effectPlan = planVisionLaneResult({
        hapticsEnabled: settings.hapticsEnabled,
        isGuiding: guidingRef.current,
        isSpeaking: isSpeakingRef.current,
        mode,
        result,
      });

      if (effectPlan.directionUpdate) {
        setDirection(effectPlan.directionUpdate);

        if (result.direction === "stop" || result.obstacle) {
          setGuidanceStatus({
            detail: result.message || "Guide Pup stopped guidance until the path is clear.",
            tone: "warning",
            title: "Safe STOP active",
          });
        } else {
          setGuidanceStatus({
            detail: result.message || "Analyzing surroundings.",
            tone: "neutral",
            title: "Guidance active",
          });
        }
      }

      if (effectPlan.speech) {
        if (effectPlan.guidanceMessageUpdate) {
          lastGuidanceMessageRef.current = effectPlan.guidanceMessageUpdate;
        }
        if (effectPlan.repeatMessageUpdate) {
          lastSpokenMessageRef.current = effectPlan.repeatMessageUpdate;
        }
        speakCommandResponse(effectPlan.speech, undefined, {
          keepListeningDuringSpeech: effectPlan.keepListeningDuringSpeech,
        });
      }

      const hapticType: GuidePupNavigationCoreHapticType | null =
        effectPlan.haptic === "turn-left"
          ? "left"
          : effectPlan.haptic === "turn-right"
            ? "right"
            : effectPlan.haptic;

      if (hapticType) {
        await GuidePupNavigationCore.playHaptic(hapticType);
      }

      if (effectPlan.audioCue) {
        void GuidePupNavigationCore.playAudioCue(effectPlan.audioCue);
      }

      if (mode === "guidance" && analysisIsCurrent()) {
        await refreshNavigationCoreState({
          executionPath: frame.executionPath,
          lastCaptureLatencyMs: frame.captureLatencyMs,
          lastError: null,
          lastTotalGuidanceLoopLatencyMs: Date.now() - loopStartedAt,
          sessionActive: true,
        });
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }
      if (!analysisIsCurrent()) {
        return;
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const failureClass = classifyAnalyzeError(errorMessage);
      const staleFrameFailure = isStaleFrameError(error);

      if (!guidingRef.current) {
        void refreshNavigationCoreState({
          lastError: errorMessage,
          lastTotalGuidanceLoopLatencyMs: Date.now() - loopStartedAt,
          sessionActive: false,
        });
        void captureAppError(error, {
          screen: "NavigationScreen",
          stage: mode === "scene-query" ? "analyzeCurrentFrame.sceneQuery.stopped" : "analyzeCurrentFrame.stopped",
        });
        return;
      }

      const fallbackMessage =
        staleFrameFailure
          ? "Stop. Camera guidance is not fresh enough. Hold still while Guide Pup checks a new frame."
          : mode === "scene-query"
          ? "I could not describe the scene. Guide Pup switched to a safe stop. Guidance settings are unchanged."
          : failureClass === "timeout"
          ? "Guide Pup timed out and switched to a safe stop. Hold still and retry in a moment."
          : failureClass === "unauthorized"
            ? "Guide Pup refreshed your session and switched to a safe stop."
            : failureClass === "invalid-response"
              ? "Guide Pup received an invalid result and switched to a safe stop."
              : "Guide Pup lost the backend connection and switched to a safe stop.";

      setGuidanceStatus({
        detail: fallbackMessage,
        tone: "critical",
        title:
          staleFrameFailure
            ? "Stale camera frame"
            : mode === "scene-query"
            ? "Scene analysis unavailable"
            : failureClass === "timeout"
            ? "Backend timeout"
            : failureClass === "unauthorized"
              ? "Session expired"
              : failureClass === "invalid-response"
                ? "Invalid backend response"
              : "Backend unavailable",
      });
      setDirection({
        confidence: 0,
        direction: "stop",
        fallbackReason: staleFrameFailure ? "ios-stale-frame" : `ios-${failureClass}`,
        hazardLevel: "high",
        lighting: "unknown",
        message: fallbackMessage,
        obstacle: true,
        walkability: "uncertain",
      });
      lastGuidanceMessageRef.current = fallbackMessage;
      lastSpokenMessageRef.current = fallbackMessage;
      stopVoice();
      speakCommandResponse(fallbackMessage);
      if (settings.hapticsEnabled) {
        await GuidePupNavigationCore.playHaptic("stop");
      }
      void GuidePupNavigationCore.playAudioCue("stop");
      void refreshNavigationCoreState({
        lastError: errorMessage,
        lastTotalGuidanceLoopLatencyMs: Date.now() - loopStartedAt,
        sessionActive: guidingRef.current,
      });

      if (!staleFrameFailure) {
        void captureAppError(error, {
          screen: "NavigationScreen",
          stage: mode === "scene-query" ? "analyzeCurrentFrame.sceneQuery" : "analyzeCurrentFrame",
        });
      }
    } finally {
      if (activeAnalysisControllerRef.current === analysisController) {
        activeAnalysisControllerRef.current = null;
      }
      analyzingRef.current = false;
    }
  }, [
    fallbackCameraError,
    fallbackCameraReady,
    handleCameraFrameUnavailable,
    navigationCorePath,
    refreshNavigationCoreState,
    settings.descriptionMode,
    settings.hapticsEnabled,
    speakCommandResponse,
    stopVoice,
  ]);

  useFocusEffect(useCallback(() => {
    const stateSubscription = GuidePupNavigationCore.addStateListener((state) => {
      const recoveryState = state.recoveryState ?? "idle";
      const previousRecoveryState = lastCameraRecoveryStateRef.current;
      lastCameraRecoveryStateRef.current = recoveryState;
      recordNavigationLoopSnapshot({
        available: GuidePupNavigationCore.isNativeAvailable(),
        executionPath: "native-core",
        lastError: state.lastError ?? null,
        recoveryState,
        sessionActive: state.sessionActive,
      });

      if (!isScreenFocusedRef.current || !guidingRef.current) {
        return;
      }

      if (recoveryState === "idle" && state.sessionActive) {
        if (previousRecoveryState !== "idle") {
          cameraRecoveryGateActiveRef.current = false;
          recoveryFreshFrameAfterMsRef.current = Math.max(
            recoveryFreshFrameAfterMsRef.current,
            Date.now(),
          );
          const recoveredMessage = "Camera recovered. Stay stopped while I check the path.";
          setGuidanceStatus({
            detail: recoveredMessage,
            tone: "warning",
            title: "Camera recovered",
          });
          lastGuidanceMessageRef.current = recoveredMessage;
          speakCommandResponse(recoveredMessage, undefined, {
            keepListeningDuringSpeech: true,
          });
          setTimeout(() => {
            if (isScreenFocusedRef.current && guidingRef.current) {
              void analyzeCurrentFrame();
            }
          }, 350);
        }
        return;
      }

      if (!["background", "exhausted", "interrupted", "recovering"].includes(recoveryState)) {
        return;
      }

      cameraRecoveryGateActiveRef.current = true;
      fallbackCameraActiveRef.current = false;
      invalidateAndAbortAnalysis();
      const exhausted = recoveryState === "exhausted";
      const message = exhausted
        ? "Stop. Camera could not recover. Guidance is paused. Use the Stop button, then restart when ready."
        : recoveryState === "background"
          ? "Stop. Camera is unavailable while Guide Pup is in the background."
          : recoveryState === "interrupted"
            ? "Stop. Camera was interrupted. Waiting to recover."
            : "Stop. Camera is recovering. Hold still.";

      if (exhausted) {
        guidingRef.current = false;
        setIsGuiding(false);
        hasAnnouncedStartRef.current = false;
        void GuidePupNavigationCore.stopSession();
      }
      setDirection({
        confidence: 0,
        direction: "stop",
        fallbackReason: `camera-${recoveryState}`,
        hazardLevel: "high",
        message,
        obstacle: true,
        walkability: "uncertain",
      });
      setGuidanceStatus({
        detail: message,
        tone: "critical",
        title: exhausted ? "Camera recovery failed" : "Camera unavailable",
      });
      lastGuidanceMessageRef.current = message;
      lastSpokenMessageRef.current = message;

      if (previousRecoveryState === "idle" || exhausted) {
        stopVoice();
        if (settings.hapticsEnabled) {
          void GuidePupNavigationCore.playHaptic("stop");
        }
        void GuidePupNavigationCore.playAudioCue("stop");
        speakCommandResponse(message, undefined, {
          keepListeningDuringSpeech: !exhausted,
        });
      }
    });

    return () => {
      stateSubscription.remove();
      lastCameraRecoveryStateRef.current = "idle";
      cameraRecoveryGateActiveRef.current = false;
    };
  }, [analyzeCurrentFrame, invalidateAndAbortAnalysis, settings.hapticsEnabled, speakCommandResponse, stopVoice]));

  const handleVoiceRecognitionEvent = useCallback(({ isFinal, transcript }: GuidePupVoiceRecognitionEvent) => {
      if (!isScreenFocusedRef.current) {
        return;
      }

      const normalizedTranscript = normalizeVoiceTranscript(transcript);
      const nowMs = Date.now();
      if (!normalizedTranscript || isRecentDuplicateTranscript(normalizedTranscript, lastHandledTranscriptRef.current, nowMs)) {
        return;
      }

      const intent = parseVoiceCommand(normalizedTranscript);
      const conversationIntent = intent ? null : parseConversationPrompt(normalizedTranscript);
      const recentlyHandledStop = Date.now() - lastStopHandledAtRef.current < 2000;
      if (!isFinal) {
        if (
          isStopBargeInCommand(normalizedTranscript)
          && guidingRef.current
          && !recentlyHandledStop
        ) {
          const stopRecognizedDuringSpeech = isSpeakingRef.current;
          const hapticAttempted = settings.hapticsEnabled;
          lastStopHandledAtRef.current = Date.now();
          lastHandledTranscriptRef.current = {
            normalizedTranscript,
            timestampMs: nowMs,
          };
          void handleVoiceStopCommand({
            hapticAttempted,
            nowMs,
            recognizedCommand: "stop-guidance-partial",
            recognizedDuringSpeech: stopRecognizedDuringSpeech,
            recognizedPhase: "partial",
          });
          recordVoiceSnapshot({
            executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
            lastRecognizedAt: nowMs,
            lastRecognizedCommand: "stop-guidance-partial",
            lastRecognizedCommandPhase: "partial",
          });
        }
        return;
      }

      if (stopOperationInFlightRef.current && intent !== "stop-guidance") {
        return;
      }

      if (isSpeakingRef.current && intent !== "stop-guidance") {
        return;
      }

      if (intent === "stop-guidance" && recentlyHandledStop) {
        return;
      }

      lastHandledTranscriptRef.current = {
        normalizedTranscript,
        timestampMs: nowMs,
      };

      recordVoiceSnapshot({
        executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
        lastRecognizedAt: nowMs,
        lastRecognizedCommand: intent ?? conversationIntent ?? "unsupported",
        lastRecognizedCommandPhase: "final",
      });

      if (conversationIntent === "what-do-you-see") {
        if (!guidingRef.current) {
          speakCommandResponse("Start guidance first, then ask what do you see.");
          return;
        }
        if (!permission?.granted) {
          speakCommandResponse("Camera access is required before I can describe the scene.");
          return;
        }
        if (!canAnswerWhatDoYouSee()) {
          speakCommandResponse("The experimental conversation lane is not enabled right now.");
          return;
        }
        if (analyzingRef.current) {
          speakCommandResponse("I am already analyzing. Say repeat in a moment for the latest guidance.");
          return;
        }
        speakCommandResponse("Analyzing the scene now.");
        void analyzeCurrentFrame("scene-query");
        return;
      }

      if (!intent) {
        speakCommandResponse("That command is not supported. Say help for the supported commands.");
        return;
      }

      switch (intent) {
        case "start-guidance":
          if (resumeGuidanceForVoice() && permission?.granted) {
            void analyzeCurrentFrame();
          }
          return;
        case "stop-guidance": {
          if (!guidingRef.current) {
            speakCommandResponse("Guidance is already paused.");
            return;
          }
          const stopRecognizedDuringSpeech = isSpeakingRef.current;
          const hapticAttempted = settings.hapticsEnabled;
          lastStopHandledAtRef.current = Date.now();
          void handleVoiceStopCommand({
            hapticAttempted,
            nowMs,
            recognizedCommand: "stop-guidance",
            recognizedDuringSpeech: stopRecognizedDuringSpeech,
            recognizedPhase: "final",
          });
          return;
        }
        case "repeat":
          speakCommandResponse(lastSpokenMessageRef.current);
          return;
        case "help":
          speakCommandResponse(
            buildVoiceHelpPrompt(guidingRef.current, {
              conversationLaneEnabled: guidingRef.current && permission?.granted === true && canAnswerWhatDoYouSee(),
            }),
          );
          return;
        case "slower-speech": {
          const nextRate = slowerSpeechRate(settings.speechRate);
          if (nextRate === settings.speechRate) {
            speakCommandResponse(`Speech rate is already ${describeSpeechRate(nextRate)}.`);
            return;
          }
          void updateSpeechRate(nextRate).then((saved) => {
            speakCommandResponse(
              saved
                ? `Speech rate set to ${describeSpeechRate(nextRate)}. Say faster speech to undo.`
                : "I could not save the speech rate. The setting was not changed.",
              saved ? (nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9) : undefined,
            );
          });
          return;
        }
        case "faster-speech": {
          const nextRate = fasterSpeechRate(settings.speechRate);
          if (nextRate === settings.speechRate) {
            speakCommandResponse(`Speech rate is already ${describeSpeechRate(nextRate)}.`);
            return;
          }
          void updateSpeechRate(nextRate).then((saved) => {
            speakCommandResponse(
              saved
                ? `Speech rate set to ${describeSpeechRate(nextRate)}. Say slower speech to undo.`
                : "I could not save the speech rate. The setting was not changed.",
              saved ? (nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9) : undefined,
            );
          });
          return;
        }
        case "more-detail":
          if (settings.descriptionMode === "detailed") {
            speakCommandResponse("Detail level is already detailed.");
            return;
          }
          void updateDescriptionMode("detailed").then((saved) => {
            speakCommandResponse(
              saved
                ? "Detail level set to detailed. Say less detail to undo."
                : "I could not save the detail level. The setting was not changed.",
            );
          });
          return;
        case "less-detail":
          if (settings.descriptionMode === "short") {
            speakCommandResponse("Detail level is already short.");
            return;
          }
          void updateDescriptionMode("short").then((saved) => {
            speakCommandResponse(
              saved
                ? "Detail level set to short. Say more detail to undo."
                : "I could not save the detail level. The setting was not changed.",
            );
          });
          return;
        case "haptics-on":
          if (settings.hapticsEnabled) {
            speakCommandResponse(`Haptics are already ${describeHaptics(true)}.`);
            return;
          }
          void updateHapticsEnabled(true).then((saved) => {
            if (saved) {
              void GuidePupNavigationCore.playHaptic("success");
              void GuidePupNavigationCore.playAudioCue("success");
            }
            speakCommandResponse(
              saved
                ? "Haptics turned on. Say haptics off to undo."
                : "I could not save the haptics setting. The setting was not changed.",
            );
          });
          return;
        case "haptics-off":
          if (!settings.hapticsEnabled) {
            speakCommandResponse(`Haptics are already ${describeHaptics(false)}.`);
            return;
          }
          void updateHapticsEnabled(false).then((saved) => {
            if (saved) {
              void GuidePupNavigationCore.playAudioCue("success");
            }
            speakCommandResponse(
              saved
                ? "Haptics turned off. Say haptics on to undo."
                : "I could not save the haptics setting. The setting was not changed.",
            );
          });
          return;
        case "status":
          speakCommandResponse(
            buildVoiceStatusSummary({
              cameraReady: permission?.granted === true,
              conversationLaneEnabled: guidingRef.current && permission?.granted === true && canAnswerWhatDoYouSee(),
              isGuiding: guidingRef.current,
              settings,
              voiceControlAvailable: GuidePupVoiceControl.isNativeModuleAvailable(),
            }),
          );
          return;
      }
  }, [
    analyzeCurrentFrame,
    handleVoiceStopCommand,
    permission?.granted,
    resumeGuidanceForVoice,
    settings,
    speakCommandResponse,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  ]);

  const handleVoiceStateEvent = useCallback((state: GuidePupVoiceControlState) => {
      const recoveryState = state.recoveryState ?? "idle";
      const recoveryStateChanged = lastVoiceRecoveryStateRef.current !== recoveryState;
      lastVoiceRecoveryStateRef.current = recoveryState;
      recordVoiceSnapshot({
        available: GuidePupVoiceControl.isNativeModuleAvailable(),
        executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
        lastError: state.lastError ?? undefined,
        listening: state.listening,
        microphonePermission: state.microphonePermission,
        recoveryState,
        speaking: state.speaking,
        speechPermission: state.speechPermission,
        voiceProcessingEnabled: state.voiceProcessingEnabled,
      });

      if (recoveryState === "idle" && state.listening) {
        voiceRecoveryExhaustedHandledRef.current = false;
        clearVoiceRecoveryHold();
        return;
      }

      if (
        recoveryState === "idle"
        || !isScreenFocusedRef.current
        || !guidingRef.current
      ) {
        return;
      }

      const exhaustedAlreadyHandled = voiceRecoveryExhaustedHandledRef.current;
      if (recoveryState === "exhausted" && !exhaustedAlreadyHandled) {
        voiceRecoveryExhaustedHandledRef.current = true;
        guidingRef.current = false;
        setIsGuiding(false);
        hasAnnouncedStartRef.current = false;
      }
      if (
        (!voiceRecoveryGateActiveRef.current && recoveryStateChanged)
        || (recoveryState === "exhausted" && !exhaustedAlreadyHandled)
      ) {
        enterVoiceRecoveryHold(recoveryState);
      }
  }, [clearVoiceRecoveryHold, enterVoiceRecoveryHold]);

  useLayoutEffect(() => {
    voiceRecognitionHandlerRef.current = handleVoiceRecognitionEvent;
    voiceStateHandlerRef.current = handleVoiceStateEvent;
  }, [handleVoiceRecognitionEvent, handleVoiceStateEvent]);

  useFocusEffect(useCallback(() => {
    const unsubscribe = subscribeToStableVoiceRoute({
      addRecognitionListener: GuidePupVoiceControl.addRecognitionListener,
      addStateListener: GuidePupVoiceControl.addStateListener,
      recognitionHandlerRef: voiceRecognitionHandlerRef,
      stateHandlerRef: voiceStateHandlerRef,
    });

    return () => {
      unsubscribe();
      lastVoiceRecoveryStateRef.current = "idle";
    };
  }, []));

  useEffect(() => {
    if (!isScreenFocused || !isGuiding || !permission?.granted || runtimeSafetyHold) {
      return;
    }

    const startDelay = setTimeout(() => {
      void analyzeCurrentFrame();
    }, 2000);

    const intervalId = setInterval(() => {
      void analyzeCurrentFrame();
    }, ANALYSIS_INTERVAL_MS);

    return () => {
      clearTimeout(startDelay);
      clearInterval(intervalId);
    };
  }, [analyzeCurrentFrame, isGuiding, isScreenFocused, permission?.granted, runtimeSafetyHold]);

  const handleStop = useCallback(async () => {
    const stopOperationRefs = {
      focusGenerationRef: voiceRouteFocusGenerationRef,
      operationGenerationRef: stopOperationGenerationRef,
      operationInFlightRef: stopOperationInFlightRef,
    };
    const stopOperation = beginVoiceStopOperation(stopOperationRefs);
    if (!stopOperation) {
      return;
    }
    const stopOperationIsCurrent = () => isVoiceStopOperationCurrent({
      focused: isScreenFocusedRef.current,
      refs: stopOperationRefs,
      token: stopOperation,
    });
    setIsGuiding(false);
    guidingRef.current = false;
    hasAnnouncedStartRef.current = false;
    setDirection({
      confidence: 1,
      direction: "stop",
      fallbackReason: "touch-stop",
      hazardLevel: "none",
      lighting: "unknown",
      message: "Guidance stopped.",
      obstacle: false,
      walkability: "uncertain",
    });
    setGuidanceStatus({
      detail: "Guide Pup is paused. Return when you are ready to continue.",
      tone: "neutral",
      title: "Guidance stopped",
    });
    lastSpokenMessageRef.current = "Guidance stopped.";
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("stop");
    }
    void GuidePupNavigationCore.playAudioCue("stop");
    try {
      await stopRuntimeAndObserve();
      if (!stopOperationIsCurrent()) {
        return;
      }
      await speakStopConfirmation("Guidance stopped.");
      if (!stopOperationIsCurrent()) {
        return;
      }

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        router.replace("/");
      }
    } finally {
      finishVoiceStopOperation({
        refs: stopOperationRefs,
        token: stopOperation,
      });
    }
  }, [navigation, router, settings.hapticsEnabled, speakStopConfirmation, stopRuntimeAndObserve]);

  const handleSOS = useCallback(() => {
    const sosMessage = "SOS shortcut is not connected in this build. Use your phone emergency shortcut if you need help.";
    lastSpokenMessageRef.current = sosMessage;
    speakCommandResponse(sosMessage);
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("error");
    }
    void GuidePupNavigationCore.playAudioCue("error");
  }, [settings.hapticsEnabled, speakCommandResponse]);

  const canOpenCameraSettings = typeof Linking.openSettings === "function" && Platform.OS !== "web";

  const openCameraSettings = useCallback(() => {
    if (typeof Linking.openSettings === "function") {
      void Linking.openSettings();
    }
  }, []);

  return (
    <View style={styles.container}>
      {fallbackCameraActive ? (
        <CameraView
          ref={cameraRef}
          style={styles.hiddenCamera}
          active={fallbackCameraActive}
          facing="back"
          enableTorch={false}
          onCameraReady={handleFallbackCameraReady}
          onMountError={handleFallbackCameraMountError}
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}

      <SafeAreaView style={styles.safeArea}>
        {permission?.granted ? (
          <Pressable
            onLongPress={handleSOS}
            onPress={() => {
              void handleStop();
            }}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "activate") {
                void handleStop();
              } else if (event.nativeEvent.actionName === "longpress") {
                handleSOS();
              }
            }}
            accessibilityActions={[
              { name: "activate", label: "Stop guidance" },
              { name: "longpress", label: "SOS information" },
            ]}
            style={styles.touchable}
            accessibilityLabel="Stop guidance"
            accessibilityRole="button"
            accessibilityHint="Double tap to stop guidance. Use the SOS information action for emergency shortcut information."
            testID="navigation-stop-guidance"
          >
            <View style={styles.content}>
              <StatusBannerView banner={guidanceStatus} />

              <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
                <View style={styles.innerCircle} />
              </Animated.View>

              <Text style={styles.statusText}>{isGuiding ? "Guiding..." : "Stopped"}</Text>

              {direction ? (
                <Text style={styles.directionText}>
                  {direction.direction.replace("-", " ").toUpperCase()}
                </Text>
              ) : null}

              {direction?.message ? <Text style={styles.messageText}>{direction.message}</Text> : null}

              {direction?.sceneDescription ? (
                <Text style={styles.sceneText}>{direction.sceneDescription}</Text>
              ) : null}

              <Text style={styles.safetyNote}>
                Guide Pup provides assistive guidance and can stop with STOP when the scene is unclear.
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.permissionState}>
            <StatusBannerView banner={guidanceStatus} />

            <View style={styles.permissionCard}>
              <Text style={styles.permissionTitle}>Camera access is required</Text>
              <Text style={styles.permissionBody}>
                Guide Pup sends compressed camera frames to the backend for navigation analysis.
                Voice commands are optional and use iOS speech recognition for a bounded
                command set.
              </Text>

              <View style={styles.permissionActions}>
                <Pressable
                  onPress={handleStop}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Return to home"
                  accessibilityHint="Double tap to stop guidance and return to the home screen"
                  testID="navigation-return-home"
                >
                  <Text style={styles.secondaryButtonText}>Return</Text>
                </Pressable>

                <Pressable
                  onPress={() => void requestPermission()}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Request camera access"
                  accessibilityHint="Double tap to ask for camera permission again"
                  testID="navigation-request-camera"
                >
                  <Text style={styles.primaryButtonText}>Request access</Text>
                </Pressable>

                {canOpenCameraSettings ? (
                  <Pressable
                    onPress={openCameraSettings}
                    style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
                    accessibilityRole="button"
                    accessibilityLabel="Open camera settings"
                    accessibilityHint="Double tap to open the app settings page"
                    testID="navigation-open-settings"
                  >
                    <Text style={styles.secondaryButtonText}>Open Settings</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <Text style={styles.safetyNote}>
              Guide Pup stops safely when the scene is unclear or the backend is unavailable.
            </Text>
          </View>
        )}

        <View style={styles.bottomHint}>
          <Text style={styles.hintText}>
            {permission?.granted
              ? `Tap to stop${Platform.OS !== "web" ? " | Long press for SOS" : ""}`
              : "Grant camera access to start guidance"}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

function StatusBannerView({ banner }: { banner: StatusBanner }) {
  const colors = getStatusColors(banner.tone);

  return (
    <View style={[styles.statusBanner, { backgroundColor: colors.background, borderColor: colors.accent }]}>
      <Text style={[styles.statusBannerTitle, { color: colors.accent }]}>{banner.title}</Text>
      <Text style={styles.statusBannerDetail}>{banner.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  hiddenCamera: {
    bottom: 0,
    left: 0,
    opacity: 0.01,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: -1,
  },
  safeArea: {
    flex: 1,
  },
  touchable: {
    flex: 1,
  },
  content: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  statusBanner: {
    alignSelf: "stretch",
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    padding: 16,
  },
  statusBannerTitle: {
    fontSize: 18,
    fontWeight: "800",
  },
  statusBannerDetail: {
    color: "#222222",
    fontSize: 15,
    lineHeight: 21,
  },
  pulseCircle: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 100,
    height: 200,
    justifyContent: "center",
    marginBottom: 28,
    width: 200,
  },
  innerCircle: {
    backgroundColor: "#111111",
    borderRadius: 75,
    height: 150,
    width: 150,
  },
  statusText: {
    color: "#111111",
    fontSize: 48,
    fontWeight: "700",
    marginBottom: 8,
  },
  directionText: {
    color: "#222222",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 12,
  },
  messageText: {
    color: "#333333",
    fontSize: 20,
    lineHeight: 28,
    textAlign: "center",
  },
  sceneText: {
    color: "#888888",
    fontSize: 15,
    fontStyle: "italic",
    marginTop: 16,
    textAlign: "center",
  },
  safetyNote: {
    color: "#555555",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 18,
    textAlign: "center",
  },
  permissionCard: {
    alignSelf: "stretch",
    backgroundColor: "#FFFFFF",
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 24,
  },
  permissionTitle: {
    color: "#111111",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  permissionBody: {
    color: "#333333",
    fontSize: 17,
    lineHeight: 24,
    textAlign: "center",
  },
  permissionActions: {
    gap: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#111111",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#F1F1F1",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#111111",
    fontSize: 17,
    fontWeight: "700",
  },
  buttonPressed: {
    opacity: 0.85,
  },
  bottomHint: {
    alignItems: "center",
    paddingBottom: 24,
  },
  hintText: {
    color: "#AAAAAA",
    fontSize: 14,
  },
});
