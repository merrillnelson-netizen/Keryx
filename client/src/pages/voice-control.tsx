import AppLayout from "@/components/app-layout";
import VoiceActivation from "@/components/voice-activation";
import { Sparkles } from "lucide-react";

export default function VoiceControl() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Voice Log</h2>
              <p className="text-sm text-muted-foreground">Capture and search your memories</p>
            </div>
          </div>
        </div>

        {/* Voice Activation - Main Feature */}
        <VoiceActivation />
      </div>
    </AppLayout>
  );
}
