import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Glasses, Copy, ExternalLink, Circle, Mic, MapPin, Bluetooth } from "lucide-react";

interface CompanionStatus {
  lastSeenAt: string | null;
}

export function CompanionAppCard() {
  const { toast } = useToast();

  const { data: statusData } = useQuery<CompanionStatus>({
    queryKey: ["/api/companion/status"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: relayKeyData } = useQuery<{ apiKey: string; endpoint: string }>({
    queryKey: ["/api/relay/key"],
    staleTime: Infinity,
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    });
  };

  const serverUrl = relayKeyData?.endpoint
    ? new URL(relayKeyData.endpoint).origin
    : window.location.origin;

  const lastSeenAt = statusData?.lastSeenAt ?? null;
  const companionOnline = !!lastSeenAt &&
    (Date.now() - new Date(lastSeenAt).getTime()) < 30 * 60 * 1000;

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
          {lastSeenAt ? (
            <Badge
              variant="outline"
              className={companionOnline
                ? "border-green-500 text-green-400 text-xs"
                : "border-yellow-500 text-yellow-400 text-xs"}
            >
              <Circle className={`w-2 h-2 mr-1 ${companionOnline ? "fill-green-400" : "fill-yellow-400"}`} />
              {companionOnline ? "Online" : `Last seen ${formatLastSeen(lastSeenAt)}`}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
              <Circle className="w-2 h-2 mr-1" />
              Never connected
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

        {/* Step 1 — Get source */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Get the Source</p>
          <p className="text-xs text-muted-foreground">
            The companion app lives in <code className="bg-muted/40 px-1 rounded">companion-app/</code> inside the Keryx GitHub repo.
            Clone it, then install dependencies:
          </p>
          <pre className="text-xs bg-muted/30 rounded-lg px-3 py-2 overflow-x-auto text-muted-foreground">
{`git clone https://github.com/merrillnelson-netizen/Keryx.git
cd Keryx/companion-app
npm install
cd ios && pod install && cd ..   # iOS only`}
          </pre>
          <Button size="sm" variant="outline" asChild>
            <a
              href="https://github.com/merrillnelson-netizen/Keryx/tree/main/companion-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              View companion-app/ on GitHub
            </a>
          </Button>
        </div>

        {/* Step 2 — Create .env */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Create .env</p>
          <p className="text-xs text-muted-foreground">
            Create <code className="bg-muted/40 px-1 rounded">companion-app/.env</code> with:
          </p>
          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <pre className="text-xs text-muted-foreground overflow-x-auto">{`PICOVOICE_ACCESS_KEY=<your_key>
KERYX_API_URL=${serverUrl}`}</pre>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => copy(
                `PICOVOICE_ACCESS_KEY=<your_key>\nKERYX_API_URL=${serverUrl}`,
                ".env contents"
              )}
            >
              <Copy className="w-3 h-3 mr-1.5" /> Copy .env
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Server URL to paste: <code className="bg-muted/40 px-1 rounded text-sky-400">{serverUrl}</code>{" "}
            <button
              className="text-primary hover:underline text-xs"
              onClick={() => copy(serverUrl, "Server URL")}
            >
              copy
            </button>
          </p>
        </div>

        {/* Step 3 — Picovoice */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 3 — Get Picovoice Key & Wake Word</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Sign up at <a href="https://console.picovoice.ai/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.picovoice.ai</a> and copy your <strong>Access Key</strong></li>
            <li>Go to <a href="https://console.picovoice.ai/ppn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Porcupine Wake Word trainer</a> and create a model for <strong>"Hey Keryx"</strong></li>
            <li>Download the <code className="bg-muted/40 px-1 rounded">.ppn</code> file for Android/iOS</li>
            <li>Copy it to <code className="bg-muted/40 px-1 rounded">companion-app/assets/hey-keryx.ppn</code></li>
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
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
        </div>

        {/* Step 4 — Build & run */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 4 — Build & Install on Phone</p>
          <pre className="text-xs bg-muted/30 rounded-lg px-3 py-2 overflow-x-auto text-muted-foreground">
{`# Android
npm run android

# iOS (requires Mac + Xcode)
npm run ios`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Connect your Meta glasses via Bluetooth before launching. The app will route audio through the glasses automatically.
          </p>
        </div>

        {/* Step 5 — Log in */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 5 — Log In</p>
          <p className="text-xs text-muted-foreground">
            Open the companion app, tap <strong>Log In</strong>, and enter your Keryx username and password.
            Once connected, say <strong>"Hey Keryx"</strong> to start recording a memory.
            The status dot above will turn green after your first successful recording.
          </p>
        </div>

        {/* Last activity */}
        {lastSeenAt && (
          <div className="text-xs text-muted-foreground pt-1 border-t border-white/10">
            Last companion activity: {formatLastSeen(lastSeenAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
