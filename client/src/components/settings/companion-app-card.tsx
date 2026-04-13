import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Glasses, Copy, ExternalLink, Circle, Mic, MapPin, Bluetooth } from "lucide-react";

interface RelayEvent {
  id: string;
  type: string;
  source: string;
  createdAt: string;
}

export function CompanionAppCard() {
  const { toast } = useToast();
  const [showUser, setShowUser] = useState(false);

  const { data: relayKeyData } = useQuery<{ apiKey: string; endpoint: string }>({
    queryKey: ["/api/relay/key"],
    staleTime: Infinity,
  });

  const { data: relayEvents = [] } = useQuery<RelayEvent[]>({
    queryKey: ["/api/relay/events"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    });
  };

  const serverUrl = relayKeyData?.endpoint
    ? new URL(relayKeyData.endpoint).origin
    : window.location.origin;

  const lastCompanionEvent = relayEvents.find(e => e.source === "companion-app" || e.source === "glasses");

  const companionOnline = !!lastCompanionEvent &&
    (Date.now() - new Date(lastCompanionEvent.createdAt).getTime()) < 30 * 60 * 1000;

  const formatLastSeen = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Glasses className="w-5 h-5 text-sky-500" />
          Meta Glasses Companion App
          {lastCompanionEvent ? (
            <Badge
              variant="outline"
              className={companionOnline
                ? "border-green-500 text-green-400 text-xs"
                : "border-yellow-500 text-yellow-400 text-xs"}
            >
              <Circle className={`w-2 h-2 mr-1 ${companionOnline ? "fill-green-400" : "fill-yellow-400"}`} />
              {companionOnline ? "Online" : `Last seen ${formatLastSeen(lastCompanionEvent.createdAt)}`}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
              <Circle className="w-2 h-2 mr-1" />
              Not connected
            </Badge>
          )}
          <Badge variant="outline" className="border-sky-500 text-sky-400 text-xs ml-auto">
            Life OS
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          React Native companion app for your Oakley Meta HSTN glasses. Say{" "}
          <strong>"Hey Keryx"</strong> to record memories hands-free — with GPS location,
          Bluetooth audio, and wake-word detection via Picovoice Porcupine.
        </p>

        {/* Feature chips */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1 text-xs bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-full px-2.5 py-1">
            <Mic className="w-3 h-3" /> Wake word: "Hey Keryx"
          </div>
          <div className="flex items-center gap-1 text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2.5 py-1">
            <Bluetooth className="w-3 h-3" /> Bluetooth SCO audio
          </div>
          <div className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-1">
            <MapPin className="w-3 h-3" /> GPS context
          </div>
        </div>

        {/* Step 1 — Clone & build */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Get the Source</p>
          <p className="text-xs text-muted-foreground">
            The companion app lives in <code className="bg-muted/40 px-1 rounded">companion-app/</code> inside your Keryx project.
            It's a React Native app — clone the repo and build it with Expo or the React Native CLI.
          </p>
          <Button size="sm" variant="outline" asChild>
            <a
              href="https://github.com/merrillnelson-netizen/Keryx/tree/main/companion-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              View companion-app/ on GitHub
            </a>
          </Button>
        </div>

        {/* Step 2 — Server URL */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Configure Server URL</p>
          <p className="text-xs text-muted-foreground">
            In <code className="bg-muted/40 px-1 rounded">companion-app/src/services/api.ts</code>, the production URL is already set to:
          </p>
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <code className="text-xs bg-background/50 px-2 py-1 rounded flex-1 truncate text-sky-400">
                {serverUrl}
              </code>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                onClick={() => copy(serverUrl, "Server URL")}
              >
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Step 3 — Picovoice */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 3 — Wake Word (Picovoice)</p>
          <p className="text-xs text-muted-foreground">
            Wake word detection requires a <strong>Picovoice access key</strong> and a custom{" "}
            <code className="bg-muted/40 px-1 rounded">hey-keryx.ppn</code> model file trained
            for the phrase "Hey Keryx".
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <a href="https://console.picovoice.ai/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Picovoice Console
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href="https://console.picovoice.ai/ppn" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Train Wake Word
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Place your <code className="bg-muted/40 px-1 rounded">.ppn</code> file in{" "}
            <code className="bg-muted/40 px-1 rounded">companion-app/assets/</code> and set{" "}
            <code className="bg-muted/40 px-1 rounded">PICOVOICE_ACCESS_KEY</code> in the app's environment config.
          </p>
        </div>

        {/* Step 4 — Login */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 4 — Log In</p>
          <p className="text-xs text-muted-foreground">
            Open the companion app and log in with your Keryx username and password.
            The app uses session-based authentication — the same credentials you use on the web.
          </p>
        </div>

        {/* Last activity */}
        {lastCompanionEvent && (
          <div className="text-xs text-muted-foreground pt-1 border-t border-white/10">
            Last companion activity: {formatLastSeen(lastCompanionEvent.createdAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
