
import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { useGeolocation } from "./use-geolocation";
import { Settings } from "@shared/schema";
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from "@/types/speech";

/**
 * Saved memory data for calendar integration
 */
export interface SavedMemoryData {
  id?: string;
  memoryText: string;
  topicTag: string;
  lifePurposeTheme?: boolean;
}

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
  lastSavedMemory: SavedMemoryData | null;
  clearLastSavedMemory: () => void;
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
  const [lastSavedMemory, setLastSavedMemory] = useState<SavedMemoryData | null>(null);

  // Use refs to prevent memory leaks and ensure proper cleanup
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);
  const modeRef = useRef<"log" | "query" | null>(null);
  // Cache pre-warmed geolocation to avoid timeout issues when saving
  const cachedLocationRef = useRef<{ lat: number; lng: number; accuracy?: number } | null>(null);

  // Helper to update both mode state and ref (fixes React closure issue)
  const setMode = useCallback((newMode: "log" | "query" | null) => {
    modeRef.current = newMode;
    setModeState(newMode);
  }, []);

  const queryClient = useQueryClient();
  const { speak } = useSpeechSynthesis();
  const { requestLocation, isSupported: geoSupported } = useGeolocation();

  // Query for application settings with error handling
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation for saving memories with AI extraction, manual category, and geolocation
  const saveMutation = useMutation({
    mutationFn: async (memoryText: string) => {
      // Capture user's timezone for accurate calendar event scheduling
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      const body: { 
        memoryText: string; 
        topicTag?: string;
        geoLat?: number;
        geoLng?: number;
        geoAccuracyMeters?: number;
        timezone?: string;
      } = { memoryText, timezone: userTimezone };
      
      // Include topicTag if user manually selected a category
      if (manualCategory) {
        body.topicTag = manualCategory;
      } else {
        // Check session storage for session category
        const sessionCategory = sessionStorage.getItem("keryx_session_category");
        if (sessionCategory) {
          body.topicTag = sessionCategory;
        }
      }
      
      // Capture geolocation - use pre-warmed cache first, then try fresh with longer timeout
      if (geoSupported) {
        try {
          // First check if we have a pre-warmed location from when recording started
          if (cachedLocationRef.current) {
            body.geoLat = cachedLocationRef.current.lat;
            body.geoLng = cachedLocationRef.current.lng;
            if (cachedLocationRef.current.accuracy) {
              body.geoAccuracyMeters = cachedLocationRef.current.accuracy;
            }
            // Clear cache after use
            cachedLocationRef.current = null;
          } else {
            // No cached location - try fresh with 5 second timeout
            const geoPromise = requestLocation();
            const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
            const geo = await Promise.race([geoPromise, timeoutPromise]);
            if (geo && geo.lat && geo.lng) {
              body.geoLat = geo.lat;
              body.geoLng = geo.lng;
              if (geo.accuracy) {
                body.geoAccuracyMeters = geo.accuracy;
              }
            }
          }
        } catch (geoError) {
          // Geolocation failed - continue without it
          console.warn('Geolocation capture failed:', geoError);
        }
      }
      
      const response = await apiRequest("POST", "/api/memories", body);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Parse response with error handling for production edge cases
      // Read as text first, then parse - more reliable in some environments
      try {
        const responseText = await response.text();
        
        if (!responseText) {
          return { status: 'success', data: { topicTag: 'General' } };
        }
        
        return JSON.parse(responseText);
      } catch (parseError) {
        console.error('[saveMutation] Failed to parse response:', parseError);
        // Return a minimal success response if parsing fails
        // The request succeeded (response.ok was true) so the memory was saved
        return { status: 'success', data: { topicTag: 'General' } };
      }
    },
    onSuccess: (data, variables) => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/logs"] });

        isProcessingRef.current = false;

        const topicTag = data?.data?.topicTag || data?.topicTag || 'General';
        const successMessage = `Memory saved as ${topicTag}`;
        
        // AI action detection runs in background - invalidate pending actions after a delay
        // to allow backend to process and create any pending actions
        if (data?.actionDetectionInitiated) {
          setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
          }, 3000); // Check after 3 seconds for new pending actions
        }
        
        setLastResponse(successMessage);
        
        // Store saved memory data for calendar event detection and life purpose suggestion
        const memoryData = data?.data || data;
        setLastSavedMemory({
          id: memoryData?.id,
          memoryText: variables,
          topicTag: topicTag,
          lifePurposeTheme: memoryData?.lifePurposeTheme || false,
        });

        setTimeout(() => {
          if (settings?.voiceResponseEnabled) {
            speak(successMessage);
          }
        }, 1000);
      } catch (onSuccessError) {
        console.error('[saveMutation] Error in onSuccess handler:', onSuccessError);
        // Still mark as successful since save actually worked
        isProcessingRef.current = false;
        setLastResponse('Memory saved successfully');
      }
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

      let responseMessage = "";

      // Check if this was a financial query response
      if (data.isFinancial && data.financialAnswer) {
        responseMessage = data.financialAnswer;
      } else {
        const results = data.data || [];

        if (results.length === 0) {
          responseMessage = "No matching memories found.";
        } else if (results.length === 1) {
          const memory = results[0];
          responseMessage = `Found: ${memory.memoryText}`;
        } else {
          responseMessage = `Found ${results.length} matching memories. The most relevant is: ${results[0].memoryText}`;
        }
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
    if (!memoryText || memoryText.trim().length === 0) {
      const errorMessage = "Please provide some text to log.";
      setLastResponse(errorMessage);
      return;
    }

    isProcessingRef.current = true;

    if (isListening) {
      stopListening(false);
    }

    try {
      // Use mutate instead of mutateAsync to avoid onSuccess errors propagating
      // The mutation's onSuccess/onError handlers will handle the UI updates
      await saveMutation.mutateAsync(memoryText.trim());
      
      // If we get here, the mutation succeeded
      // Note: onSuccess handler also runs, but we clean up state here
      setTranscript("");
      modeRef.current = null;
      setModeState(null);

    } catch (error: any) {
      console.error('[handleLogCommand] Error:', error?.message || error);
      isProcessingRef.current = false;
      
      // Show error to user - the mutation's onError should have already handled this
      // but we catch here as a fallback
      setLastResponse("Failed to save memory. Please try again.");
      
      modeRef.current = null;
      setModeState(null);
    }
  }, [isListening, saveMutation, settings, speak, stopListening, queryClient]);

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

      // Pre-warm GPS when recording starts (fire-and-forget)
      // This gives the GPS time to acquire a fix while the user is speaking
      if (geoSupported) {
        requestLocation().then((geo) => {
          if (geo && geo.lat && geo.lng) {
            cachedLocationRef.current = {
              lat: geo.lat,
              lng: geo.lng,
              accuracy: geo.accuracy ?? undefined,
            };
          }
        }).catch(() => {
          // Ignore pre-warm failures - we'll try again at save time
        });
      }

    } catch (error) {
      console.error('Error starting recognition:', error);
      setIsListening(false);
    }
  }, [isSupported, isListening, processTranscript, settings, speak, geoSupported, requestLocation]);

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

  const clearLastSavedMemory = useCallback(() => {
    setLastSavedMemory(null);
  }, []);

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
    lastSavedMemory,
    clearLastSavedMemory,
  };
}
