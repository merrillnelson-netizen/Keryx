import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Square, Volume2, Send, Keyboard, Sparkles } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import CalendarEventSuggestion from "./calendar-event-suggestion";
import LifePurposeSuggestion from "./life-purpose-suggestion";
import { HintChips } from "./keryx-capabilities-modal";
import { ResponseModal } from "./response-modal";

export default function VoiceActivation() {
  const [textInput, setTextInput] = useState("");
  const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
  
  const { 
    isListening, 
    isSupported, 
    startListeningUnified,
    stopListening,
    mode,
    lastResponse,
    submitTextUnified,
    isProcessing,
    lastSavedMemory,
    clearLastSavedMemory,
    responseData,
    showResponseModal,
    setShowResponseModal,
    clearResponseData,
  } = useSpeechRecognition();

  const handleUnifiedVoice = () => {
    startListeningUnified();
  };

  const handleTextSubmit = async () => {
    if (!textInput.trim() || isProcessing) return;
    
    await submitTextUnified(textInput.trim());
    setTextInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  return (
    <div className="glass-card-strong p-6 lg:p-8 rounded-2xl mb-6 shadow-2xl">
      <CardContent className="text-center">
        {/* Input Mode Toggle */}
        <div className="flex justify-center gap-2 mb-6">
          <Button
            variant={inputMode === "voice" ? "default" : "outline"}
            size="sm"
            onClick={() => setInputMode("voice")}
            className={cn(
              "rounded-full px-4",
              inputMode === "voice" && "bg-gradient-to-r from-primary to-secondary"
            )}
            data-testid="button-input-voice"
          >
            <Mic className="w-4 h-4 mr-2" />
            Voice
          </Button>
          <Button
            variant={inputMode === "text" ? "default" : "outline"}
            size="sm"
            onClick={() => setInputMode("text")}
            className={cn(
              "rounded-full px-4",
              inputMode === "text" && "bg-gradient-to-r from-primary to-secondary"
            )}
            data-testid="button-input-text"
          >
            <Keyboard className="w-4 h-4 mr-2" />
            Type
          </Button>
        </div>

        {inputMode === "voice" ? (
          <>
            {/* Voice Input Mode */}
            {!isSupported ? (
              <div className="py-8">
                <div className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                  <MicOff className="text-destructive w-12 h-12" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">Speech Not Supported</h3>
                <p className="text-muted-foreground max-w-md mx-auto text-sm">
                  Your browser doesn't support speech recognition. Switch to text mode or use Chrome.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-6 lg:mb-8">
                  <div 
                    className={cn(
                      "w-32 h-32 lg:w-40 lg:h-40 rounded-2xl flex items-center justify-center mx-auto mb-4 lg:mb-6 transition-all duration-300 relative overflow-hidden",
                      isListening 
                        ? "bg-gradient-to-br from-secondary to-accent listening-pulse shadow-2xl" 
                        : "bg-gradient-to-br from-primary via-secondary to-accent hover:scale-105 shadow-xl"
                    )}
                  >
                    {isListening ? (
                      <Mic className="text-white w-16 h-16 lg:w-20 lg:h-20 animate-pulse" />
                    ) : (
                      <Mic className="text-white w-16 h-16 lg:w-20 lg:h-20" />
                    )}
                    {isListening && (
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer"></div>
                    )}
                  </div>
                  <h3 className="text-xl lg:text-3xl font-bold text-foreground mb-3">
                    {isListening ? (
                      <span className="text-gradient">
                        Listening...
                      </span>
                    ) : (
                      "Voice Command Ready"
                    )}
                  </h3>
                  <p className="text-sm lg:text-base text-muted-foreground max-w-md mx-auto px-2">
                    {isListening 
                      ? "Speak naturally - AI will detect if you want to log or search"
                      : 'Tap to speak - log memories or ask questions naturally'
                    }
                  </p>
                </div>

                {/* Unified Voice Button */}
                <div className="flex justify-center">
                  {isListening ? (
                    <Button 
                      onClick={stopListening}
                      variant="destructive"
                      className="px-8 lg:px-12 py-4 lg:py-6 text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
                      size="lg"
                      data-testid="button-stop-listening"
                    >
                      <Square className="mr-2 w-5 h-5" />
                      <span>Stop Listening</span>
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleUnifiedVoice}
                      className="bg-gradient-to-r from-primary via-secondary to-accent hover:from-primary/90 hover:via-secondary/90 hover:to-accent/90 text-white px-8 lg:px-12 py-4 lg:py-6 text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
                      size="lg"
                      data-testid="button-speak"
                    >
                      <Sparkles className="mr-2 w-5 h-5" />
                      <span>Speak to Keryx</span>
                    </Button>
                  )}
                </div>

                {/* Rotating Hint Chips */}
                {!isListening && <HintChips />}
              </>
            )}
          </>
        ) : (
          <>
            {/* Text Input Mode */}
            <div className="mb-6">
              <Textarea
                placeholder="Type your memory or search query here..."
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="min-h-[120px] border-primary/20 focus:border-primary/40 resize-none"
                data-testid="textarea-memory-input"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Press Enter to submit - AI will detect if you want to log or search
              </p>
            </div>

            {/* Unified Text Submit Button */}
            <div className="flex justify-center">
              <Button 
                onClick={handleTextSubmit}
                disabled={!textInput.trim() || isProcessing}
                className="bg-gradient-to-r from-primary via-secondary to-accent hover:from-primary/90 hover:via-secondary/90 hover:to-accent/90 text-white px-8 lg:px-12 py-4 lg:py-6 text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                size="lg"
                data-testid="button-submit"
              >
                <Sparkles className="mr-2 w-5 h-5" />
                <span>{isProcessing ? "Processing..." : "Send to Keryx"}</span>
              </Button>
            </div>

            {/* Rotating Hint Chips */}
            <HintChips />
          </>
        )}

        {/* Response Display - only show inline for log responses (not query/financial) */}
        {lastResponse && (!responseData || responseData.type === "log") && (
          <div className="mt-6 lg:mt-8 glass-card p-4 lg:p-6 rounded-xl border border-primary/30 animate-slide-in">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Volume2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-primary mb-1">Response</p>
                <p className="text-sm lg:text-base text-foreground" data-testid="text-response">
                  {lastResponse}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Calendar Event Suggestion */}
        {lastSavedMemory && (
          <CalendarEventSuggestion
            memoryText={lastSavedMemory.memoryText}
            memoryId={lastSavedMemory.id}
            onDismiss={clearLastSavedMemory}
            onCreated={clearLastSavedMemory}
          />
        )}

        {/* Life Purpose Suggestion - shows when memory touches on existential themes */}
        {lastSavedMemory?.lifePurposeTheme && (
          <LifePurposeSuggestion onDismiss={clearLastSavedMemory} />
        )}
      </CardContent>

      {/* Response Modal for query/financial results */}
      <ResponseModal
        open={showResponseModal}
        onClose={() => {
          setShowResponseModal(false);
          clearResponseData();
        }}
        responseData={responseData}
      />
    </div>
  );
}
