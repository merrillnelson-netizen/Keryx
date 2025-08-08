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
 */
export function useSpeechRecognition(): SpeechRecognitionHook {
  // State management for speech recognition
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<"log" | "query" | null>(null);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  const [lastResponse, setLastResponse] = useState("");
  
  // Use ref to prevent memory leaks and ensure proper cleanup
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const queryClient = useQueryClient();
  const { speak } = useSpeechSynthesis();

  // Query for application settings with error handling
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    retry: 3, // Retry failed requests up to 3 times
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });

  // Query for active template with error handling
  const { data: activeTemplate } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
    retry: 3,
    staleTime: 5 * 60 * 1000,
  });

  // Mutation for logging voice commands with proper error handling
  const logMutation = useMutation({
    mutationFn: (logEntry: any) => apiRequest("POST", "/api/logs", logEntry),
    onSuccess: () => {
      // Refresh the logs cache after successful creation
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
    },
    onError: (error) => {
      console.error("Failed to create log entry:", error);
      setLastResponse("Failed to save your command. Please try again.");
    },
  });

  // Mutation for querying log entries with error handling
  const queryMutation = useMutation({
    mutationFn: (query: any) => apiRequest("POST", "/api/logs/query", query),
    onError: (error) => {
      console.error("Failed to process query:", error);
      setLastResponse("Failed to process your query. Please try again.");
    },
  });

  // Check if speech recognition is supported in current browser
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

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
      recognitionInstance.continuous = true; // Keep listening until manually stopped
      recognitionInstance.interimResults = true; // Show partial results
      recognitionInstance.lang = 'en-US'; // Set language (could be made configurable)
      recognitionInstance.maxAlternatives = 1; // Only need the best result

      /**
       * Handle speech recognition results
       * Processes both interim and final results to provide real-time feedback
       */
      recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
        try {
          let finalTranscript = '';
          
          // Extract final results from the speech recognition event
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript.trim()) {
            setTranscript(finalTranscript);
            processCommand(finalTranscript);
          }
        } catch (error) {
          console.error("Error processing speech results:", error);
          setLastResponse("Error processing speech. Please try again.");
        }
      };

      /**
       * Handle speech recognition errors with detailed error messages
       * Provides user-friendly feedback for different error types
       */
      recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        let errorMessage = "Voice recognition error: ";
        
        // Provide specific error messages based on error type
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
          case 'service-not-allowed':
            errorMessage += "Speech recognition service not allowed. Please check browser permissions.";
            break;
          case 'bad-grammar':
            errorMessage += "Grammar error in recognition. Please try again.";
            break;
          default:
            errorMessage += `Unexpected error: ${event.error}`;
        }
        
        setLastResponse(errorMessage);
        speak(errorMessage);
        setIsListening(false);
      };

      /**
       * Handle recognition end event
       * Updates listening state when recognition stops
       */
      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      // Store the recognition instance in both state and ref for cleanup
      setRecognition(recognitionInstance);
      recognitionRef.current = recognitionInstance;

      // Cleanup function to prevent memory leaks
      return () => {
        try {
          if (recognitionInstance && recognitionInstance.abort) {
            recognitionInstance.abort(); // Force stop recognition
          }
          if (recognitionInstance && recognitionInstance.stop) {
            recognitionInstance.stop(); // Graceful stop
          }
          // Clear the reference to help garbage collection
          recognitionRef.current = null;
        } catch (error) {
          console.error("Error cleaning up speech recognition:", error);
        }
      };
    } catch (error) {
      console.error("Error initializing speech recognition:", error);
      setLastResponse("Failed to initialize speech recognition. Please refresh the page.");
    }
  }, [isSupported]);

  /**
   * Process voice commands with comprehensive error handling
   * Supports both button-triggered mode and wake-phrase detection
   * 
   * @param command - Raw voice command transcript
   */
  const processCommand = useCallback(async (command: string) => {
    try {
      // Validate prerequisites
      if (!activeTemplate) {
        const response = "No active template found. Please select a template first.";
        setLastResponse(response);
        speak(response);
        return;
      }

      if (!command || command.trim().length === 0) {
        console.warn("Empty command received");
        return;
      }

      const activationPhrase = settings?.activationPhrase || "Hey M";
      let cleanCommand = command.trim();
      
      // Button mode: process command directly without wake phrase
      if (mode) {
        console.log(`Processing ${mode} command:`, cleanCommand);
        if (mode === "log") {
          await handleLogCommand(cleanCommand, activeTemplate);
        } else if (mode === "query") {
          await handleQueryCommand(cleanCommand, activeTemplate);
        }
        return;
      }
      
      // Always-listening mode: require wake phrase
      if (!command.toLowerCase().includes(activationPhrase.toLowerCase())) {
        // Command doesn't contain wake phrase, ignore silently
        return;
      }

      // Remove activation phrase and parse command
      cleanCommand = command.replace(new RegExp(activationPhrase, 'gi'), '').trim();
      
      // Route command based on type
      if (cleanCommand.toLowerCase().startsWith('log')) {
        await handleLogCommand(cleanCommand, activeTemplate);
      } else if (cleanCommand.toLowerCase().startsWith('query')) {
        await handleQueryCommand(cleanCommand, activeTemplate);
      } else {
        // Provide helpful feedback for unrecognized commands
        const response = "Command not recognized. Try saying 'log' followed by your data, or 'query' followed by your question.";
        setLastResponse(response);
        speak(response);
      }
    } catch (error) {
      console.error("Error processing voice command:", error);
      const response = "Sorry, I couldn't process your command. Please try again.";
      setLastResponse(response);
      speak(response);
    }
  }, [activeTemplate, settings, logMutation, queryMutation, speak, mode]);

  /**
   * Handle log commands with comprehensive error handling and validation
   * Parses voice input and creates database entries
   * 
   * @param command - Cleaned voice command text
   * @param template - Active template for parsing structure
   */
  const handleLogCommand = async (command: string, template: Template) => {
    try {
      console.log('Processing log command:', command, 'with template:', template.name);
      
      // Parse the voice command using the active template
      const parsedData = parseVoiceCommand(command, template, "log");
      console.log('Parsed data structure:', parsedData);
      
      // Validate parsed data has required fields
      if (!parsedData || (typeof parsedData === 'object' && Object.keys(parsedData).length === 0)) {
        throw new Error("Command could not be parsed into structured data");
      }
      
      // Create log entry object
      const logEntry = {
        templateId: template.id,
        rawCommand: command,
        parsedData,
      };
      
      console.log('Submitting log entry:', logEntry);
      
      // Submit to database with error handling
      const result = await logMutation.mutateAsync(logEntry);
      console.log('Log entry created successfully:', result);

      // Provide success feedback
      const response = `Successfully logged: ${command}`;
      setLastResponse(response);
      speak(response);
      
      // Reset transcript for next command
      setTranscript("");
      
      // Auto-stop listening after successful log to prevent confusion
      if (isListening) {
        stopListening();
      }
      
    } catch (error) {
      console.error('Error handling log command:', error);
      
      // Provide specific error feedback based on error type
      let response = "Failed to log your command. ";
      if (error instanceof Error) {
        if (error.message.includes("parse")) {
          response += "The command format wasn't recognized. Please check the example format and try again.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          response += "Network error occurred. Please check your connection and try again.";
        } else {
          response += "Please try again with a clearer command.";
        }
      } else {
        response += "Please try again.";
      }
      
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
