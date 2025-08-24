import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { cn } from "@/lib/utils";

export default function VoiceActivation() {
  const { 
    isListening, 
    isSupported, 
    startListening, 
    stopListening,
    mode,
    setMode,
    processTranscript, // Assuming processTranscript is available from the hook
    isProcessing // Assuming isProcessing is available from the hook
  } = useSpeechRecognition();

  const { speak } = useSpeechSynthesis();

  const handleLogMode = () => {
    setMode("log");
    startListening();
    // Remove immediate speech feedback to prevent interrupting user commands
  };

  const handleQueryMode = () => {
    setMode("query");
    startListening();
    // Remove immediate speech feedback to prevent interrupting user commands
  };

  if (!isSupported) {
    return (
      <Card className="bg-surface rounded-xl shadow-sm border border-outline p-8 mb-6">
        <CardContent className="text-center">
          <div className="w-32 h-32 bg-gray-300 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-icons text-gray-500 text-6xl">mic_off</span>
          </div>
          <h3 className="text-2xl font-medium text-foreground mb-2">Speech Recognition Not Supported</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your browser doesn't support speech recognition. Please use a modern browser like Chrome.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-4 lg:p-8 mb-4 lg:mb-6">
      <CardContent className="text-center">
        <div className="mb-4 lg:mb-6">
          <div 
            className={cn(
              "w-24 h-24 lg:w-32 lg:h-32 rounded-full flex items-center justify-center mx-auto mb-3 lg:mb-4 shadow-lg transition-all duration-300 hover:shadow-xl",
              isListening 
                ? "bg-secondary listening-pulse" 
                : "bg-primary"
            )}
          >
            <span className="material-icons text-white text-4xl lg:text-6xl">
              {isListening ? "mic" : "mic_none"}
            </span>
          </div>
          <h3 className="text-lg lg:text-2xl font-medium text-foreground mb-2">
            {isListening ? `${mode === "log" ? "Logging" : "Query"} Mode Active` : "Voice Command Ready"}
          </h3>
          <p className="text-sm lg:text-base text-muted-foreground max-w-md mx-auto px-2">
            {isListening 
              ? `Listening for ${mode} commands...`
              : 'Say "Hey M" followed by your logging or query command, or use the buttons below'
            }
          </p>
        </div>

        {/* Manual Activation Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 lg:gap-4">
          {isListening ? (
            <Button 
              onClick={stopListening}
              variant="destructive"
              className="px-4 lg:px-6 py-3 w-full sm:w-auto"
              size="lg"
            >
              <span className="material-icons mr-2">stop</span>
              <span className="font-medium">Stop Listening</span>
            </Button>
          ) : (
            <>
              <Button 
                onClick={handleLogMode}
                className="bg-secondary hover:bg-green-600 text-white px-4 lg:px-6 py-3 w-full sm:w-auto"
                size="lg"
              >
                <span className="material-icons mr-2">add_circle</span>
                <span className="font-medium">Log Mode</span>
              </Button>

              <Button 
                onClick={handleQueryMode}
                className="bg-accent hover:bg-orange-600 text-white px-4 lg:px-6 py-3 w-full sm:w-auto"
                size="lg"
              >
                <span className="material-icons mr-2">search</span>
                <span className="font-medium">Query Mode</span>
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}