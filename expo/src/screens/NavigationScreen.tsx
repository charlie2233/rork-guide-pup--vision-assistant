import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useVoice } from "@/src/components/VoiceAnnouncer";
import Colors from "@/constants/colors";
import { GuideAI, GuideAIDirection } from "@/src/logic/GuideAI";
import { canAnswerWhatDoYouSee, parseConversationPrompt } from "@/src/lib/voiceConversation";
import {
  buildVoiceHelpPrompt,
  isRecentDuplicateTranscript,
  isStopBargeInCommand,
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
import { useGuidePupRouter } from "@/src/lib/router";
import {
  classifyAnalyzeError,
  recordCameraPermissionSnapshot,
  recordNavigationLoopSnapshot,
  recordVoiceSnapshot,
} from "@/src/lib/diagnostics";
import {
  GuidePupNavigationCore,
  type GuidePupNavigationCoreExecutionPath,
  type GuidePupNavigationCoreHapticType,
} from "@/src/native/GuidePupNavigationCore";
import { GuidePupVoiceControl } from "@/src/native/GuidePupVoiceControl";
import { useSettings } from "@/src/providers/SettingsProvider";

const ANALYSIS_INTERVAL_MS = 4500;

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
  const [navigationCorePath, setNavigationCorePath] = useState<GuidePupNavigationCoreExecutionPath>(
    GuidePupNavigationCore.isNativeAvailable() ? "native-core" : "js-fallback",
  );
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const analyzingRef = useRef(false);
  const guidingRef = useRef(true);
  const hasAnnouncedCameraPermissionRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const hasAnnouncedStartRef = useRef(false);
  const lastHandledTranscriptRef = useRef<GuidePupHandledTranscript | null>(null);
  const lastSpokenMessageRef = useRef("Guidance started. Analyzing your surroundings.");
  const lastStopHandledAtRef = useRef(0);
  const guidanceSessionIdRef = useRef(`guidepup-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const frameSequenceRef = useRef(0);

  const refreshNavigationCoreState = useCallback(
    async (partial?: {
      executionPath?: GuidePupNavigationCoreExecutionPath;
      lastCaptureLatencyMs?: number;
      lastError?: string | null;
      lastTotalGuidanceLoopLatencyMs?: number;
      sessionActive?: boolean;
    }) => {
      const [runtimeAvailable, state] = await Promise.all([
        GuidePupNavigationCore.isAvailable().catch(() => false),
        GuidePupNavigationCore.getState().catch(() => null),
      ]);
      const moduleAvailable = GuidePupNavigationCore.isNativeAvailable();
      const executionPath: GuidePupNavigationCoreExecutionPath =
        partial?.executionPath ?? (moduleAvailable && runtimeAvailable ? "native-core" : "js-fallback");
      setNavigationCorePath(executionPath);
      recordNavigationLoopSnapshot({
        available: moduleAvailable,
        executionPath,
        lastCaptureLatencyMs: partial?.lastCaptureLatencyMs ?? state?.lastCaptureLatencyMs,
        lastError: partial?.lastError !== undefined ? partial.lastError : state?.lastError ?? null,
        lastTotalGuidanceLoopLatencyMs: partial?.lastTotalGuidanceLoopLatencyMs,
        sessionActive: partial?.sessionActive ?? state?.sessionActive ?? false,
        voiceOverRunning: state?.voiceOverRunning,
      });
    },
    [],
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
      speechPermission: state.speechPermission,
    });
  }, []);

  const startVoiceSession = useCallback(async () => {
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
      recordVoiceSnapshot({
        available: true,
        executionPath: "native-voice",
        listening: false,
        microphonePermission: permissions.microphone,
        speechPermission: permissions.speech,
      });

      if (permissions.microphone !== "granted" || permissions.speech !== "granted") {
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
        speak(permissionMessage);
        return;
      }

      lastHandledTranscriptRef.current = null;
      const state = await GuidePupVoiceControl.startCommandSession({
        partialResults: true,
      }).catch(() => null);

      if (state) {
        recordVoiceSnapshot({
          available: true,
          executionPath: "native-voice",
          lastError: state.lastError ?? undefined,
          listening: state.listening,
          microphonePermission: state.microphonePermission,
          speechPermission: state.speechPermission,
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
  }, [speak]);

  const speakCommandResponse = useCallback((
    message: string,
    rateOverride?: number,
    options?: { keepListeningDuringSpeech?: boolean },
  ) => {
    lastSpokenMessageRef.current = message;
    speak(message, {
      keepListeningDuringSpeech: options?.keepListeningDuringSpeech,
      rate: rateOverride ?? (
        settings.speechRate === "slow"
          ? 0.7
          : settings.speechRate === "fast"
            ? 1.2
          : 0.9
      ),
    });
  }, [settings.speechRate, speak]);

  const pauseGuidanceForVoice = useCallback(() => {
    lastHandledTranscriptRef.current = null;
    guidingRef.current = false;
    hasAnnouncedStartRef.current = false;
    setIsGuiding(false);
    setDirection(null);
    setGuidanceStatus({
      detail: "Guide Pup is paused. Say start guidance to continue.",
      tone: "warning",
      title: "Guidance paused",
    });
  }, []);

  useEffect(() => {
    guidingRef.current = isGuiding;
  }, [isGuiding]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

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
        speak(cameraMessage);
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
        lastSpokenMessageRef.current = "Guidance started. Analyzing your surroundings.";
        speak("Guidance started. Analyzing your surroundings.", {
          keepListeningDuringSpeech: true,
        });
        void GuidePupNavigationCore.announce("Guidance started. Analyzing your surroundings.");
      }
    }
  }, [isGuiding, permission, refreshNavigationCoreState, speak]);

  useEffect(() => {
    if (permission?.status === "undetermined") {
      void requestPermission();
    }
  }, [permission?.status, requestPermission]);

  useEffect(() => {
    let isCancelled = false;

    const syncNavigationSession = async () => {
      if (!permission?.granted || !isGuiding) {
        await GuidePupNavigationCore.stopSession();
        if (!isCancelled) {
          await refreshNavigationCoreState({
            lastError: null,
            sessionActive: false,
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
        if (!isCancelled) {
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
  }, [isGuiding, permission?.granted, refreshNavigationCoreState]);

  const resumeGuidanceForVoice = useCallback(() => {
    if (guidingRef.current) {
      speakCommandResponse("Guidance is already active.");
      return;
    }

    hasAnnouncedStartRef.current = false;
    guidingRef.current = true;
    setIsGuiding(true);
    setGuidanceStatus({
      detail: "Analyzing your surroundings.",
      tone: "neutral",
      title: "Guidance active",
    });
  }, [speakCommandResponse]);

  const analyzeCurrentFrame = useCallback(async (mode: "guidance" | "scene-query" = "guidance") => {
    if (analyzingRef.current || !guidingRef.current) {
      return;
    }

    const loopStartedAt = Date.now();
    try {
      analyzingRef.current = true;

      let frame: Awaited<ReturnType<typeof GuidePupNavigationCore.captureFrame>>;

      try {
        frame = await GuidePupNavigationCore.captureFrame({
          cameraRef: cameraRef.current,
          compressionQuality: 0.4,
          forceFallback: navigationCorePath !== "native-core",
          maxDimension: 768,
        });
      } catch (captureError) {
        const captureErrorMessage =
          captureError instanceof Error ? captureError.message : "Guide Pup could not capture a frame.";

        if (navigationCorePath === "native-core" && cameraRef.current) {
          if (mode === "guidance") {
            setNavigationCorePath("js-fallback");
            await refreshNavigationCoreState({
              executionPath: "js-fallback",
              lastError: captureErrorMessage,
              sessionActive: true,
            });
          }

          frame = await GuidePupNavigationCore.captureFrame({
            cameraRef: cameraRef.current,
            compressionQuality: 0.4,
            forceFallback: true,
            maxDimension: 768,
          });
        } else if (navigationCorePath === "native-core") {
          if (mode === "guidance") {
            setNavigationCorePath("js-fallback");
            await refreshNavigationCoreState({
              executionPath: "js-fallback",
              lastError: captureErrorMessage,
              sessionActive: true,
            });
          } else if (!isSpeakingRef.current) {
            speakCommandResponse("I could not describe the scene right now. Guidance settings are unchanged.");
          }
          return;
        } else {
          throw captureError;
        }
      }

      if (mode === "guidance") {
        await refreshNavigationCoreState({
          executionPath: frame.executionPath,
          lastCaptureLatencyMs: frame.captureLatencyMs,
          lastError: null,
          sessionActive: true,
        });
      }

      const result = await GuideAI.analyzeWithVision(frame, {
        detail: settings.descriptionMode === "detailed" ? "high" : "low",
        frameId: `${guidanceSessionIdRef.current}-${(frameSequenceRef.current += 1)}`,
        priorGuidance: lastSpokenMessageRef.current,
        sessionId: guidanceSessionIdRef.current,
      });

      if (!guidingRef.current || !result) {
        return;
      }

      if (mode === "guidance") {
        setDirection(result);

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

      const spokenGuidance = mode === "scene-query"
        ? result.sceneDescription || result.message
        : result.message;

      if (spokenGuidance && !isSpeakingRef.current) {
        const canListenForStopBargeIn =
          mode === "guidance" &&
          result.direction !== "stop" &&
          !result.obstacle &&
          !/\b(stop|pause)\b/i.test(spokenGuidance);
        lastSpokenMessageRef.current = spokenGuidance;
        speakCommandResponse(spokenGuidance, undefined, {
          keepListeningDuringSpeech: canListenForStopBargeIn,
        });
      }

      const hapticType: GuidePupNavigationCoreHapticType =
        result.obstacle || result.direction === "stop"
          ? "stop"
          : result.direction === "turn-left"
            ? "left"
            : result.direction === "turn-right"
              ? "right"
              : "forward";

      if (mode === "guidance" && settings.hapticsEnabled) {
        await GuidePupNavigationCore.playHaptic(hapticType);
      }

      if (mode === "guidance" && (result.obstacle || result.direction === "stop") && result.message) {
        void GuidePupNavigationCore.announce(result.message);
      }

      if (mode === "guidance") {
        await refreshNavigationCoreState({
          executionPath: frame.executionPath,
          lastCaptureLatencyMs: frame.captureLatencyMs,
          lastError: null,
          lastTotalGuidanceLoopLatencyMs: Date.now() - loopStartedAt,
          sessionActive: true,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const failureClass = classifyAnalyzeError(errorMessage);
      const sceneQueryFallback = "I could not describe the scene right now. Guidance settings are unchanged.";

      if (mode === "scene-query") {
        if (!isSpeakingRef.current) {
          lastSpokenMessageRef.current = sceneQueryFallback;
          speakCommandResponse(sceneQueryFallback);
        }
        void captureAppError(error, {
          screen: "NavigationScreen",
          stage: "analyzeCurrentFrame.sceneQuery",
        });
        return;
      }

      const fallbackMessage =
        failureClass === "timeout"
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
          failureClass === "timeout"
            ? "Backend timeout"
            : failureClass === "unauthorized"
              ? "Session expired"
              : failureClass === "invalid-response"
                ? "Invalid backend response"
              : "Backend unavailable",
      });
      setDirection(null);
      if (!isSpeakingRef.current) {
        lastSpokenMessageRef.current = fallbackMessage;
        speakCommandResponse(fallbackMessage);
      }
      void GuidePupNavigationCore.announce(fallbackMessage);
      void refreshNavigationCoreState({
        lastError: errorMessage,
        lastTotalGuidanceLoopLatencyMs: Date.now() - loopStartedAt,
        sessionActive: guidingRef.current,
      });

      void captureAppError(error, {
        screen: "NavigationScreen",
        stage: "analyzeCurrentFrame",
      });
    } finally {
      analyzingRef.current = false;
    }
  }, [
    navigationCorePath,
    refreshNavigationCoreState,
    settings.descriptionMode,
    settings.hapticsEnabled,
    speakCommandResponse,
  ]);

  useEffect(() => {
    const recognitionSubscription = GuidePupVoiceControl.addRecognitionListener(({ isFinal, transcript }) => {
      const normalizedTranscript = transcript.trim().toLowerCase();
      const nowMs = Date.now();
      if (!normalizedTranscript || isRecentDuplicateTranscript(normalizedTranscript, lastHandledTranscriptRef.current, nowMs)) {
        return;
      }

      const intent = parseVoiceCommand(normalizedTranscript);
      const conversationIntent = intent ? null : parseConversationPrompt(normalizedTranscript);
      const recentlyHandledStop = Date.now() - lastStopHandledAtRef.current < 2000;

      if (!isFinal) {
        if (isStopBargeInCommand(normalizedTranscript) && guidingRef.current && !recentlyHandledStop) {
          lastStopHandledAtRef.current = Date.now();
          lastHandledTranscriptRef.current = {
            normalizedTranscript,
            timestampMs: nowMs,
          };
          stopVoice();
          pauseGuidanceForVoice();
          if (settings.hapticsEnabled) {
            void GuidePupNavigationCore.playHaptic("stop");
          }
          speakCommandResponse("Guidance paused. Say start guidance to resume.");
          recordVoiceSnapshot({
            executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
            lastRecognizedCommand: "stop-guidance-partial",
          });
        }
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
        lastRecognizedCommand: intent ?? conversationIntent ?? "unsupported",
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
          resumeGuidanceForVoice();
          if (permission?.granted) {
            void analyzeCurrentFrame();
          }
          return;
        case "stop-guidance":
          if (!guidingRef.current) {
            speakCommandResponse("Guidance is already paused.");
            return;
          }
          lastStopHandledAtRef.current = Date.now();
          stopVoice();
          pauseGuidanceForVoice();
          if (settings.hapticsEnabled) {
            void GuidePupNavigationCore.playHaptic("stop");
          }
          speakCommandResponse("Guidance paused. Say start guidance to resume.");
          return;
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
          updateSpeechRate(nextRate);
          speakCommandResponse(
            nextRate === settings.speechRate
              ? `Speech rate is already ${describeSpeechRate(nextRate)}.`
              : `Speech rate set to ${describeSpeechRate(nextRate)}. Say faster speech to undo.`,
            nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9,
          );
          return;
        }
        case "faster-speech": {
          const nextRate = fasterSpeechRate(settings.speechRate);
          updateSpeechRate(nextRate);
          speakCommandResponse(
            nextRate === settings.speechRate
              ? `Speech rate is already ${describeSpeechRate(nextRate)}.`
              : `Speech rate set to ${describeSpeechRate(nextRate)}. Say slower speech to undo.`,
            nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9,
          );
          return;
        }
        case "more-detail":
          updateDescriptionMode("detailed");
          speakCommandResponse(
            settings.descriptionMode === "detailed"
              ? "Detail level is already detailed."
              : "Detail level set to detailed. Say less detail to undo.",
          );
          return;
        case "less-detail":
          updateDescriptionMode("short");
          speakCommandResponse(
            settings.descriptionMode === "short"
              ? "Detail level is already short."
              : "Detail level set to short. Say more detail to undo.",
          );
          return;
        case "haptics-on":
          updateHapticsEnabled(true);
          if (!settings.hapticsEnabled) {
            void GuidePupNavigationCore.playHaptic("success");
          }
          speakCommandResponse(
            settings.hapticsEnabled
              ? `Haptics are already ${describeHaptics(true)}.`
              : "Haptics turned on. Say haptics off to undo.",
          );
          return;
        case "haptics-off":
          updateHapticsEnabled(false);
          speakCommandResponse(
            settings.hapticsEnabled
              ? "Haptics turned off. Say haptics on to undo."
              : `Haptics are already ${describeHaptics(false)}.`,
          );
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
    });

    const stateSubscription = GuidePupVoiceControl.addStateListener((state) => {
      recordVoiceSnapshot({
        available: GuidePupVoiceControl.isNativeModuleAvailable(),
        executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
        lastError: state.lastError ?? undefined,
        listening: state.listening,
        microphonePermission: state.microphonePermission,
        speechPermission: state.speechPermission,
      });
    });

    void startVoiceSession();
    void syncVoiceState();

    return () => {
      recognitionSubscription.remove();
      stateSubscription.remove();
      void GuidePupVoiceControl.stopCommandSession();
    };
  }, [
    analyzeCurrentFrame,
    direction?.sceneDescription,
    permission?.granted,
    resumeGuidanceForVoice,
    settings,
    speakCommandResponse,
    startVoiceSession,
    syncVoiceState,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
    stopVoice,
  ]);

  useEffect(() => {
    if (!isGuiding || !permission?.granted) {
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
  }, [analyzeCurrentFrame, isGuiding, permission?.granted]);

  const handleStop = useCallback(() => {
    setIsGuiding(false);
    guidingRef.current = false;
    hasAnnouncedStartRef.current = false;
    setDirection(null);
    setGuidanceStatus({
      detail: "Guide Pup is paused. Return when you are ready to continue.",
      tone: "neutral",
      title: "Guidance stopped",
    });
    lastSpokenMessageRef.current = "Stopping guidance.";
    stopVoice();
    speak("Stopping guidance.");
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("success");
    }
    void GuidePupNavigationCore.announce("Stopping guidance.");

    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      router.replace("/");
    }
  }, [navigation, router, settings.hapticsEnabled, speak, stopVoice]);

  const handleSOS = useCallback(() => {
    const sosMessage = "SOS shortcut is not connected in this build. Use your phone emergency shortcut if you need help.";
    lastSpokenMessageRef.current = sosMessage;
    speak(sosMessage);
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("error");
    }
    void GuidePupNavigationCore.announce(sosMessage);
  }, [settings.hapticsEnabled, speak]);

  const canOpenCameraSettings = typeof Linking.openSettings === "function" && Platform.OS !== "web";

  const openCameraSettings = useCallback(() => {
    if (typeof Linking.openSettings === "function") {
      void Linking.openSettings();
    }
  }, []);

  return (
    <View style={styles.container}>
      {permission?.granted && navigationCorePath !== "native-core" ? (
        <CameraView
          ref={cameraRef}
          style={styles.hiddenCamera}
          facing="back"
          enableTorch={false}
        />
      ) : null}

      <SafeAreaView style={styles.safeArea}>
        {permission?.granted ? (
          <Pressable
            onLongPress={handleSOS}
            onPress={handleStop}
            style={styles.touchable}
            accessibilityLabel="Navigation screen"
            accessibilityHint="Tap to stop guidance. Long press for SOS."
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
    height: 1,
    opacity: 0,
    position: "absolute",
    width: 1,
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
