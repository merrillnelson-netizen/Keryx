import MobileLayout from "@/components/mobile-layout";
import VoiceActivation from "@/components/voice-activation";
import LiveTranscript from "@/components/live-transcript";
import ActiveTemplate from "@/components/active-template";
import RecentActivity from "@/components/recent-activity";
import CommandExamples from "@/components/command-examples";
import SpeechDebug from "@/components/speech-debug";

export default function VoiceControl() {
  return (
    <MobileLayout>
      {/* Desktop Header - Hidden on mobile */}
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-foreground">Voice Control Center</h2>
            <p className="text-sm text-muted-foreground">Ready to receive voice commands</p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="material-icons text-secondary">volume_up</span>
              <span className="text-sm text-muted-foreground">Voice Ready</span>
            </div>
            
            <div className="flex items-center space-x-2">
              <span className="material-icons text-primary">storage</span>
              <span className="text-sm text-muted-foreground">Database Connected</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 lg:p-6">
        <VoiceActivation />
        <LiveTranscript />
        
        {/* Debug Panel - Remove this after voice is working */}
        <SpeechDebug />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <ActiveTemplate />
          <RecentActivity />
        </div>

        <CommandExamples />
      </div>
    </MobileLayout>
  );
}
