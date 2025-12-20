
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { Settings } from "@shared/schema";
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from "@/types/speech";

/**
 * Interface for the speech recognition hook return values
 * Provides all necessary methods and state for voice interaction
 */
interface SpeechRecognitionHook {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  startListening: () => void;
  stopListening: () => void;
  mode: "log" | "query" | null;
  setMode: (mode: "log" | "query" | null) => void;
  lastResponse: string;
  setManualCategory: (category: string | null) => void;
  submitText: (text: string, textMode: "log" | "query") => Promise<void>;
  isProcessing: boolean;
}

/**
 * Custom hook for managing speech recognition functionality with AI-powered free-form input
 * No longer requires templates - all metadata extraction is handled by AI
 * 
 * Features:
 * - Browser compatibility checking
 * - Automatic memory cleanup on unmount
 * - Error handling for speech recognition failures
 * - AI-powered metadata extraction
 * - Real-time transcript updates
 * - Hybrid semantic search
 */
export function useSpeechRecognition(): SpeechRecognitionHook {
  // State management for speech recognition
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [mode, setModeState] = useState<"log" | "query" | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [lastResponse, setLastResponse] = useState("");
  const [manualCategory, setManualCategory] = useState<string | null>(null);

  // Use refs to prevent memory leaks and ensure proper cleanup
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const modeRef = useRef<"log" | "query" | null>(null);

  // Helper to update both mode state and ref (fixes React closure issue)
  const setMode = useCallback((newMode: "log" | "query" | null) => {
    modeRef.current = newMode;
    setModeState(newMode);
  }, []);

  const queryClient = useQueryClient();
  const { speak } = useSpeechSynthesis();

  // Query for application settings with error handling
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation for saving memories with AI extraction or manual category
  const saveMutation = useMutation({
    mutationFn: async (memoryText: string) => {
      const body: { memoryText: string; topicTag?: string } = { memoryText };
      
      // Include topicTag if user manually selected a category
      if (manualCategory) {
        body.topicTag = manualCategory;
      } else {
        // Check session storage for session category
        const sessionCategory = sessionStorage.getItem("helix_session_category");
        if (sessionCategory) {
          body.topicTag = sessionCategory;
        }
      }
      
      const response = await apiRequest("POST", "/api/memories", body);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });

      isProcessingRef.current = false;

      const successMessage = `Memory saved as ${data.data.topicTag}`;
      setLastResponse(successMessage);

      setTimeout(() => {
        if (settings?.voiceResponseEnabled) {
          speak(successMessage);
        }
      }, 1000);
    },
    onError: (error) => {
      console.error('Failed to save memory:', error);
      isProcessingRef.current = false;

      const errorMessage = "Failed to save memory. Please try again.";
      setLastResponse(errorMessage);

      setTimeout(() => {
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    },
  });

  // Mutation for querying memories with hybrid search
  const searchMutation = useMutation({
    mutationFn: async (queryText: string) => {
      const response = await apiRequest("POST", "/api/memories/search", { queryText });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data) => {
      isProcessingRef.current = false;

      const results = data.data || [];
      let responseMessage = "";

      if (results.length === 0) {
        responseMessage = "No matching memories found.";
      } else if (results.length === 1) {
        const memory = results[0];
        responseMessage = `Found: ${memory.memoryText}`;
      } else {
        responseMessage = `Found ${results.length} matching memories. The most relevant is: ${results[0].memoryText}`;
      }

      setLastResponse(responseMessage);

      setTimeout(() => {
        if (settings?.voiceResponseEnabled) {
          speak(responseMessage);
        }
      }, 500);
    },
    onError: (error) => {
      console.error("Failed to search memories:", error);
      isProcessingRef.current = false;
      
      const errorMessage = "Failed to search memories. Please try again.";
      setLastResponse(errorMessage);

      setTimeout(() => {
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    },
  });

  // Check if speech recognition is supported in current browser
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  /**
   * Stop listening for voice commands with proper cleanup
   */
  const stopListening = useCallback((clearMode: boolean = false) => {
    try {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (recognition && isListening) {
        recognition.stop();
        setIsListening(false);
        if (clearMode) {
          modeRef.current = null;
          setModeState(null);
        }
        isProcessingRef.current = false;
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }, [recognition, isListening]);

  /**
   * Handle log command - save free-form voice input as memory
   */
  const handleLogCommand = useCallback(async (memoryText: string) => {
    try {
      if (!memoryText || memoryText.trim().length === 0) {
        throw new Error("No data provided for log command");
      }

      isProcessingRef.current = true;

      if (isListening) {
        stopListening(false);
      }

      await saveMutation.mutateAsync(memoryText.trim());
      setTranscript("");
      modeRef.current = null;
      setModeState(null);

    } catch (error) {
      console.error('Error handling log command:', error);
      isProcessingRef.current = false;

      if (isListening) {
        stopListening(false);
      }
      modeRef.current = null;
      setModeState(null);

      setTimeout(() => {
        const errorMessage = "Failed to log your command. Please try again.";
        setLastResponse(errorMessage);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    }
  }, [isListening, saveMutation, settings, speak, stopListening]);

  /**
   * Handle query command - search memories with hybrid search
   */
  const handleQueryCommand = useCallback(async (queryText: string) => {
    try {
      if (isListening) {
        stopListening(false);
      }

      const cleanQuery = queryText.replace(/^query\s+/i, '').trim();
      
      if (!cleanQuery) {
        const errorMessage = "Please provide a query.";
        setLastResponse(errorMessage);
        modeRef.current = null;
        setModeState(null);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
        return;
      }

      isProcessingRef.current = true;
      await searchMutation.mutateAsync(cleanQuery);
      setTranscript("");
      modeRef.current = null;
      setModeState(null);

    } catch (error) {
      console.error("Error handling query command:", error);
      isProcessingRef.current = false;
      modeRef.current = null;
      setModeState(null);

      setTimeout(() => {
        const errorMessage = "Failed to process your query. Please try again.";
        setLastResponse(errorMessage);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    }
  }, [isListening, searchMutation, settings, speak, stopListening]);

  /**
   * Process voice command based on current mode
   * Uses modeRef to avoid React closure issues with state
   */
  const handleCommand = useCallback(async (command: string) => {
    try {
      const currentMode = modeRef.current;
      
      if (!currentMode) {
        console.warn('No mode set, ignoring command');
        return;
      }

      if (currentMode === "log") {
        await handleLogCommand(command);
      } else if (currentMode === "query") {
        await handleQueryCommand(command);
      }
    } catch (error) {
      console.error('Error processing command:', error);
      isProcessingRef.current = false;
    }
  }, [handleLogCommand, handleQueryCommand]);

  /**
   * Process transcript when recognition ends
   */
  const processTranscript = useCallback((finalTranscript: string) => {
    try {
      if (!finalTranscript || finalTranscript.trim().length === 0) {
        return;
      }

      if (isProcessingRef.current) {
        return;
      }

      handleCommand(finalTranscript);

    } catch (error) {
      console.error('Error processing transcript:', error);
      isProcessingRef.current = false;
    }
  }, [handleCommand]);

  /**
   * Start listening for voice commands
   */
  const startListening = useCallback(() => {
    try {
      if (!isSupported) {
        console.error('Speech recognition not supported');
        return;
      }

      if (isListening) {
        return;
      }

      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const newRecognition = new SpeechRecognitionAPI() as SpeechRecognition;

      newRecognition.continuous = false;
      newRecognition.interimResults = true;
      newRecognition.lang = 'en-US';

      newRecognition.onstart = () => {
        setIsListening(true);
      };

      newRecognition.onresult = (event: SpeechRecognitionEvent) => {
        try {
          let interimTranscript = '';
          let finalTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          setTranscript(finalTranscript || interimTranscript);

          if (finalTranscript) {
            processTranscript(finalTranscript);
          }
        } catch (error) {
          console.error('Error processing speech results:', error);
        }
      };

      newRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          modeRef.current = null;
          setModeState(null);
          const errorMessage = "Voice recognition error. Please try again.";
          setLastResponse(errorMessage);
          if (settings?.voiceResponseEnabled) {
            speak(errorMessage);
          }
        }
      };

      newRecognition.onend = () => {
        setIsListening(false);
      };

      setRecognition(newRecognition);
      recognitionRef.current = newRecognition;
      newRecognition.start();

    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
    }
  }, [isSupported, isListening, processTranscript, settings, speak]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (error) {
          console.error('Error stopping recognition on unmount:', error);
        }
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  /**
   * Submit text directly (for typed input, bypassing voice)
   */
  const submitText = useCallback(async (text: string, textMode: "log" | "query") => {
    if (!text.trim()) return;
    
    if (textMode === "log") {
      await handleLogCommand(text.trim());
    } else {
      await handleQueryCommand(text.trim());
    }
  }, [handleLogCommand, handleQueryCommand]);

  return {
    isListening,
    isSupported,
    transcript,
    startListening,
    stopListening,
    mode,
    setMode,
    lastResponse,
    setManualCategory,
    submitText,
    isProcessing: isProcessingRef.current || saveMutation.isPending || searchMutation.isPending,
  };
}
