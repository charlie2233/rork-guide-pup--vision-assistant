import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';

import { recordStopBargeInSnapshot, recordVoiceSnapshot } from "@/src/lib/diagnostics";
import { canKeepListeningForStopBargeInDuringSpeech } from "@/src/lib/voiceCommands";
import { GuidePupVoiceControl } from "@/src/native/GuidePupVoiceControl";
import { useSettings } from "@/src/providers/SettingsProvider";

interface VoiceContextType {
  speak: (text: string, options?: { keepListeningDuringSpeech?: boolean; language?: string; rate?: number }) => void;
  stop: () => void;
  isSpeaking: boolean;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const { getSpeechRateValue } = useSettings();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef<{ keepListeningDuringSpeech?: boolean; locale?: string; rate?: number } | undefined>(undefined);
  const sessionRef = useRef(0);

  const flushQueue = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (queueRef.current.length === 0) {
      return;
    }

    const combinedMessage = queueRef.current.join('. ');
    queueRef.current = [];
    const speechOptions = optionsRef.current;
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    void (async () => {
      const voiceState = await GuidePupVoiceControl.getState().catch(() => null);
      const keepListeningDuringSpeech = Boolean(speechOptions?.keepListeningDuringSpeech)
        && canKeepListeningForStopBargeInDuringSpeech(combinedMessage);
      const shouldResumeListening = Boolean(voiceState?.listening);
      const shouldPauseListening = shouldResumeListening && !keepListeningDuringSpeech;

      if (shouldPauseListening) {
        const stoppedState = await GuidePupVoiceControl.stopCommandSession().catch(() => null);
        recordVoiceSnapshot({
          listening: stoppedState?.listening ?? false,
          speaking: stoppedState?.speaking ?? false,
        });
      }

      setIsSpeaking(true);
      recordVoiceSnapshot({
        listening: shouldPauseListening ? false : voiceState?.listening,
        speaking: true,
        speechListeningOverlapReason: keepListeningDuringSpeech ? "stop-barge-in" : undefined,
      });
      if (keepListeningDuringSpeech) {
        recordStopBargeInSnapshot({
          armedAt: Date.now(),
          armedDuringSpeech: true,
        });
      }

      await GuidePupVoiceControl.speak(combinedMessage, {
        interrupt: true,
        locale: speechOptions?.locale,
        rate: speechOptions?.rate ?? getSpeechRateValue(),
      }).catch(() => undefined);

      if (shouldPauseListening && sessionRef.current === sessionId) {
        const resumedState = await GuidePupVoiceControl.startCommandSession({
          partialResults: true,
        }).catch(() => null);
        if (resumedState) {
          recordVoiceSnapshot({
            listening: resumedState.listening,
            speaking: resumedState.speaking,
          });
        }
      }
    })().finally(() => {
      if (sessionRef.current === sessionId) {
        setIsSpeaking(false);
        recordVoiceSnapshot({
          speaking: false,
        });
      }
    });
  }, [getSpeechRateValue]);

  const speak = useCallback((text: string, options?: { keepListeningDuringSpeech?: boolean; language?: string; rate?: number }) => {
    // Add to queue
    queueRef.current.push(text);
    optionsRef.current = options
      ? {
          locale: options.language,
          keepListeningDuringSpeech: options.keepListeningDuringSpeech,
          rate: options.rate,
        }
      : undefined;

    // Clear existing timeout to batch calls
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set timeout to speak queued messages
    timeoutRef.current = setTimeout(flushQueue, 300); // 300ms debounce to gather all messages
  }, [flushQueue]);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    queueRef.current = [];
    void GuidePupVoiceControl.stopSpeaking();
    sessionRef.current += 1; // invalidate any in-flight callbacks
    setIsSpeaking(false);
    recordVoiceSnapshot({
      speaking: false,
    });
  }, []);

  return (
    <VoiceContext.Provider value={{ speak, stop, isSpeaking }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}

interface VoiceAnnouncerProps {
  message?: string;
  trigger?: any; // Change in this prop triggers announcement
}

export function VoiceAnnouncer({ message, trigger }: VoiceAnnouncerProps) {
  const { speak } = useVoice();

  useEffect(() => {
    if (message) {
      speak(message);
    }
  }, [message, trigger, speak]);

  return null;
}
