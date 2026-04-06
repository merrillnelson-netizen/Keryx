import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Bell, BellOff, Loader2 } from "lucide-react";

interface PushStatus {
  enabled: boolean;
  deviceCount: number;
  devices: Array<{
    id: string;
    userAgent: string | null;
    createdAt: string;
    lastUsed: string | null;
  }>;
}

export function PushNotificationCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [isPushSupported, setIsPushSupported] = useState(false);

  const { data: pushStatus, isLoading: isPushLoading } = useQuery<PushStatus>({
    queryKey: ["/api/push/status"],
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsPushSupported(true);
      setPushPermission(Notification.permission);
    }
  }, []);

  const subscribeToPush = async () => {
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission !== 'granted') {
        toast({ title: "Notification permission denied", variant: "destructive" });
        return;
      }

      const registration = await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;

      const vapidResponse = await fetch('/api/push/vapid-key', { credentials: 'include' });
      const { publicKey } = await vapidResponse.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: publicKey,
      });

      const subscriptionJson = subscription.toJSON();

      await apiRequest('POST', '/api/push/subscribe', {
        subscription: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
        },
        userAgent: navigator.userAgent,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({ title: "Push notifications enabled!" });
    } catch (error) {
      console.error('Push subscription failed:', error);
      toast({ title: "Failed to enable notifications", variant: "destructive" });
    }
  };

  const unsubscribeFromPush = async () => {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          await apiRequest('POST', '/api/push/unsubscribe', {
            endpoint: subscription.endpoint,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/push/status"] });
      toast({ title: "Push notifications disabled" });
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
      toast({ title: "Failed to disable notifications", variant: "destructive" });
    }
  };

  const sendTestNotification = async () => {
    try {
      const response = await apiRequest('POST', '/api/push/test');
      const data = await response.json();
      if (data.success) {
        toast({ title: "Test notification sent!" });
      } else {
        toast({ title: data.message || "Failed to send test", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to send test notification", variant: "destructive" });
    }
  };

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-violet-500" />
          Push Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Get notified about briefings, pattern insights, and financial alerts directly on your device.
        </p>

        {!isPushSupported ? (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2">
              <BellOff className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium text-amber-500">Not Supported in Preview</p>
                <p className="text-xs text-muted-foreground">
                  Push notifications require a regular browser tab. If you're using Replit's preview pane, open the app in a new tab using the "Open in new tab" button. Works in Chrome, Firefox, or Edge on desktop/Android.
                </p>
              </div>
            </div>
          </div>
        ) : isPushLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : pushStatus?.deviceCount && pushStatus.deviceCount > 0 ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="text-sm font-medium text-green-500">Notifications Enabled</p>
                    <p className="text-xs text-muted-foreground">
                      {pushStatus.deviceCount} device{pushStatus.deviceCount > 1 ? 's' : ''} subscribed
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={sendTestNotification}>
                    Test
                  </Button>
                  <Button variant="ghost" size="sm" onClick={unsubscribeFromPush}>
                    Disable
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : pushPermission === 'denied' ? (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-2">
              <BellOff className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-sm font-medium text-red-500">Permission Blocked</p>
                <p className="text-xs text-muted-foreground">
                  Notifications are blocked in your browser settings. Please update your site permissions to enable them.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <Button onClick={subscribeToPush} className="w-full">
            <Bell className="w-4 h-4 mr-2" />
            Enable Push Notifications
          </Button>
        )}

        <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Bell className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-violet-400">What you'll receive:</p>
              <ul className="mt-1 space-y-0.5">
                <li>• Morning briefing reminders</li>
                <li>• Pattern and insight alerts</li>
                <li>• Financial alerts (subscription changes, unusual spending)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
