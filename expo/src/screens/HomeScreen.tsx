import React, { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { type SpeechRate, useSettings } from '@/src/providers/SettingsProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGuidePupRouter } from '@/src/lib/router';
import { recordVoiceSnapshot } from '@/src/lib/diagnostics';
import {
  releaseOwnedAnnouncementOwner,
  startOwnedVoiceSession,
  stopOwnedVoiceSession,
} from '@/src/lib/ownedVoiceSession';
import { parseConversationPrompt } from '@/src/lib/voiceConversation';
import {
  buildVoiceHelpPrompt,
  isRecentDuplicateTranscript,
  normalizeVoiceTranscript,
  parseVoiceCommand,
  type GuidePupHandledTranscript,
} from '@/src/lib/voiceCommands';
import { buildVoiceStatusSummary, describeHaptics, describeSpeechRate, fasterSpeechRate, slowerSpeechRate } from '@/src/lib/voiceSettings';
import { settleCurrentAnnouncementDelivery } from '@/src/lib/runtimeSafety';
import {
  createGuidePupAnnouncementOwnerToken,
  GuidePupNavigationCore,
} from '@/src/native/GuidePupNavigationCore';
import {
  createGuidePupVoiceSessionOwnerToken,
  GuidePupVoiceControl,
} from '@/src/native/GuidePupVoiceControl';

type VoiceOverState = "disabled" | "enabled" | "unknown";

export default function HomeScreen() {
  const router = useGuidePupRouter();
  const { stop: stopVoice } = useVoice();
  const {
    isReady,
    settings,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  } = useSettings();
  const lastHandledTranscriptRef = useRef<GuidePupHandledTranscript | null>(null);
  const lastSpokenMessageRef = useRef("Guide Pup is ready. Say start guidance to begin, or say help for commands.");
  const hasAnnouncedReadyPromptRef = useRef(false);
  const isFocusedRef = useRef(false);
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRecoveryExhaustedHandledRef = useRef(false);
  const voiceResponseGenerationRef = useRef(0);
  const announcementOwnerTokenRef = useRef<string | null>(null);
  const listeningCueOwnerTokenRef = useRef<string | null>(null);
  const voiceSessionAttemptGenerationRef = useRef(0);
  const voiceSessionOwnerTokenRef = useRef<string | null>(null);
  const voiceOverResolutionRef = useRef<Promise<VoiceOverState> | null>(null);
  const voiceOverStateRef = useRef<VoiceOverState>("unknown");

  const resolveVoiceOverState = useCallback(() => {
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

  useEffect(() => {
    let isActive = true;
    void resolveVoiceOverState().then((state) => {
      if (isActive) {
        voiceOverStateRef.current = state;
      }
    });

    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
      voiceResponseGenerationRef.current += 1;
      voiceOverStateRef.current = enabled ? "enabled" : "disabled";
      voiceOverResolutionRef.current = Promise.resolve(enabled ? "enabled" : "disabled");
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
  }, [resolveVoiceOverState, stopVoice]);

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
    const ownerToken = createGuidePupVoiceSessionOwnerToken("home");
    const attemptIsCurrent = () =>
      isFocusedRef.current
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
          ? "Microphone and speech recognition permissions are required for hands-free commands. You can still use the buttons."
          : permissions.microphone !== "granted"
            ? "Microphone permission is required for hands-free commands. You can still use the buttons."
            : "Speech recognition permission is required for hands-free commands. You can still use the buttons.";
        lastSpokenMessageRef.current = permissionMessage;
        recordVoiceSnapshot({
          lastError: permissionMessage,
          listening: false,
        });
        const voiceOverState = await resolveVoiceOverState();
        if (!attemptIsCurrent()) {
          return;
        }
        stopVoice();
        await GuidePupVoiceControl.stopSpeaking().catch(() => undefined);
        if (!isFocusedRef.current) {
          return;
        }
        const announcementOwnerToken = announcementOwnerTokenRef.current;
        if (!announcementOwnerToken) {
          return;
        }
        if (voiceOverState === "enabled") {
          await settleCurrentAnnouncementDelivery({
            deliver: () => GuidePupNavigationCore.announce(
              permissionMessage,
              announcementOwnerToken,
            ),
            interrupt: () => GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken),
            isCurrent: attemptIsCurrent,
          });
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
      if (
        state?.listening
        && voiceSessionOwnerTokenRef.current === ownerToken
        && attemptIsCurrent()
        && listeningCueOwnerTokenRef.current !== ownerToken
      ) {
        listeningCueOwnerTokenRef.current = ownerToken;
        await GuidePupNavigationCore.playAudioCue("success").catch(() => undefined);
      }
    } catch (error) {
      recordVoiceSnapshot({
        available: true,
        executionPath: "js-fallback",
        lastError: error instanceof Error ? error.message : "Unable to start voice control.",
        listening: false,
      });
    }
  }, [resolveVoiceOverState, stopVoice]);

  const speakVoiceResponse = useCallback(async (
    message: string,
    haptic: "success" | "stop" | null = "success",
    rateOverride?: number,
    options?: { resumeListening?: boolean },
  ) => {
    const responseGeneration = voiceResponseGenerationRef.current + 1;
    voiceResponseGenerationRef.current = responseGeneration;
    const responseIsCurrent = () =>
      isFocusedRef.current
      && voiceResponseGenerationRef.current === responseGeneration;
    lastSpokenMessageRef.current = message;
    if (!responseIsCurrent()) {
      return;
    }
    if (resumeListeningTimerRef.current) {
      clearTimeout(resumeListeningTimerRef.current);
      resumeListeningTimerRef.current = null;
    }

    await stopOwnedVoiceSession({
      ownerRef: voiceSessionOwnerTokenRef,
      stop: (ownerToken) => GuidePupVoiceControl.stopCommandSession({ ownerToken }),
    }).catch(() => undefined);
    if (!responseIsCurrent()) {
      return;
    }
    recordVoiceSnapshot({
      listening: false,
    });

    if (settings.hapticsEnabled && haptic) {
      await GuidePupNavigationCore.playHaptic(haptic).catch(() => undefined);
      if (!responseIsCurrent()) {
        return;
      }
    }
    if (haptic) {
      void GuidePupNavigationCore.playAudioCue(haptic);
    }

    const voiceOverState = await resolveVoiceOverState();
    if (!responseIsCurrent()) {
      return;
    }
    stopVoice();
    await GuidePupVoiceControl.stopSpeaking().catch(() => undefined);
    if (!responseIsCurrent()) {
      return;
    }
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    if (!announcementOwnerToken) {
      return;
    }
    if (voiceOverState === "enabled") {
      const announcementOutcome = await settleCurrentAnnouncementDelivery({
        deliver: () => GuidePupNavigationCore.announce(message, announcementOwnerToken),
        interrupt: () => GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken),
        isCurrent: responseIsCurrent,
      });
      if (announcementOutcome === "unsafe") {
        return;
      }
      if (announcementOutcome === "interrupted") {
        recordVoiceSnapshot({
          lastError: "VoiceOver announcement delivery failed and was interrupted.",
          listening: false,
          speaking: false,
        });
        if (settings.hapticsEnabled) {
          await GuidePupNavigationCore.playHaptic("error").catch(() => undefined);
          if (!responseIsCurrent()) {
            return;
          }
        }
        void GuidePupNavigationCore.playAudioCue("error");
      }
    } else {
      await GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken).catch(() => undefined);
      if (!responseIsCurrent()) {
        return;
      }
      await GuidePupVoiceControl.speak(message, {
        interrupt: true,
        rate: rateOverride ?? (
          settings.speechRate === "slow"
            ? 0.7
            : settings.speechRate === "fast"
              ? 1.2
              : 0.9
        ),
      }).catch(() => undefined);
    }

    if (options?.resumeListening === false || !responseIsCurrent()) {
      return;
    }

    resumeListeningTimerRef.current = setTimeout(() => {
      if (responseIsCurrent()) {
        void startVoiceSession();
      }
    }, 600);
  }, [resolveVoiceOverState, settings.hapticsEnabled, settings.speechRate, startVoiceSession, stopVoice]);

  const speakVoiceResponseRef = useRef(speakVoiceResponse);

  useEffect(() => {
    speakVoiceResponseRef.current = speakVoiceResponse;
  }, [speakVoiceResponse]);

  const announceSpeechRateResult = useCallback(async (input: {
    nextRate: SpeechRate;
    result: "already" | "failed" | "saved";
    undoCommand: "faster speech" | "slower speech";
  }) => {
    if (input.result === "failed") {
      await speakVoiceResponse(
        "I could not save the speech rate. The setting was not changed.",
        "stop",
      );
      return;
    }

    const voiceOverState = await resolveVoiceOverState();
    const rateDescription = describeSpeechRate(input.nextRate);
    const message = voiceOverState === "enabled"
      ? input.result === "already"
        ? `App speech rate is already saved as ${rateDescription} for when VoiceOver is off. VoiceOver controls its own speech rate.`
        : `App speech rate saved as ${rateDescription} for when VoiceOver is off. VoiceOver controls its own speech rate.`
      : input.result === "already"
        ? `Speech rate is already ${rateDescription}.`
        : `Speech rate set to ${rateDescription}. Say ${input.undoCommand} to undo.`;
    await speakVoiceResponse(
      message,
      input.result === "saved" ? "success" : null,
      input.nextRate === "slow" ? 0.7 : input.nextRate === "fast" ? 1.2 : 0.9,
    );
  }, [resolveVoiceOverState, speakVoiceResponse]);

  const startGuidanceFromHome = useCallback(() => {
    voiceResponseGenerationRef.current += 1;
    lastHandledTranscriptRef.current = null;
    lastSpokenMessageRef.current = "Guidance started. Analyzing your surroundings.";
    if (resumeListeningTimerRef.current) {
      clearTimeout(resumeListeningTimerRef.current);
      resumeListeningTimerRef.current = null;
    }

    stopVoice();
    void GuidePupVoiceControl.stopSpeaking();
    const announcementOwnerToken = announcementOwnerTokenRef.current;
    if (announcementOwnerToken) {
      void GuidePupNavigationCore.cancelAnnouncement(announcementOwnerToken);
    }
    void stopOwnedVoiceSession({
      ownerRef: voiceSessionOwnerTokenRef,
      stop: (ownerToken) => GuidePupVoiceControl.stopCommandSession({ ownerToken }),
    }).then((state) => {
      recordVoiceSnapshot({
        listening: state?.listening ?? false,
        speaking: state?.speaking ?? false,
      });
    }).catch(() => {
      recordVoiceSnapshot({
        listening: false,
      });
    });
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("success");
    }
    void GuidePupNavigationCore.playAudioCue("success");
    router.push('/navigation' as never);
  }, [router, settings.hapticsEnabled, stopVoice]);

  useFocusEffect(useCallback(() => {
    const announcementOwnerToken = createGuidePupAnnouncementOwnerToken("home-announcement");
    announcementOwnerTokenRef.current = announcementOwnerToken;
    void GuidePupNavigationCore.claimAnnouncementOwner(announcementOwnerToken);
    voiceRecoveryExhaustedHandledRef.current = false;
    isFocusedRef.current = true;
    if (isReady && settings.hasCompletedOnboarding && hasAnnouncedReadyPromptRef.current) {
      void startVoiceSession();
    }

    return () => {
      voiceResponseGenerationRef.current += 1;
      voiceSessionAttemptGenerationRef.current += 1;
      isFocusedRef.current = false;
      if (resumeListeningTimerRef.current) {
        clearTimeout(resumeListeningTimerRef.current);
        resumeListeningTimerRef.current = null;
      }
      stopVoice();
      void GuidePupVoiceControl.stopSpeaking();
      void releaseOwnedAnnouncementOwner({
        ownerRef: announcementOwnerTokenRef,
        release: (ownerToken) => GuidePupNavigationCore.releaseAnnouncementOwner(ownerToken),
      }).catch(() => {
        recordVoiceSnapshot({
          lastError: "VoiceOver announcement owner release could not be confirmed.",
        });
      });
      void stopOwnedVoiceSession({
        ownerRef: voiceSessionOwnerTokenRef,
        stop: (ownerToken) => GuidePupVoiceControl.stopCommandSession({ ownerToken }),
      });
    };
  }, [isReady, settings.hasCompletedOnboarding, startVoiceSession, stopVoice]));

  useEffect(() => {
    if (!isReady || !isFocusedRef.current) {
      return;
    }

    if (!settings.hasCompletedOnboarding) {
      hasAnnouncedReadyPromptRef.current = false;
      router.replace('/onboarding' as never);
      return;
    }

    if (!hasAnnouncedReadyPromptRef.current) {
      hasAnnouncedReadyPromptRef.current = true;
      void speakVoiceResponseRef.current(
        "Guide Pup is ready. Say start guidance to begin, or say help for commands.",
        null,
      );
    }
  }, [isReady, router, settings.hasCompletedOnboarding]);

  useFocusEffect(useCallback(() => {
    const recognitionSubscription = GuidePupVoiceControl.addRecognitionListener(({ isFinal, transcript }) => {
      if (!isFocusedRef.current) {
        return;
      }

      if (!isFinal) {
        return;
      }

      const normalizedTranscript = normalizeVoiceTranscript(transcript);
      const nowMs = Date.now();
      if (!normalizedTranscript || isRecentDuplicateTranscript(normalizedTranscript, lastHandledTranscriptRef.current, nowMs)) {
        return;
      }

      lastHandledTranscriptRef.current = {
        normalizedTranscript,
        timestampMs: nowMs,
      };
      const intent = parseVoiceCommand(normalizedTranscript);
      const conversationIntent = intent ? null : parseConversationPrompt(normalizedTranscript);

      recordVoiceSnapshot({
        executionPath: GuidePupVoiceControl.isNativeModuleAvailable() ? "native-voice" : "js-fallback",
        lastRecognizedAt: Date.now(),
        lastRecognizedCommand: intent ?? conversationIntent ?? "unsupported",
        lastRecognizedCommandPhase: "final",
      });

      if (conversationIntent === "what-do-you-see") {
        void speakVoiceResponse("Start guidance first, then ask what do you see.", "stop");
        return;
      }

      if (!intent) {
        void speakVoiceResponse("That command is not supported here. Say help for the available commands.", "stop");
        return;
      }

      switch (intent) {
        case "start-guidance":
          startGuidanceFromHome();
          return;
        case "stop-guidance":
          void speakVoiceResponse("Guidance is not running yet. Say start guidance when you are ready.", "stop");
          return;
        case "repeat":
          void speakVoiceResponse(lastSpokenMessageRef.current, null);
          return;
        case "help":
          void speakVoiceResponse(
            buildVoiceHelpPrompt(false, {
              conversationLaneEnabled: false,
            }),
            null,
          );
          return;
        case "slower-speech": {
          const nextRate = slowerSpeechRate(settings.speechRate);
          if (nextRate === settings.speechRate) {
            void announceSpeechRateResult({
              nextRate,
              result: "already",
              undoCommand: "faster speech",
            });
            return;
          }
          void updateSpeechRate(nextRate).then((saved) => announceSpeechRateResult({
            nextRate,
            result: saved ? "saved" : "failed",
            undoCommand: "faster speech",
          }));
          return;
        }
        case "faster-speech": {
          const nextRate = fasterSpeechRate(settings.speechRate);
          if (nextRate === settings.speechRate) {
            void announceSpeechRateResult({
              nextRate,
              result: "already",
              undoCommand: "slower speech",
            });
            return;
          }
          void updateSpeechRate(nextRate).then((saved) => announceSpeechRateResult({
            nextRate,
            result: saved ? "saved" : "failed",
            undoCommand: "slower speech",
          }));
          return;
        }
        case "more-detail":
          if (settings.descriptionMode === "detailed") {
            void speakVoiceResponse("Detail level is already detailed.", null);
            return;
          }
          void updateDescriptionMode("detailed").then((saved) => speakVoiceResponse(
            saved
              ? "Detail level set to detailed. Say less detail to undo."
              : "I could not save the detail level. The setting was not changed.",
            saved ? "success" : "stop",
          ));
          return;
        case "less-detail":
          if (settings.descriptionMode === "short") {
            void speakVoiceResponse("Detail level is already short.", null);
            return;
          }
          void updateDescriptionMode("short").then((saved) => speakVoiceResponse(
            saved
              ? "Detail level set to short. Say more detail to undo."
              : "I could not save the detail level. The setting was not changed.",
            saved ? "success" : "stop",
          ));
          return;
        case "haptics-on":
          if (settings.hapticsEnabled) {
            void speakVoiceResponse(`Haptics are already ${describeHaptics(true)}.`, null);
            return;
          }
          void updateHapticsEnabled(true).then(async (saved) => {
            if (saved) {
              await GuidePupNavigationCore.playHaptic("success").catch(() => undefined);
            }
            return speakVoiceResponse(
              saved
                ? "Haptics turned on. Say haptics off to undo."
                : "I could not save the haptics setting. The setting was not changed.",
              saved ? "success" : "stop",
            );
          });
          return;
        case "haptics-off":
          if (!settings.hapticsEnabled) {
            void speakVoiceResponse(`Haptics are already ${describeHaptics(false)}.`, null);
            return;
          }
          void updateHapticsEnabled(false).then((saved) => speakVoiceResponse(
            saved
              ? "Haptics turned off. Say haptics on to undo."
              : "I could not save the haptics setting. The setting was not changed.",
            saved ? null : "stop",
          ));
          return;
        case "status":
          void speakVoiceResponse(
            buildVoiceStatusSummary({
              conversationLaneEnabled: false,
              isGuiding: false,
              settings,
              voiceControlAvailable: GuidePupVoiceControl.isNativeModuleAvailable(),
            }),
            null,
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
        recoveryState: state.recoveryState,
        speaking: state.speaking,
        speechPermission: state.speechPermission,
        voiceProcessingEnabled: state.voiceProcessingEnabled,
      });

      if (state.recoveryState !== "exhausted") {
        if (state.recoveryState === "idle" && state.listening) {
          voiceRecoveryExhaustedHandledRef.current = false;
        }
        return;
      }
      if (voiceRecoveryExhaustedHandledRef.current || !isFocusedRef.current) {
        return;
      }

      voiceRecoveryExhaustedHandledRef.current = true;
      void speakVoiceResponse(
        "Voice control could not recover. Use the large Start Guidance button with VoiceOver, or try again after returning to this screen.",
        "stop",
        undefined,
        { resumeListening: false },
      );
    });

    void syncVoiceState();

    return () => {
      recognitionSubscription.remove();
      stateSubscription.remove();
    };
  }, [
    announceSpeechRateResult,
    router,
    settings,
    speakVoiceResponse,
    startGuidanceFromHome,
    syncVoiceState,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  ]));

  const handlePress = () => {
    startGuidanceFromHome();
  };

  const handleOpenSettings = () => {
    router.push('/settings' as never);
  };

  if (!isReady || !settings.hasCompletedOnboarding) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.button}
          onPress={handlePress}
          activeOpacity={0.8}
          accessibilityLabel="Start Guidance"
          accessibilityRole="button"
          accessibilityHint="Double tap to start guidance."
          testID="home-start-guidance"
        >
          <Text style={styles.text}>Start Guidance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleOpenSettings}
          activeOpacity={0.8}
          accessibilityLabel="Open Settings"
          accessibilityRole="button"
          accessibilityHint="Double tap to adjust speech and guidance settings."
        >
          <Text style={styles.secondaryText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  button: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  secondaryButton: {
    borderColor: '#333333',
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 24,
    paddingVertical: 18,
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
});
