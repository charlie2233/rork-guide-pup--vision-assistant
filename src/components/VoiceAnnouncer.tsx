import React, { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react';
import * as Speech from 'expo-speech';

interface VoiceContextType {
  speak: (text: string, options?: Speech.SpeechOptions) => void;
  stop: () => void;
  isSpeaking: boolean;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const queueRef = useRef<string[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef<Speech.SpeechOptions | undefined>(undefined);
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
    const sessionId = sessionRef.current + 1;
    sessionRef.current = sessionId;

    // Stop any ongoing speech so the new batch starts immediately.
    Speech.stop();
    setIsSpeaking(true);

    Speech.speak(combinedMessage, {
      ...optionsRef.current,
      onStart: () => setIsSpeaking(true),
      onDone: () => {
        if (sessionRef.current === sessionId) setIsSpeaking(false);
      },
      onStopped: () => {
        if (sessionRef.current === sessionId) setIsSpeaking(false);
      },
      onError: () => {
        if (sessionRef.current === sessionId) setIsSpeaking(false);
      },
    });
  }, []);

  const speak = useCallback((text: string, options?: Speech.SpeechOptions) => {
    // Add to queue
    queueRef.current.push(text);
    if (options) {
      optionsRef.current = options;
    }

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
    Speech.stop();
    sessionRef.current += 1; // invalidate any in-flight callbacks
    setIsSpeaking(false);
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
