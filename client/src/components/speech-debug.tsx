import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function SpeechDebug() {
  const isSupported = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  
  const testMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      stream.getTracks().forEach(track => track.stop());
      alert('Microphone access granted! Voice recognition should work.');
    } catch (error) {
      console.error('Microphone access denied:', error);
      alert('Microphone access denied. Please check your browser permissions.');
    }
  };

  return (
    <Card className="bg-yellow-50 border-yellow-200">
      <CardHeader>
        <CardTitle className="flex items-center">
          <span className="material-icons mr-2">bug_report</span>
          Voice Recognition Debug
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Speech Recognition API:</span>
          <Badge variant={isSupported ? "default" : "destructive"}>
            {isSupported ? "Supported" : "Not Supported"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span>Secure Context (HTTPS/localhost):</span>
          <Badge variant={isSecure ? "default" : "destructive"}>
            {isSecure ? "Yes" : "No"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span>User Agent:</span>
          <span className="text-xs text-muted-foreground max-w-xs truncate">
            {navigator.userAgent.split(' ').slice(-2).join(' ')}
          </span>
        </div>
        
        <Button onClick={testMicrophone} className="w-full" variant="outline">
          <span className="material-icons mr-2">mic</span>
          Test Microphone Access
        </Button>
        
        {!isSupported && (
          <div className="text-sm text-orange-700 bg-orange-100 p-3 rounded">
            <p className="font-medium">Speech Recognition Not Available</p>
            <p>Please use Chrome, Edge, or Safari browsers for voice features.</p>
          </div>
        )}
        
        {!isSecure && (
          <div className="text-sm text-red-700 bg-red-100 p-3 rounded">
            <p className="font-medium">Insecure Context</p>
            <p>Voice recognition may require HTTPS in production.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}