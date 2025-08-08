import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings } from "@shared/schema";

interface SpeechSynthesisHook {
  speak: (text: string) => void;
  isSpeaking: boolean;
  isSupported: boolean;
  cancel: () => void;
}

export function useSpeechSynthesis(): SpeechSynthesisHook {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const isSupported = 'speechSynthesis' in window;

  const speak = useCallback((text: string) => {
    if (!isSupported || !settings?.voiceResponseEnabled) {
      return;
    }

    // Cancel any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    
    // Set voice properties
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  }, [isSupported, settings?.voiceResponseEnabled]);

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [isSupported]);

  return {
    speak,
    isSpeaking,
    isSupported,
    cancel,
  };
}
