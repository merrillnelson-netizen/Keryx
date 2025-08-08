import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

export default function LiveTranscript() {
  const { transcript, isListening, lastResponse } = useSpeechRecognition();

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6 mb-6">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-foreground">Live Transcript</h4>
          <Badge variant={isListening ? "default" : "secondary"}>
            {isListening ? "Listening" : "Idle"}
          </Badge>
        </div>
        
        <div className="bg-muted rounded-lg p-4 min-h-24 border-2 border-dashed border-outline">
          <p className={transcript ? "text-foreground" : "text-muted-foreground italic"}>
            {transcript || "Voice commands will appear here as you speak..."}
          </p>
        </div>
        
        {/* Response Area */}
        {lastResponse && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-start space-x-3">
              <span className="material-icons text-primary mt-0.5">assistant</span>
              <div>
                <p className="font-medium text-blue-900 mb-1">System Response</p>
                <p className="text-blue-800">{lastResponse}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
