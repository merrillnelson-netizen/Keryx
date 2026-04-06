import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle, CheckCircle2, ExternalLink, Copy, Loader2, Send,
} from "lucide-react";

interface TelegramStatus {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  briefingsEnabled: boolean;
  alertsEnabled: boolean;
}

export function TelegramCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [telegramCode, setTelegramCode] = useState<{ code: string; link: string; expiresAt: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: telegramStatus, isLoading: isTelegramLoading } = useQuery<TelegramStatus>({
    queryKey: ["/api/telegram/status"],
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setIsCopied(false), 2000);
  };

  const telegramConnectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/telegram/connect");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.data) {
        setTelegramCode({
          code: data.data.verificationCode,
          link: data.data.telegramLink,
          expiresAt: data.data.expiresAt,
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to generate connection code", variant: "destructive" });
    },
  });

  const telegramDisconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/telegram/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/status"] });
      setTelegramCode(null);
      toast({ title: "Telegram disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect Telegram", variant: "destructive" });
    },
  });

  const telegramTestMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/telegram/test"),
    onSuccess: () => {
      toast({ title: "Test message sent to Telegram" });
    },
    onError: () => {
      toast({ title: "Failed to send test message", variant: "destructive" });
    },
  });

  const telegramSettingsMutation = useMutation({
    mutationFn: (updates: { enabled?: boolean; briefingsEnabled?: boolean; alertsEnabled?: boolean }) =>
      apiRequest("PUT", "/api/telegram/settings", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/telegram/status"] });
    },
  });

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-blue-500" />
          Telegram Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Record memories via voice or text messages on Telegram. Receive briefings and alerts.
        </p>

        {isTelegramLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : !telegramStatus?.configured ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-sm text-amber-500">
              Telegram bot token not configured. Add TELEGRAM_TOKEN to secrets.
            </p>
          </div>
        ) : telegramStatus?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-green-500">Telegram Connected</p>
                  <p className="text-xs text-muted-foreground">You can send messages to the bot to record memories</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => telegramDisconnectMutation.mutate()}
                disabled={telegramDisconnectMutation.isPending}
                data-testid="button-telegram-disconnect"
              >
                Disconnect
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Telegram</Label>
                <p className="text-xs text-muted-foreground">
                  Master toggle for all Telegram features
                </p>
              </div>
              <Switch
                data-testid="switch-telegram-enabled"
                checked={telegramStatus?.enabled ?? false}
                onCheckedChange={(checked) =>
                  telegramSettingsMutation.mutate({ enabled: checked })
                }
              />
            </div>

            {telegramStatus?.enabled && (
              <>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Morning Briefings</Label>
                    <p className="text-xs text-muted-foreground">
                      Receive daily briefing via Telegram
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-telegram-briefings"
                    checked={telegramStatus?.briefingsEnabled ?? true}
                    onCheckedChange={(checked) =>
                      telegramSettingsMutation.mutate({ briefingsEnabled: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Pattern Alerts</Label>
                    <p className="text-xs text-muted-foreground">
                      Get notified about detected patterns
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-telegram-alerts"
                    checked={telegramStatus?.alertsEnabled ?? true}
                    onCheckedChange={(checked) =>
                      telegramSettingsMutation.mutate({ alertsEnabled: checked })
                    }
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => telegramTestMutation.mutate()}
                  disabled={telegramTestMutation.isPending}
                  data-testid="button-telegram-test"
                >
                  {telegramTestMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  Send Test Message
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {telegramCode ? (
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <p className="text-sm font-medium mb-2">Click the link below to connect:</p>
                  <a
                    href={telegramCode.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-500 hover:text-blue-400 text-sm"
                    data-testid="link-telegram-connect"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Keryx Bot in Telegram
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={telegramCode.code}
                    readOnly
                    className="font-mono text-center"
                    data-testid="input-telegram-code"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(telegramCode.code)}
                    data-testid="button-copy-code"
                  >
                    {isCopied ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center">
                  Code expires in 10 minutes
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setTelegramCode(null);
                    queryClient.invalidateQueries({ queryKey: ["/api/telegram/status"] });
                  }}
                  data-testid="button-telegram-cancel"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={() => telegramConnectMutation.mutate()}
                disabled={telegramConnectMutation.isPending}
                data-testid="button-telegram-connect"
              >
                {telegramConnectMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MessageCircle className="w-4 h-4 mr-2" />
                )}
                Connect Telegram
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
