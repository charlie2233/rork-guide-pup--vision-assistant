import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as Speech from 'expo-speech';

interface VoiceContextType {
  speak: (text: string, options?: Speech.SpeechOptions) => void;
  stop: () => void;
  isSpeaking: boolean;
}

const VoiceContext = createContext<VoiceContextType | undefined>(undefined);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = (text: string, options?: Speech.SpeechOptions) => {
    Speech.speak(text, {
      ...options,
      onStart: () => setIsSpeaking(true),
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  };

  const stop = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

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
