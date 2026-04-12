import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Smartphone, Copy, Download, Circle, ExternalLink } from "lucide-react";

interface RelayEvent {
  id: string;
  type: string;
  source: string;
  createdAt: string;
}

export function AndroidBridgeCard() {
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);

  const { data: relayKeyData } = useQuery<{ apiKey: string; endpoint: string }>({
    queryKey: ["/api/relay/key"],
    staleTime: Infinity,
  });

  const { data: relayEvents = [] } = useQuery<RelayEvent[]>({
    queryKey: ["/api/relay/events"],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: apkInfo } = useQuery<{
    available: boolean;
    url: string | null;
    releaseUrl: string | null;
    version: string | null;
    publishedAt: string | null;
    githubDownloadUrl?: string | null;
  }>({
    queryKey: ["/api/android-bridge/apk-info"],
    staleTime: 5 * 60_000,
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied` });
    });
  };

  // Find most recent event from android-bridge
  const lastBridgeEvent = relayEvents.find(e => e.source === "android-bridge");

  const bridgeOnline = !!lastBridgeEvent &&
    (Date.now() - new Date(lastBridgeEvent.createdAt).getTime()) < 30 * 60 * 1000;

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

  const formatReleaseDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  // Direct GitHub download URL — prefer githubDownloadUrl over the proxy route
  const downloadUrl = apkInfo?.githubDownloadUrl ?? (apkInfo?.available ? "/api/android-bridge/apk" : null);
  const isGithubDirect = !!apkInfo?.githubDownloadUrl;

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-green-500" />
          Android Bridge
          {lastBridgeEvent && (
            <Badge
              variant="outline"
              className={bridgeOnline
                ? "border-green-500 text-green-400 text-xs"
                : "border-yellow-500 text-yellow-400 text-xs"}
            >
              <Circle className={`w-2 h-2 mr-1 ${bridgeOnline ? "fill-green-400" : "fill-yellow-400"}`} />
              {bridgeOnline ? "Online" : `Last seen ${formatLastSeen(lastBridgeEvent.createdAt)}`}
            </Badge>
          )}
          {!lastBridgeEvent && (
            <Badge variant="outline" className="border-muted-foreground text-muted-foreground text-xs">
              <Circle className="w-2 h-2 mr-1" />
              Not connected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The native Android app that captures Google Messages notifications and SMS
          in real time — no browser tab required.
        </p>

        {/* Step 1 — Download APK */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 1 — Get the App</p>
          <div className="flex gap-2 flex-wrap">
            {downloadUrl ? (
              <Button size="sm" asChild>
                <a
                  href={downloadUrl}
                  download={isGithubDirect ? undefined : "KeryxBridge.apk"}
                  target={isGithubDirect ? "_blank" : undefined}
                  rel={isGithubDirect ? "noopener noreferrer" : undefined}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download APK
                  {apkInfo?.version && apkInfo.version !== "local" && (
                    <span className="ml-1 text-[10px] opacity-70">({apkInfo.version})</span>
                  )}
                </a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <a
                  href={apkInfo?.releaseUrl ?? "https://github.com/merrillnelson-netizen/Keryx/releases"}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  GitHub Releases
                </a>
              </Button>
            )}
          </div>

          {/* Version + date info */}
          {apkInfo?.available && apkInfo.version && apkInfo.version !== "local" && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              <p className="text-xs text-muted-foreground">
                Latest: <span className="font-medium text-foreground">{apkInfo.version}</span>
              </p>
              {apkInfo.publishedAt && (
                <p className="text-xs text-muted-foreground">
                  Released: {formatReleaseDate(apkInfo.publishedAt)}
                </p>
              )}
              {apkInfo.releaseUrl && (
                <a
                  href={apkInfo.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  <ExternalLink className="w-3 h-3" />
                  Release notes
                </a>
              )}
            </div>
          )}
          {!apkInfo?.available && (
            <p className="text-xs text-muted-foreground">
              No release found. Visit{" "}
              <a
                href="https://github.com/merrillnelson-netizen/Keryx/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                GitHub Releases
              </a>{" "}
              to check for builds.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            After installing, open the app and paste the credentials below.
          </p>
        </div>

        {/* Step 2 — Credentials */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Step 2 — Enter in the App</p>

          <div className="bg-muted/30 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Server URL</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-background/50 px-2 py-1 rounded flex-1 truncate">
                  {relayKeyData?.endpoint
                    ? new URL(relayKeyData.endpoint).origin
                    : window.location.origin}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => copy(
                    relayKeyData?.endpoint
                      ? new URL(relayKeyData.endpoint).origin
                      : window.location.origin,
                    "Server URL"
                  )}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground mb-1">Relay API Key</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-background/50 px-2 py-1 rounded flex-1 font-mono truncate">
                  {relayKeyData?.apiKey
                    ? (showKey ? relayKeyData.apiKey : relayKeyData.apiKey.slice(0, 8) + "••••••••••••••••")
                    : "Loading..."}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setShowKey(s => !s)}
                  title={showKey ? "Hide" : "Reveal"}
                >
                  <span className="text-xs">{showKey ? "hide" : "show"}</span>
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0"
                  onClick={() => relayKeyData?.apiKey && copy(relayKeyData.apiKey, "API Key")}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 — Battery reminder */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-xs text-amber-400 font-medium">Samsung / Aggressive Battery Reminder</p>
          <p className="text-xs text-muted-foreground mt-1">
            After installing, go to <strong>Settings → Apps → Keryx Bridge → Battery</strong> and set it to{" "}
            <strong>Unrestricted</strong>. Without this the OS will kill the bridge within hours.
          </p>
        </div>

        {/* Last activity */}
        {lastBridgeEvent && (
          <div className="text-xs text-muted-foreground">
            Last bridge activity: {formatLastSeen(lastBridgeEvent.createdAt)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
