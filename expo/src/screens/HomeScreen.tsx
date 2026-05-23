import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVoice } from '@/src/components/VoiceAnnouncer';
import { useSettings } from '@/src/providers/SettingsProvider';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGuidePupRouter } from '@/src/lib/router';
import { recordVoiceSnapshot } from '@/src/lib/diagnostics';
import { parseConversationPrompt } from '@/src/lib/voiceConversation';
import {
  buildVoiceHelpPrompt,
  isRecentDuplicateTranscript,
  normalizeVoiceTranscript,
  parseVoiceCommand,
  type GuidePupHandledTranscript,
} from '@/src/lib/voiceCommands';
import { buildVoiceStatusSummary, describeHaptics, describeSpeechRate, fasterSpeechRate, slowerSpeechRate } from '@/src/lib/voiceSettings';
import { GuidePupNavigationCore } from '@/src/native/GuidePupNavigationCore';
import { GuidePupVoiceControl } from '@/src/native/GuidePupVoiceControl';

export default function HomeScreen() {
  const router = useGuidePupRouter();
  const { speak } = useVoice();
  const {
    isReady,
    settings,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  } = useSettings();
  const lastHandledTranscriptRef = useRef<GuidePupHandledTranscript | null>(null);
  const lastSpokenMessageRef = useRef("Guide Pup is ready. Say start guidance to begin, or say help for commands.");
  const resumeListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      speaking: state.speaking,
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
          ? "Microphone and speech recognition permissions are required for hands-free commands. You can still use the buttons."
          : permissions.microphone !== "granted"
            ? "Microphone permission is required for hands-free commands. You can still use the buttons."
            : "Speech recognition permission is required for hands-free commands. You can still use the buttons.";
        lastSpokenMessageRef.current = permissionMessage;
        recordVoiceSnapshot({
          lastError: permissionMessage,
          listening: false,
        });
        await GuidePupVoiceControl.speak(permissionMessage, {
          interrupt: true,
        }).catch(() => speak(permissionMessage));
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
          speaking: state.speaking,
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

  const speakVoiceResponse = useCallback(async (
    message: string,
    haptic: "success" | "stop" | null = "success",
    rateOverride?: number,
  ) => {
    lastSpokenMessageRef.current = message;
    if (resumeListeningTimerRef.current) {
      clearTimeout(resumeListeningTimerRef.current);
      resumeListeningTimerRef.current = null;
    }

    await GuidePupVoiceControl.stopCommandSession().catch(() => undefined);
    recordVoiceSnapshot({
      listening: false,
    });

    if (settings.hapticsEnabled && haptic) {
      await GuidePupNavigationCore.playHaptic(haptic).catch(() => undefined);
    }
    if (haptic) {
      void GuidePupNavigationCore.playAudioCue(haptic);
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

    resumeListeningTimerRef.current = setTimeout(() => {
      void startVoiceSession();
    }, 600);
  }, [settings.hapticsEnabled, settings.speechRate, startVoiceSession]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (!settings.hasCompletedOnboarding) {
      router.replace('/onboarding' as never);
      return;
    }

    void speakVoiceResponse(
      "Guide Pup is ready. Say start guidance to begin, or say help for commands.",
      null,
    );

    return () => {
      if (resumeListeningTimerRef.current) {
        clearTimeout(resumeListeningTimerRef.current);
      }
      void GuidePupVoiceControl.stopCommandSession();
    };
  }, [isReady, router, settings.hasCompletedOnboarding, speakVoiceResponse]);

  useEffect(() => {
    const recognitionSubscription = GuidePupVoiceControl.addRecognitionListener(({ isFinal, transcript }) => {
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
          void speakVoiceResponse("Guidance starting. Say stop guidance any time to pause.", "success");
          router.push('/navigation' as never);
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
          updateSpeechRate(nextRate);
          void speakVoiceResponse(
            nextRate === settings.speechRate
              ? `Speech rate is already ${describeSpeechRate(nextRate)}.`
              : `Speech rate set to ${describeSpeechRate(nextRate)}. Say faster speech to undo.`,
            "success",
            nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9,
          );
          return;
        }
        case "faster-speech": {
          const nextRate = fasterSpeechRate(settings.speechRate);
          updateSpeechRate(nextRate);
          void speakVoiceResponse(
            nextRate === settings.speechRate
              ? `Speech rate is already ${describeSpeechRate(nextRate)}.`
              : `Speech rate set to ${describeSpeechRate(nextRate)}. Say slower speech to undo.`,
            "success",
            nextRate === "slow" ? 0.7 : nextRate === "fast" ? 1.2 : 0.9,
          );
          return;
        }
        case "more-detail":
          updateDescriptionMode("detailed");
          void speakVoiceResponse(
            settings.descriptionMode === "detailed"
              ? "Detail level is already detailed."
              : "Detail level set to detailed. Say less detail to undo.",
            "success",
          );
          return;
        case "less-detail":
          updateDescriptionMode("short");
          void speakVoiceResponse(
            settings.descriptionMode === "short"
              ? "Detail level is already short."
              : "Detail level set to short. Say more detail to undo.",
            "success",
          );
          return;
        case "haptics-on":
          updateHapticsEnabled(true);
          void speakVoiceResponse(
            settings.hapticsEnabled
              ? `Haptics are already ${describeHaptics(true)}.`
              : "Haptics turned on. Say haptics off to undo.",
            "success",
          );
          return;
        case "haptics-off":
          updateHapticsEnabled(false);
          void speakVoiceResponse(
            settings.hapticsEnabled
              ? "Haptics turned off. Say haptics on to undo."
              : `Haptics are already ${describeHaptics(false)}.`,
            null,
          );
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
        speaking: state.speaking,
        speechPermission: state.speechPermission,
      });
    });

    void syncVoiceState();

    return () => {
      recognitionSubscription.remove();
      stateSubscription.remove();
    };
  }, [
    router,
    settings,
    speakVoiceResponse,
    syncVoiceState,
    updateDescriptionMode,
    updateHapticsEnabled,
    updateSpeechRate,
  ]);

  const handlePress = () => {
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("success");
    }
    void GuidePupNavigationCore.playAudioCue("success");
    speak("Guidance started.");
    router.push('/navigation' as never);
  };

  const handleLongPress = () => {
    if (settings.hapticsEnabled) {
      void GuidePupNavigationCore.playHaptic("error");
    }
    void GuidePupNavigationCore.playAudioCue("error");
    speak("SOS shortcut is not connected in this build. Use your phone emergency shortcut if you need help.");
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
          onLongPress={handleLongPress}
          activeOpacity={0.8}
          accessibilityLabel="Start Guidance"
          accessibilityRole="button"
          accessibilityHint="Double tap to start guidance. Long press for SOS."
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
