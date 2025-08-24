import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { parseVoiceCommand } from "@/lib/voice-parser";
import { useSpeechSynthesis } from "./use-speech-synthesis";
import { Template, Settings } from "@shared/schema";
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
}

/**
 * Custom hook for managing speech recognition functionality
 * Handles browser's Web Speech API, voice command processing, and memory cleanup
 * 
 * Features:
 * - Browser compatibility checking
 * - Automatic memory cleanup on unmount
 * - Error handling for speech recognition failures
 * - Voice command parsing and API integration
 * - Real-time transcript updates
 * - Comprehensive garbage collection
 */
export function useSpeechRecognition(): SpeechRecognitionHook {
  // State management for speech recognition
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<"log" | "query" | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [lastResponse, setLastResponse] = useState("");

  // Use refs to prevent memory leaks and ensure proper cleanup
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingRef = useRef(false);

  const queryClient = useQueryClient();
  const { speak } = useSpeechSynthesis();

  // Query for application settings with error handling
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Query for active template with error handling
  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation for logging voice commands with comprehensive error handling
  const logMutation = useMutation({
    mutationFn: async (logEntry: any) => {
      try {
        console.log('Creating log entry with data:', JSON.stringify(logEntry, null, 2));

        // Validate required fields before sending
        if (!logEntry.templateId) {
          throw new Error('Template ID is required');
        }
        if (!logEntry.rawCommand) {
          throw new Error('Raw command is required');
        }
        if (!logEntry.parsedData) {
          throw new Error('Parsed data is required');
        }

        const response = await apiRequest("POST", "/api/logs", logEntry);

        // Check if response is ok
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Log entry creation response:', result);
        return result;
      } catch (error) {
        console.error('Error in logMutation:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      try {
        console.log('Log entry created successfully:', data);
        // Invalidate and refetch log queries to update UI
        queryClient.invalidateQueries({ queryKey: ["/api/logs"] });

        // Clear processing flag
        isProcessingRef.current = false;

        // Provide success feedback
        const successMessage = "Log entry saved successfully";
        setLastResponse(successMessage);

        // Delayed speech response to avoid interruption
        setTimeout(() => {
          if (settings?.voiceResponseEnabled) {
            speak(successMessage);
          }
        }, 1000);

      } catch (error) {
        console.error('Error in log success handler:', error);
      }
    },
    onError: (error) => {
      try {
        console.error('Failed to create log entry:', error);

        // Clear processing flag
        isProcessingRef.current = false;

        // Provide detailed error feedback
        let errorMessage = "Failed to save log entry. ";
        if (error instanceof Error) {
          if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMessage += "Please check your connection and try again.";
          } else if (error.message.includes('validation')) {
            errorMessage += "The command format wasn't recognized. Please try again.";
          } else {
            errorMessage += "Please try again.";
          }
        }

        setLastResponse(errorMessage);

        // Delayed speech response
        setTimeout(() => {
          if (settings?.voiceResponseEnabled) {
            speak(errorMessage);
          }
        }, 500);

      } catch (handlerError) {
        console.error('Error in log error handler:', handlerError);
      }
    },
  });

  // Mutation for querying log entries with error handling
  const queryMutation = useMutation({
    mutationFn: async (query: any) => {
      try {
        const response = await apiRequest("POST", "/api/logs/query", query);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Query mutation error:", error);
        throw error;
      }
    },
    onError: (error) => {
      try {
        console.error("Failed to process query:", error);
        isProcessingRef.current = false;
        const errorMessage = "Failed to process your query. Please try again.";
        setLastResponse(errorMessage);

        setTimeout(() => {
          if (settings?.voiceResponseEnabled) {
            speak(errorMessage);
          }
        }, 500);
      } catch (handlerError) {
        console.error('Error in query error handler:', handlerError);
      }
    },
  });

  // Check if speech recognition is supported in current browser
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  /**
   * Cleanup function to prevent memory leaks
   * Properly disposes of all resources and event listeners
   */
  const cleanup = useCallback(() => {
    try {
      // Clear any active timeouts to prevent memory leaks
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Stop and cleanup recognition instance
      if (recognitionRef.current) {
        try {
          // Remove event listeners to prevent memory leaks
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.onstart = null;

          // Stop recognition
          if (recognitionRef.current.stop) {
            recognitionRef.current.stop();
          }
          if (recognitionRef.current.abort) {
            recognitionRef.current.abort();
          }
        } catch (cleanupError) {
          console.warn('Error during recognition cleanup:', cleanupError);
        }

        // Clear reference for garbage collection
        recognitionRef.current = null;
      }

      // Reset state
      setIsListening(false);
      setMode(null);
      isProcessingRef.current = false;

    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }, []);

  /**
   * Initialize speech recognition instance with proper error handling
   * Sets up event listeners and manages memory cleanup
   */
  useEffect(() => {
    if (!isSupported) {
      console.warn("Speech recognition not supported in this browser");
      return;
    }

    try {
      // Get the appropriate SpeechRecognition constructor
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.error("Speech recognition constructor not available");
        return;
      }

      // Create new recognition instance with error handling
      const recognitionInstance = new SpeechRecognition();

      // Configure recognition settings for optimal performance
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';
      recognitionInstance.maxAlternatives = 1;

      /**
       * Handle speech recognition results with comprehensive error handling
       * Processes both interim and final results to provide real-time feedback
       */
      recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
        try {
          let finalTranscript = '';
          let interimTranscript = '';

          // Extract both final and interim results
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript;
            } else {
              interimTranscript += transcript;
            }
          }

          // Update transcript with interim results for real-time feedback
          if (interimTranscript.trim()) {
            setTranscript(interimTranscript);
          }

          // Process final results with delay to ensure complete speech
          if (finalTranscript.trim() && !isProcessingRef.current) {
            isProcessingRef.current = true;
            setTranscript(finalTranscript);

            // Clear any existing timeout
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }

            // Process command with delay to ensure user has finished speaking
            timeoutRef.current = setTimeout(() => {
              try {
                processTranscript(finalTranscript);
              } catch (error) {
                console.error("Error processing command:", error);
                isProcessingRef.current = false;
              }
            }, 1200);
          }
        } catch (error) {
          console.error("Error processing speech results:", error);
          isProcessingRef.current = false;
          setLastResponse("Error processing speech. Please try again.");
        }
      };

      /**
       * Handle speech recognition errors with detailed error messages
       * Provides user-friendly feedback for different error types
       */
      recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
        try {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          isProcessingRef.current = false;

          // Handle no-speech silently to avoid interrupting user
          if (event.error === 'no-speech') {
            return;
          }

          let errorMessage = "Voice recognition error: ";

          // Provide specific error messages based on error type
          switch (event.error) {
            case 'not-allowed':
              errorMessage += "Microphone access denied. Please allow permissions and try again.";
              break;
            case 'audio-capture':
              errorMessage += "Audio capture failed. Please check your microphone.";
              break;
            case 'network':
              errorMessage += "Network error occurred. Please check your connection.";
              break;
            case 'service-not-allowed':
              errorMessage += "Speech recognition service not allowed. Check browser permissions.";
              break;
            case 'bad-grammar':
              errorMessage += "Grammar error in recognition. Please try again.";
              break;
            default:
              errorMessage += `Unexpected error: ${event.error}`;
          }

          setLastResponse(errorMessage);

          // Add delay before speaking error messages
          setTimeout(() => {
            if (settings?.voiceResponseEnabled) {
              speak(errorMessage);
            }
          }, 1000);

        } catch (handlerError) {
          console.error("Error in speech error handler:", handlerError);
        }
      };

      /**
       * Handle recognition end event
       * Updates listening state and cleans up resources
       */
      recognitionInstance.onend = () => {
        try {
          setIsListening(false);
          isProcessingRef.current = false;
        } catch (error) {
          console.error("Error in onend handler:", error);
        }
      };

      // Store the recognition instance in both state and ref for cleanup
      setRecognition(recognitionInstance);
      recognitionRef.current = recognitionInstance;

      // Cleanup function to prevent memory leaks
      return cleanup;

    } catch (error) {
      console.error("Error initializing speech recognition:", error);
      setLastResponse("Failed to initialize speech recognition. Please refresh the page.");
    }
  }, [isSupported, cleanup, settings?.voiceResponseEnabled, speak]);

  /**
   * Process voice transcript and handle different command types
   * Determines if transcript contains valid commands and routes appropriately
   */
  const processTranscript = useCallback(async (transcript: string) => {
    try {
      // Prevent processing if already handling a command
      if (isProcessingRef.current) {
        console.log("Already processing a command, skipping...");
        return;
      }

      // Clean up the transcript - remove extra spaces and normalize
      const cleanTranscript = transcript.trim().toLowerCase();

      if (!cleanTranscript) {
        console.log("Empty transcript, ignoring");
        return;
      }

      console.log("Processing command:", cleanTranscript, "Mode:", mode, "Active template:", activeTemplate?.name || 'None');

      // Check for activation phrase if we have settings
      if (settings?.activationPhrase) {
        const activationPhrase = settings.activationPhrase.toLowerCase();

        if (!cleanTranscript.includes(activationPhrase)) {
          console.log(`Activation phrase "${activationPhrase}" not found in: "${cleanTranscript}"`);
          return;
        }

        // Remove activation phrase from transcript for processing
        const commandPart = cleanTranscript.replace(activationPhrase, '').trim();
        if (!commandPart) {
          console.log("No command found after activation phrase");
          // Provide feedback that we're listening
          setLastResponse("I'm listening. What would you like to log?");
          if (settings?.voiceResponseEnabled) {
            speak("I'm listening. What would you like to log?");
          }
          return;
        }

        console.log(`Command after activation phrase: "${commandPart}"`);

        // Process the command
        await handleCommand(commandPart);
      } else {
        // No activation phrase set, process directly
        await handleCommand(cleanTranscript);
      }

    } catch (error) {
      console.error('Error processing transcript:', error);
      isProcessingRef.current = false;

      setTimeout(() => {
        const errorMessage = "Failed to process your command. Please try again.";
        setLastResponse(errorMessage);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    }
  }, [mode, activeTemplate, settings, handleCommand, speak]);

  /**
   * Handle different types of voice commands
   * Routes commands to appropriate handlers based on content
   */
  const handleCommand = useCallback(async (command: string) => {
    try {
      console.log('Processing command:', command);

      // Handle different command types
      if (command.startsWith('log ')) {
        await handleLogCommand(command.substring(4)); // Remove 'log ' prefix
      } else if (command.includes('query') || command.includes('find') || command.includes('show')) {
        await handleQueryCommand(command);
      } else {
        // For billiards template, treat any command as a log command
        // This allows natural speech like "round 1 table 2 game 1 john breaks steve misses"
        console.log('Treating as log command:', command);
        await handleLogCommand(command);
      }
    } catch (error) {
      console.error('Error in handleCommand:', error);
      isProcessingRef.current = false;

      setTimeout(() => {
        const errorMessage = "I didn't understand that command. Please try again.";
        setLastResponse(errorMessage);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
      }, 500);
    }
  }, [handleLogCommand, handleQueryCommand, settings]);

  /**
   * Handle query commands with comprehensive error handling
   * Processes voice queries and returns results
   * 
   * @param command - Cleaned voice command text
   */
  const handleQueryCommand = useCallback(async (command: string) => {
    try {
      // Stop listening immediately to prevent interruption
      if (isListening) {
        stopListening();
      }

      // Remove "query" prefix if present and validate template
      const cleanCommand = command.replace(/^query\s+/i, '').trim();
      if (!activeTemplate) {
        const errorMessage = "No active template found. Please activate a template first.";
        setLastResponse(errorMessage);
        if (settings?.voiceResponseEnabled) {
          speak(errorMessage);
        }
        isProcessingRef.current = false;
        return;
      }

      if (!cleanCommand) {
        throw new Error("No query provided after 'query' command");
      }

      const parsedQuery = await parseVoiceCommand(cleanCommand, activeTemplate, "query");

      const result = await queryMutation.mutateAsync({
        templateId: activeTemplate.id,
        query: parsedQuery,
      });

      // Process results and generate response with delay
      setTimeout(() => {
        const response = result && result.length > 0 ? 
          `Found ${result.length} matching results` : 
          "No results found";
        setLastResponse(response);
        if (settings?.voiceResponseEnabled) {
          speak(response);
        }
      }, 500);

      // Reset transcript for next command
      setTranscript("");

    } catch (error) {
      console.error('Error handling query command:', error);
      isProcessingRef.current = false;

      // Stop listening on error
      if (isListening) {
        stopListening();
      }

      setTimeout(() => {
        let response = "Failed to process query. ";
        if (error instanceof Error && error.message.includes("No query")) {
          response += "Please provide a query after saying 'query'.";
        } else {
          response += "Please try again.";
        }

        setLastResponse(response);
        if (settings?.voiceResponseEnabled) {
          speak(response);
        }
      }, 500);
    }
  }, [activeTemplate, isListening, queryMutation, settings, speak, stopListening]);

  /**
   * Handle log command with voice parser integration
   * Parses voice input and creates log entries in database
   */
  const handleLogCommand = useCallback(async (data: string) => {
    try {
      console.log('Handling log command with data:', data);

      // Validate we have an active template
      if (!activeTemplate) {
        const errorMessage = "No active template found. Please activate a template first.";
        setLastResponse(errorMessage);
        setTimeout(() => {
          if (settings?.voiceResponseEnabled) {
            speak(errorMessage);
          }
        }, 500);
        isProcessingRef.current = false;
        return;
      }

      // Set processing flag to prevent interruptions
      isProcessingRef.current = true;

      // Stop listening during processing to avoid interference
      if (isListening) {
        stopListening();
      }

      // Validate data is provided
      if (!data || data.trim().length === 0) {
        throw new Error("No data provided after 'log' command");
      }

      // Parse the voice command using the voice parser
      const parsedData = await parseVoiceCommand(data, activeTemplate);
      console.log('Parsed voice data:', parsedData);

      // Ensure parsed data is valid
      if (!parsedData || typeof parsedData !== 'object') {
        throw new Error("Failed to parse voice command data");
      }

      // Create log entry object with proper structure
      const logEntry = {
        templateId: activeTemplate.id,
        rawCommand: data.trim(),
        parsedData: parsedData,
        timestamp: new Date(),
      };

      console.log('Creating log entry:', logEntry);

      // Submit to database using the mutation
      const result = await logMutation.mutateAsync(logEntry);
      console.log('Log entry created successfully:', result);

      // Reset transcript for next command
      setTranscript("");

    } catch (error) {
      console.error('Error handling log command:', error);
      isProcessingRef.current = false;

      // Stop listening on error as well
      if (isListening) {
        stopListening();
      }

      // Provide specific error feedback based on error type with delay
      setTimeout(() => {
        let response = "Failed to log your command. ";
        if (error instanceof Error) {
          if (error.message.includes("parse")) {
            response += "The command format wasn't recognized. Please check the example format and try again.";
          } else if (error.message.includes("network") || error.message.includes("fetch")) {
            response += "Network error occurred. Please check your connection and try again.";
          } else if (error.message.includes("No data")) {
            response += "Please provide data after saying 'log'.";
          } else {
            response += "Please try again with a clearer command.";
          }
        } else {
          response += "Please try again.";
        }

        setLastResponse(response);
        if (settings?.voiceResponseEnabled) {
          speak(response);
        }
      }, 500);
    }
  }, [activeTemplate, isListening, logMutation, settings, speak, stopListening]);

  /**
   * Stop listening for voice commands with proper cleanup
   * Ensures all resources are properly disposed
   */
  const stopListening = useCallback(() => {
    try {
      // Clear timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (recognition && isListening) {
        recognition.stop();
        setIsListening(false);
        setMode(null);
        isProcessingRef.current = false;
      }
    } catch (error) {
      console.error('Error stopping recognition:', error);
    }
  }, [recognition, isListening]);

  /**
   * Start listening for voice commands with proper error handling
   * Includes timeout management to prevent infinite listening
   */
  const startListening = useCallback(() => {
    try {
      if (!isSupported) {
        const message = "Speech recognition is not supported in this browser. Please try Chrome or Edge.";
        setLastResponse(message);
        console.error(message);
        return;
      }

      if (recognition && !isListening) {
        // Reset state
        setTranscript("");
        setLastResponse("");
        isProcessingRef.current = false;

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        try {
          recognition.start();
          setIsListening(true);
          console.log('Speech recognition started');

          // Stop listening after a reasonable timeout to avoid infinite listening
          timeoutRef.current = setTimeout(() => {
            if (recognitionRef.current && isListening) {
              console.log('Stopping recognition due to timeout');
              stopListening();
            }
          }, 30000); // 30 seconds timeout

        } catch (error) {
          console.error('Failed to start speech recognition:', error);
          const message = "Could not start voice recognition. Please check microphone permissions.";
          setLastResponse(message);
          if (settings?.voiceResponseEnabled) {
            speak(message);
          }
        }
      }
    } catch (error) {
      console.error('Error in startListening:', error);
    }
  }, [recognition, isListening, isSupported, speak, settings?.voiceResponseEnabled, stopListening]);


  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

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