import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";

export default function SpeechDebug() {
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  
  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      alert('Microphone access granted! Voice recognition should work.');
    } catch (error) {
      alert('Microphone access denied. Please check your browser permissions.');
    }
  };

  return (
    <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-foreground">Speech Recognition API:</span>
          <Badge variant={isSupported ? "default" : "destructive"} data-testid="badge-speech-support">
            {isSupported ? "Supported" : "Not Supported"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-foreground">Secure Context (HTTPS/localhost):</span>
          <Badge variant={isSecure ? "default" : "destructive"} data-testid="badge-secure-context">
            {isSecure ? "Yes" : "No"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-foreground">User Agent:</span>
          <span className="text-xs text-muted-foreground max-w-xs truncate">
            {navigator.userAgent.split(' ').slice(-2).join(' ')}
          </span>
        </div>
        
        <Button onClick={testMicrophone} className="w-full" variant="outline" data-testid="button-test-microphone">
          <Mic className="w-4 h-4 mr-2" />
          Test Microphone Access
        </Button>
        
        {!isSupported && (
          <div className="text-sm text-orange-900 dark:text-orange-100 bg-orange-100 dark:bg-orange-900/30 p-3 rounded border border-orange-200 dark:border-orange-800">
            <p className="font-medium">Speech Recognition Not Available</p>
            <p>Please use Chrome, Edge, or Safari browsers for voice features.</p>
          </div>
        )}
        
        {!isSecure && (
          <div className="text-sm text-red-900 dark:text-red-100 bg-red-100 dark:bg-red-900/30 p-3 rounded border border-red-200 dark:border-red-800">
            <p className="font-medium">Insecure Context</p>
            <p>Voice recognition may require HTTPS in production.</p>
          </div>
        )}
      </div>
  );
}