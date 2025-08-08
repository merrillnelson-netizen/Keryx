import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { parseVoiceCommand } from "@/lib/voice-parser";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { Template, Settings } from "@shared/schema";
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from "@/types/speech";

interface SpeechRecognitionHook {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  mode: "log" | "query" | null;
  setMode: (mode: "log" | "query" | null) => void;
  lastResponse: string;
}

export function useSpeechRecognition(): SpeechRecognitionHook {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<"log" | "query" | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [lastResponse, setLastResponse] = useState("");

  const queryClient = useQueryClient();
  const { speak } = useSpeechSynthesis();

  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
  });

  const logMutation = useMutation({
    mutationFn: (logEntry: any) => apiRequest("POST", "/api/logs", logEntry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
    },
  });

  const queryMutation = useMutation({
    mutationFn: (query: any) => apiRequest("POST", "/api/logs/query", query),
  });

  // Check if speech recognition is supported
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    const recognitionInstance = new SpeechRecognition();

    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'en-US';

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        processCommand(finalTranscript);
      }
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      let errorMessage = "Voice recognition error: ";
      
      switch (event.error) {
        case 'not-allowed':
          errorMessage += "Microphone access was denied. Please allow microphone permissions and try again.";
          break;
        case 'no-speech':
          errorMessage += "No speech was detected. Please try speaking again.";
          break;
        case 'audio-capture':
          errorMessage += "Audio capture failed. Please check your microphone.";
          break;
        case 'network':
          errorMessage += "Network error occurred. Please check your connection.";
          break;
        default:
          errorMessage += event.error;
      }
      
      setLastResponse(errorMessage);
      speak(errorMessage);
      setIsListening(false);
    };

    recognitionInstance.onend = () => {
      setIsListening(false);
    };

    setRecognition(recognitionInstance);

    return () => {
      if (recognitionInstance) {
        recognitionInstance.stop();
      }
    };
  }, [isSupported]);

  const processCommand = useCallback(async (command: string) => {
    if (!activeTemplate) {
      const response = "No active template found. Please select a template first.";
      setLastResponse(response);
      speak(response);
      return;
    }

    const activationPhrase = settings?.activationPhrase || "Hey M";
    
    // Check if command starts with activation phrase
    if (!command.toLowerCase().includes(activationPhrase.toLowerCase())) {
      return;
    }

    // Remove activation phrase and parse command
    const cleanCommand = command.replace(new RegExp(activationPhrase, 'gi'), '').trim();
    
    if (cleanCommand.toLowerCase().startsWith('log')) {
      await handleLogCommand(cleanCommand, activeTemplate);
    } else if (cleanCommand.toLowerCase().startsWith('query')) {
      await handleQueryCommand(cleanCommand, activeTemplate);
    }
  }, [activeTemplate, settings, logMutation, queryMutation, speak]);

  const handleLogCommand = async (command: string, template: Template) => {
    try {
      const parsedData = parseVoiceCommand(command, template, "log");
      
      await logMutation.mutateAsync({
        templateId: template.id,
        rawCommand: command,
        parsedData,
      });

      const response = `Logged: ${command}`;
      setLastResponse(response);
      speak(response);
    } catch (error) {
      const response = "Failed to log command. Please try again.";
      setLastResponse(response);
      speak(response);
    }
  };

  const handleQueryCommand = async (command: string, template: Template) => {
    try {
      const parsedQuery = parseVoiceCommand(command, template, "query");
      
      const result = await queryMutation.mutateAsync({
        templateId: template.id,
        query: parsedQuery,
      });

      // Process results and generate response
      const response = result ? "Found matching results" : "No results found";
      setLastResponse(response);
      speak(response);
    } catch (error) {
      const response = "Failed to process query. Please try again.";
      setLastResponse(response);
      speak(response);
    }
  };

  const startListening = useCallback(() => {
    if (!isSupported) {
      const message = "Speech recognition is not supported in this browser. Please try Chrome or Edge.";
      setLastResponse(message);
      console.error(message);
      return;
    }

    if (recognition && !isListening) {
      setTranscript("");
      setLastResponse("");
      
      try {
        recognition.start();
        setIsListening(true);
        console.log('Speech recognition started');
      } catch (error) {
        console.error('Failed to start speech recognition:', error);
        const message = "Could not start voice recognition. Please check microphone permissions.";
        setLastResponse(message);
        speak(message);
      }
    }
  }, [recognition, isListening, isSupported, speak]);

  const stopListening = useCallback(() => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
      setMode(null);
    }
  }, [recognition, isListening]);

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
    mode,
    setMode,
    lastResponse,
  };
}
