import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Category, AiActionPreference, AI_ACTION_TYPES, AI_ACTION_POLICIES } from "@shared/schema";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSessionCategory } from "@/hooks/use-session-category";
import SpeechDebug from "@/components/speech-debug";
import { Settings as SettingsIcon, Mic, Volume2, Save, RefreshCw, Database, Tag, Calendar, Mail, CheckCircle2, XCircle, Target, X, Plus, Bot, Zap, ShieldCheck, ShieldOff, ShieldQuestion, MessageCircle, ExternalLink, Copy, Loader2, Send, Landmark, Building2, CreditCard, Eye, EyeOff, Trash2, RefreshCcw, Bell, BellOff, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { usePlaidLink, PlaidLinkOnSuccessMetadata } from "react-plaid-link";

interface BackfillStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'started' | 'already_running';
  progress?: number;
  total?: number;
  processed?: number;
  calendarLinked?: number;
  embeddingsGenerated?: number;
  message?: string;
  toProcess?: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [hasShownCompletion, setHasShownCompletion] = useState(false);
  const [newProject, setNewProject] = useState("");
  const [includeEmbeddings, setIncludeEmbeddings] = useState(false);
  const [showBalances, setShowBalances] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sessionCategory, setSessionCategory } = useSessionCategory();

  const { data: currentSettings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 1000 * 60 * 10, // 10 minutes - categories rarely change
  });

  // Use combined providers status endpoint for all provider info
  const { data: providersStatus } = useQuery<{
    calendar: { google: boolean; outlook: boolean; activeProvider: string | null; userPreference: string | null };
    email: { 
      gmail: boolean; 
      outlook: boolean; 
      activeProvider: string | null; 
      userPreference: string | null;
      enabled: boolean;
      capabilities: {
        gmail: { send: boolean; read: boolean };
        outlook: { send: boolean; read: boolean };
      };
    };
    providerSelectionMode: string;
  }>({
    queryKey: ["/api/providers/status"],
    staleTime: 1000 * 60 * 5, // 5 minutes - provider status rarely changes
  });

  // Poll for backfill job status
  const { data: backfillStatus } = useQuery<BackfillStatus>({
    queryKey: ["/api/backfill/status"],
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 2 seconds while running, stop when complete
      return data?.status === 'running' ? 2000 : false;
    },
  });

  // AI Actions: available action types and user preferences
  interface AvailableActionType {
    actionType: string;
    category: string;
    description: string;
    available: boolean;
    provider?: string;
  }
  
  const { data: availableActions = [] } = useQuery<AvailableActionType[]>({
    queryKey: ["/api/actions/available"],
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const { data: actionPreferences = [] } = useQuery<AiActionPreference[]>({
    queryKey: ["/api/actions/preferences"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Partial<Settings>) =>
      apiRequest("PUT", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/status"] });
      toast({ title: "Settings saved successfully" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async (options: { includeEmbeddings?: boolean } = {}) => {
      const response = await apiRequest("POST", "/api/backfill", { 
        force: true, 
        includeEmbeddings: options.includeEmbeddings || false 
      });
      return response.json();
    },
    onSuccess: (data) => {
      setHasShownCompletion(false); // Reset so we show completion when done
      if (data.status === 'started') {
        toast({ 
          title: "Re-analysis Started", 
          description: `Processing ${data.toProcess} memories in the background. You can continue using the app.`
        });
      } else if (data.status === 'already_running') {
        toast({ 
          title: "Already Running", 
          description: "A re-analysis is already in progress."
        });
      }
      // Start polling
      queryClient.invalidateQueries({ queryKey: ["/api/backfill/status"] });
    },
    onError: () => {
      toast({ 
        title: "Analysis Failed", 
        description: "Could not start re-analysis. Please try again.",
        variant: "destructive"
      });
    },
  });

  // Update AI action preference
  const updateActionPrefMutation = useMutation({
    mutationFn: async ({ actionType, policy }: { actionType: string; policy: string }) => {
      const response = await apiRequest("PUT", `/api/actions/preferences/${encodeURIComponent(actionType)}`, { policy });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions/preferences"] });
      toast({ title: "AI action preference updated" });
    },
    onError: () => {
      toast({ title: "Failed to update preference", variant: "destructive" });
    },
  });

  // Telegram integration status
  interface TelegramStatus {
    configured: boolean;
    connected: boolean;
    enabled: boolean;
    briefingsEnabled: boolean;
    alertsEnabled: boolean;
  }

  const { data: telegramStatus, isLoading: isTelegramLoading } = useQuery<TelegramStatus>({
    queryKey: ["/api/telegram/status"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [telegramCode, setTelegramCode] = useState<{ code: string; link: string; expiresAt: string } | null>(null);
  const [isCopied, setIsCopied] = useState(false);

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

  // Push Notification status
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

  const { data: pushStatus, isLoading: isPushLoading } = useQuery<PushStatus>({
    queryKey: ["/api/push/status"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [pushPermission, setPushPermission] = useState<NotificationPermission | null>(null);
  const [isPushSupported, setIsPushSupported] = useState(false);

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
        applicationServerKey: publicKey
      });

      const subscriptionJson = subscription.toJSON();
      
      await apiRequest('POST', '/api/push/subscribe', {
        subscription: {
          endpoint: subscriptionJson.endpoint,
          keys: subscriptionJson.keys,
        },
        userAgent: navigator.userAgent
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
            endpoint: subscription.endpoint
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

  // Plaid / Financial Integration
  interface PlaidStatus {
    configured: boolean;
    enabled: boolean;
    featureDisabled?: boolean;
    includeInBriefings: boolean;
    transactionDays: number;
  }

  interface PlaidInstitution {
    id: number;
    itemId: string;
    institutionName: string | null;
    status: string;
    lastSyncedAt: string | null;
    createdAt: string;
  }

  interface PlaidAccount {
    id: number;
    accountId: string;
    plaidItemId: number;
    name: string;
    officialName: string | null;
    type: string;
    subtype: string | null;
    currentBalance: number | null;
    availableBalance: number | null;
    isHidden: boolean;
    institutionName?: string;
  }

  const { data: plaidStatus, isLoading: isPlaidLoading } = useQuery<PlaidStatus>({
    queryKey: ["/api/plaid/status"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: plaidInstitutions = [], refetch: refetchInstitutions } = useQuery<PlaidInstitution[]>({
    queryKey: ["/api/plaid/institutions"],
    enabled: plaidStatus?.configured && !plaidStatus?.featureDisabled,
    staleTime: 1000 * 60 * 10, // 10 minutes
  });

  const { data: plaidAccounts = [], refetch: refetchAccounts } = useQuery<PlaidAccount[]>({
    queryKey: ["/api/plaid/accounts"],
    enabled: plaidStatus?.configured && !plaidStatus?.featureDisabled,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [linkToken, setLinkToken] = useState<string | null>(null);

  const createLinkTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/plaid/link-token");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.linkToken) {
        setLinkToken(data.linkToken);
      }
    },
    onError: () => {
      toast({ title: "Failed to initialize bank connection", variant: "destructive" });
    },
  });

  const exchangeTokenMutation = useMutation({
    mutationFn: async ({ publicToken, institutionId, institutionName }: { publicToken: string; institutionId?: string; institutionName?: string }) => {
      const response = await apiRequest("POST", "/api/plaid/exchange-token", { publicToken, institutionId, institutionName });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/status"] });
      setLinkToken(null);
      toast({ title: "Bank account connected successfully" });
    },
    onError: () => {
      toast({ title: "Failed to connect bank account", variant: "destructive" });
    },
  });

  const disconnectInstitutionMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiRequest("DELETE", `/api/plaid/institutions/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/institutions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      toast({ title: "Bank disconnected" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect bank", variant: "destructive" });
    },
  });

  const toggleAccountVisibilityMutation = useMutation({
    mutationFn: async ({ accountId, hidden }: { accountId: string; hidden: boolean }) => {
      await apiRequest("PATCH", `/api/plaid/accounts/${accountId}/visibility`, { hidden });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
    },
    onError: () => {
      toast({ title: "Failed to update account visibility", variant: "destructive" });
    },
  });

  const syncTransactionsMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const response = await apiRequest("POST", `/api/plaid/sync/${itemId}`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/plaid/transactions"] });
      toast({ 
        title: "Transactions synced", 
        description: `Added: ${data.added}, Modified: ${data.modified}, Removed: ${data.removed}`
      });
    },
    onError: () => {
      toast({ title: "Failed to sync transactions", variant: "destructive" });
    },
  });

  const onPlaidSuccess = useCallback((publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
    exchangeTokenMutation.mutate({
      publicToken,
      institutionId: metadata?.institution?.institution_id,
      institutionName: metadata?.institution?.name,
    });
  }, [exchangeTokenMutation]);

  const onPlaidExit = useCallback(() => {
    setLinkToken(null);
  }, []);

  const { open: openPlaidLink, ready: plaidLinkReady } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: onPlaidExit,
  });

  useEffect(() => {
    if (linkToken && plaidLinkReady) {
      openPlaidLink();
    }
  }, [linkToken, plaidLinkReady, openPlaidLink]);

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Get the current policy for an action type
  const getActionPolicy = (actionType: string): string => {
    const pref = actionPreferences.find(p => p.actionType === actionType);
    return pref?.policy || AI_ACTION_POLICIES.CONFIRM;
  };

  // Handle policy change for an action
  const handlePolicyChange = (actionType: string, policy: string) => {
    updateActionPrefMutation.mutate({ actionType, policy });
  };

  // Get friendly name for action type
  const getActionTypeName = (actionType: string): string => {
    const names: Record<string, string> = {
      [AI_ACTION_TYPES.CALENDAR_CREATE]: 'Create Calendar Events',
      [AI_ACTION_TYPES.CALENDAR_UPDATE]: 'Update Calendar Events',
      [AI_ACTION_TYPES.CALENDAR_DELETE]: 'Delete Calendar Events',
      [AI_ACTION_TYPES.EMAIL_SEND]: 'Send Emails',
      [AI_ACTION_TYPES.EMAIL_REPLY]: 'Reply to Emails',
      [AI_ACTION_TYPES.REMINDER_CREATE]: 'Create Reminders',
      [AI_ACTION_TYPES.PERSON_UPDATE]: 'Update People Info',
    };
    return names[actionType] || actionType;
  };

  // Get icon for policy
  const getPolicyIcon = (policy: string) => {
    switch (policy) {
      case AI_ACTION_POLICIES.AUTO:
        return <Zap className="w-4 h-4 text-green-500" />;
      case AI_ACTION_POLICIES.CONFIRM:
        return <ShieldQuestion className="w-4 h-4 text-yellow-500" />;
      case AI_ACTION_POLICIES.DISABLED:
        return <ShieldOff className="w-4 h-4 text-red-500" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Show completion toast when job finishes
  useEffect(() => {
    if (backfillStatus?.status === 'completed' && !hasShownCompletion) {
      setHasShownCompletion(true);
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ 
        title: "Re-analysis Complete!", 
        description: backfillStatus.message || `Processed ${backfillStatus.processed} memories.`
      });
    } else if (backfillStatus?.status === 'failed' && !hasShownCompletion) {
      setHasShownCompletion(true);
      toast({ 
        title: "Re-analysis Failed", 
        description: backfillStatus.message || "Something went wrong. Please try again.",
        variant: "destructive"
      });
    }
  }, [backfillStatus?.status, hasShownCompletion, queryClient, toast, backfillStatus?.message, backfillStatus?.processed]);

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
  };

  // Auto-save provider preference when clicked (sends full settings to preserve other fields)
  const handleProviderSelect = (type: 'calendar' | 'email', provider: string) => {
    if (updateSettingsMutation.isPending) return; // Prevent rapid clicks
    const newSettings = type === 'calendar' 
      ? { ...settings, calendarProvider: provider }
      : { ...settings, emailProvider: provider };
    setSettings(newSettings);
    updateSettingsMutation.mutate(newSettings);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Settings</h2>
              <p className="text-sm text-muted-foreground">Configure your voice assistant</p>
            </div>
          </div>
        </div>

        {/* Settings Cards */}
        <div className="max-w-2xl space-y-6">
          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mic className="w-5 h-5 text-primary" />
                Voice Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base">Voice Response</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable spoken responses from the system
                  </p>
                </div>
                <Switch
                  data-testid="switch-voice-response"
                  checked={settings.voiceResponseEnabled || false}
                  onCheckedChange={(checked) => 
                    setSettings(prev => ({ ...prev, voiceResponseEnabled: checked }))
                  }
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">Confidence Threshold</Label>
                  <span className="text-sm font-medium text-primary">{settings.confidenceThreshold || 80}%</span>
                </div>
                <Slider
                  data-testid="slider-confidence"
                  value={[settings.confidenceThreshold || 80]}
                  onValueChange={(value) => 
                    setSettings(prev => ({ ...prev, confidenceThreshold: value[0] }))
                  }
                  min={50}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum confidence level for voice recognition
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-secondary" />
                Voice Recognition Debug
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SpeechDebug />
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-accent" />
                Session Category
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Set a category to automatically apply to all new memories. Great for extended sessions 
                  like hobbies or activities where you'll log multiple related memories. Resets to Auto when you close the browser.
                </p>
                <Select
                  value={sessionCategory || "auto"}
                  onValueChange={(value) => setSessionCategory(value === "auto" ? null : value)}
                >
                  <SelectTrigger data-testid="select-session-category">
                    <SelectValue placeholder="Auto (AI decides)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (AI decides)</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.name}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {sessionCategory && (
                  <p className="text-xs text-primary">
                    All new memories will be tagged with "{sessionCategory}"
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-green-500" />
                Active Projects
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Mark topics as active focus areas. These topics will be weighted higher in search results 
                and given priority in your daily briefings.
              </p>
              
              <div className="flex gap-2">
                <Input
                  data-testid="input-new-project"
                  placeholder="Add a topic (e.g., Product Launch, Home Renovation)"
                  value={newProject}
                  onChange={(e) => setNewProject(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newProject.trim()) {
                      const current = settings.activeProjects || [];
                      if (!current.includes(newProject.trim())) {
                        const newProjects = [...current, newProject.trim()];
                        setSettings(prev => ({ ...prev, activeProjects: newProjects }));
                        updateSettingsMutation.mutate({ ...settings, activeProjects: newProjects });
                      }
                      setNewProject("");
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  data-testid="button-add-project"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (newProject.trim()) {
                      const current = settings.activeProjects || [];
                      if (!current.includes(newProject.trim())) {
                        const newProjects = [...current, newProject.trim()];
                        setSettings(prev => ({ ...prev, activeProjects: newProjects }));
                        updateSettingsMutation.mutate({ ...settings, activeProjects: newProjects });
                      }
                      setNewProject("");
                    }
                  }}
                  disabled={!newProject.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {settings.activeProjects && settings.activeProjects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {settings.activeProjects.map((project, idx) => (
                    <Badge 
                      key={idx} 
                      variant="outline" 
                      className="bg-green-500/10 border-green-500/30 text-green-400 py-1.5 pr-1.5 flex items-center gap-1"
                    >
                      {project}
                      <button
                        data-testid={`button-remove-project-${idx}`}
                        onClick={() => {
                          const newProjects = settings.activeProjects?.filter((_, i) => i !== idx) || [];
                          setSettings(prev => ({ ...prev, activeProjects: newProjects }));
                          updateSettingsMutation.mutate({ ...settings, activeProjects: newProjects });
                        }}
                        className="ml-1 hover:bg-green-500/20 rounded p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No active projects set. Add topics you're currently focused on.
                </p>
              )}
              
              {categories.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <p className="text-xs text-muted-foreground">Quick add from your categories:</p>
                  <div className="flex flex-wrap gap-1">
                    {categories
                      .filter(cat => !settings.activeProjects?.includes(cat.name))
                      .slice(0, 8)
                      .map((category) => (
                        <Button
                          key={category.id}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            const current = settings.activeProjects || [];
                            const newProjects = [...current, category.name];
                            setSettings(prev => ({ ...prev, activeProjects: newProjects }));
                            updateSettingsMutation.mutate({ ...settings, activeProjects: newProjects });
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          {category.name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-purple-500" />
                Calendar Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect a calendar to automatically link memories to meetings.
              </p>
              
              <div className="space-y-3">
                <div 
                  className={`p-3 rounded-lg transition-colors ${
                    providersStatus?.calendar.google 
                      ? settings.googleCalendarEnabled !== false
                        ? providersStatus?.calendar.activeProvider === 'google'
                          ? 'bg-blue-500/10 border border-blue-500/30'
                          : 'bg-muted/30'
                        : 'bg-muted/30 opacity-60'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  data-testid="calendar-provider-google"
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className={`flex items-center gap-3 flex-1 ${providersStatus?.calendar.google && settings.googleCalendarEnabled !== false ? 'cursor-pointer hover:opacity-80' : ''}`}
                      onClick={() => providersStatus?.calendar.google && settings.googleCalendarEnabled !== false && handleProviderSelect('calendar', 'google')}
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="text-blue-500 text-xs font-bold">G</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Google Calendar</span>
                        {providersStatus?.calendar.google && settings.googleCalendarEnabled !== false && providersStatus?.calendar.activeProvider === 'google' && (
                          <p className="text-xs text-green-500">Active</p>
                        )}
                        {providersStatus?.calendar.google && settings.googleCalendarEnabled !== false && providersStatus?.calendar.activeProvider !== 'google' && (
                          <p className="text-xs text-muted-foreground">Click to make active</p>
                        )}
                        {providersStatus?.calendar.google && settings.googleCalendarEnabled === false && (
                          <p className="text-xs text-muted-foreground">Disabled by user</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {providersStatus?.calendar.google ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${providersStatus?.calendar.google ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {providersStatus?.calendar.google ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      {providersStatus?.calendar.google && (
                        <Switch
                          data-testid="switch-google-calendar-enabled"
                          checked={settings.googleCalendarEnabled !== false}
                          onCheckedChange={(checked) => 
                            setSettings(prev => ({ ...prev, googleCalendarEnabled: checked }))
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div 
                  className={`p-3 rounded-lg transition-colors ${
                    providersStatus?.calendar.outlook 
                      ? settings.outlookCalendarEnabled !== false
                        ? providersStatus?.calendar.activeProvider === 'outlook'
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'bg-muted/30'
                        : 'bg-muted/30 opacity-60'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  data-testid="calendar-provider-outlook"
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className={`flex items-center gap-3 flex-1 ${providersStatus?.calendar.outlook && settings.outlookCalendarEnabled !== false ? 'cursor-pointer hover:opacity-80' : ''}`}
                      onClick={() => providersStatus?.calendar.outlook && settings.outlookCalendarEnabled !== false && handleProviderSelect('calendar', 'outlook')}
                    >
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-cyan-500 text-xs font-bold">O</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Outlook Calendar</span>
                        {providersStatus?.calendar.outlook && settings.outlookCalendarEnabled !== false && providersStatus?.calendar.activeProvider === 'outlook' && (
                          <p className="text-xs text-green-500">Active</p>
                        )}
                        {providersStatus?.calendar.outlook && settings.outlookCalendarEnabled !== false && providersStatus?.calendar.activeProvider !== 'outlook' && (
                          <p className="text-xs text-muted-foreground">Click to make active</p>
                        )}
                        {providersStatus?.calendar.outlook && settings.outlookCalendarEnabled === false && (
                          <p className="text-xs text-muted-foreground">Disabled by user</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {providersStatus?.calendar.outlook ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${providersStatus?.calendar.outlook ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {providersStatus?.calendar.outlook ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      {providersStatus?.calendar.outlook && (
                        <Switch
                          data-testid="switch-outlook-calendar-enabled"
                          checked={settings.outlookCalendarEnabled !== false}
                          onCheckedChange={(checked) => 
                            setSettings(prev => ({ ...prev, outlookCalendarEnabled: checked }))
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(providersStatus?.calendar.google || providersStatus?.calendar.outlook) && (
                <div className="flex items-center justify-between pt-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Auto-link Meetings</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically link new memories to current calendar events
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-calendar-autolink"
                    checked={settings.calendarAutoLink !== false}
                    onCheckedChange={(checked) => 
                      setSettings(prev => ({ ...prev, calendarAutoLink: checked }))
                    }
                  />
                </div>
              )}

              {!providersStatus?.calendar.google && !providersStatus?.calendar.outlook && (
                <p className="text-xs text-muted-foreground mt-2">
                  Calendars are connected via the Replit integrations panel.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-500" />
                Email Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Connect email to send summaries and reminders from your memories.
              </p>
              
              <div className="space-y-3">
                <div 
                  className={`p-3 rounded-lg transition-colors ${
                    providersStatus?.email.gmail 
                      ? settings.gmailEnabled !== false
                        ? providersStatus?.email.activeProvider === 'gmail'
                          ? 'bg-red-500/10 border border-red-500/30'
                          : 'bg-muted/30'
                        : 'bg-muted/30 opacity-60'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  data-testid="email-provider-gmail"
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className={`flex items-center gap-3 flex-1 ${providersStatus?.email.gmail && settings.gmailEnabled !== false ? 'cursor-pointer hover:opacity-80' : ''}`}
                      onClick={() => providersStatus?.email.gmail && settings.gmailEnabled !== false && handleProviderSelect('email', 'gmail')}
                    >
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                        <span className="text-red-500 text-xs font-bold">G</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Gmail</span>
                        {providersStatus?.email.gmail && settings.gmailEnabled !== false && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {providersStatus?.email.capabilities?.gmail?.read ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-500 border-green-500/30">
                                Full access
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                Send only
                              </Badge>
                            )}
                          </div>
                        )}
                        {providersStatus?.email.gmail && settings.gmailEnabled !== false && providersStatus?.email.activeProvider === 'gmail' && (
                          <p className="text-xs text-green-500">Active</p>
                        )}
                        {providersStatus?.email.gmail && settings.gmailEnabled !== false && providersStatus?.email.activeProvider !== 'gmail' && (
                          <p className="text-xs text-muted-foreground">Click to make active</p>
                        )}
                        {providersStatus?.email.gmail && settings.gmailEnabled === false && (
                          <p className="text-xs text-muted-foreground">Disabled by user</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {providersStatus?.email.gmail ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${providersStatus?.email.gmail ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {providersStatus?.email.gmail ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      {providersStatus?.email.gmail && (
                        <Switch
                          data-testid="switch-gmail-enabled"
                          checked={settings.gmailEnabled !== false}
                          onCheckedChange={(checked) => 
                            setSettings(prev => ({ ...prev, gmailEnabled: checked }))
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div 
                  className={`p-3 rounded-lg transition-colors ${
                    providersStatus?.email.outlook 
                      ? settings.outlookMailEnabled !== false
                        ? providersStatus?.email.activeProvider === 'outlook'
                          ? 'bg-cyan-500/10 border border-cyan-500/30'
                          : 'bg-muted/30'
                        : 'bg-muted/30 opacity-60'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  data-testid="email-provider-outlook"
                >
                  <div className="flex items-center justify-between">
                    <div 
                      className={`flex items-center gap-3 flex-1 ${providersStatus?.email.outlook && settings.outlookMailEnabled !== false ? 'cursor-pointer hover:opacity-80' : ''}`}
                      onClick={() => providersStatus?.email.outlook && settings.outlookMailEnabled !== false && handleProviderSelect('email', 'outlook')}
                    >
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                        <span className="text-cyan-500 text-xs font-bold">O</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Outlook Mail</span>
                        {providersStatus?.email.outlook && settings.outlookMailEnabled !== false && (
                          <div className="flex items-center gap-1 mt-0.5">
                            {providersStatus?.email.capabilities?.outlook?.read ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-500/10 text-green-500 border-green-500/30">
                                Full access
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-500 border-amber-500/30">
                                Send only
                              </Badge>
                            )}
                          </div>
                        )}
                        {providersStatus?.email.outlook && settings.outlookMailEnabled !== false && providersStatus?.email.activeProvider === 'outlook' && (
                          <p className="text-xs text-green-500">Active</p>
                        )}
                        {providersStatus?.email.outlook && settings.outlookMailEnabled !== false && providersStatus?.email.activeProvider !== 'outlook' && (
                          <p className="text-xs text-muted-foreground">Click to make active</p>
                        )}
                        {providersStatus?.email.outlook && settings.outlookMailEnabled === false && (
                          <p className="text-xs text-muted-foreground">Disabled by user</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {providersStatus?.email.outlook ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className={`text-xs ${providersStatus?.email.outlook ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {providersStatus?.email.outlook ? 'Connected' : 'Not connected'}
                        </span>
                      </div>
                      {providersStatus?.email.outlook && (
                        <Switch
                          data-testid="switch-outlook-mail-enabled"
                          checked={settings.outlookMailEnabled !== false}
                          onCheckedChange={(checked) => 
                            setSettings(prev => ({ ...prev, outlookMailEnabled: checked }))
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(providersStatus?.email.gmail || providersStatus?.email.outlook) && (
                <div className="flex items-center justify-between pt-2">
                  <div className="space-y-0.5">
                    <Label className="text-base">Enable Email Features</Label>
                    <p className="text-xs text-muted-foreground">
                      Use email for briefings and AI-generated summaries
                    </p>
                  </div>
                  <Switch
                    data-testid="switch-email-enabled"
                    checked={settings.emailIntegrationEnabled !== false}
                    onCheckedChange={(checked) => 
                      setSettings(prev => ({ ...prev, emailIntegrationEnabled: checked }))
                    }
                  />
                </div>
              )}

              {!providersStatus?.email.gmail && !providersStatus?.email.outlook && (
                <p className="text-xs text-muted-foreground mt-2">
                  Email services are connected via the Replit integrations panel.
                </p>
              )}
            </CardContent>
          </Card>

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

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-emerald-500" />
                Financial Accounts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPlaidLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : plaidStatus?.featureDisabled ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex gap-2 text-sm text-muted-foreground">
                    <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-600 dark:text-amber-400">Financial integration is not configured</p>
                      <p className="text-xs mt-1">
                        Plaid credentials are required to enable bank account connections. 
                        Please add your PLAID_CLIENT_ID and PLAID_SECRET to enable this feature.
                      </p>
                    </div>
                  </div>
                </div>
              ) : !plaidStatus?.configured ? (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex gap-2 text-sm text-muted-foreground">
                    <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-600 dark:text-amber-400">Plaid credentials not found</p>
                      <p className="text-xs mt-1">
                        Add your Plaid API credentials to connect bank accounts for spending insights.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Connect your bank accounts to include spending insights in your morning briefings.
                  </p>

                  {plaidInstitutions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Connected Banks</Label>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowBalances(!showBalances)}
                          className="text-xs gap-1"
                        >
                          {showBalances ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          {showBalances ? 'Hide Balances' : 'Show Balances'}
                        </Button>
                      </div>
                      {plaidInstitutions.map((institution) => (
                        <div 
                          key={institution.itemId}
                          className="p-3 rounded-lg bg-muted/20 border border-white/10"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Building2 className="w-5 h-5 text-emerald-500" />
                              <div>
                                <span className="text-sm font-medium">
                                  {institution.institutionName || 'Unknown Bank'}
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge 
                                    variant={institution.status === 'active' ? 'default' : 'destructive'}
                                    className="text-xs"
                                  >
                                    {institution.status}
                                  </Badge>
                                  {institution.lastSyncedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      Last synced: {new Date(institution.lastSyncedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => syncTransactionsMutation.mutate(String(institution.id))}
                                disabled={syncTransactionsMutation.isPending}
                                title="Sync transactions"
                                data-testid={`button-sync-${institution.id}`}
                              >
                                <RefreshCcw className={`w-4 h-4 ${syncTransactionsMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => disconnectInstitutionMutation.mutate(String(institution.id))}
                                disabled={disconnectInstitutionMutation.isPending}
                                title="Disconnect bank"
                                data-testid={`button-disconnect-${institution.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>

                          {plaidAccounts.filter(a => {
                            const inst = plaidInstitutions.find(i => i.id === a.plaidItemId);
                            return inst?.itemId === institution.itemId;
                          }).length > 0 && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                              {plaidAccounts
                                .filter(a => {
                                  const inst = plaidInstitutions.find(i => i.id === a.plaidItemId);
                                  return inst?.itemId === institution.itemId;
                                })
                                .map((account) => (
                                  <div 
                                    key={account.accountId}
                                    className={`flex items-center justify-between p-2 rounded ${account.isHidden ? 'opacity-50' : ''}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <CreditCard className="w-4 h-4 text-muted-foreground" />
                                      <div>
                                        <span className="text-sm">{account.name}</span>
                                        <span className="text-xs text-muted-foreground ml-2">
                                          {account.type}{account.subtype ? ` - ${account.subtype}` : ''}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {account.currentBalance !== null && (
                                        <span className="text-sm font-medium">
                                          {showBalances 
                                            ? `$${account.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                                            : '•••••'
                                          }
                                        </span>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        onClick={() => toggleAccountVisibilityMutation.mutate({ 
                                          accountId: account.accountId, 
                                          hidden: !account.isHidden 
                                        })}
                                        title={account.isHidden ? 'Show in briefings' : 'Hide from briefings'}
                                        data-testid={`button-visibility-${account.accountId}`}
                                      >
                                        {account.isHidden ? (
                                          <EyeOff className="w-4 h-4" />
                                        ) : (
                                          <Eye className="w-4 h-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => createLinkTokenMutation.mutate()}
                    disabled={createLinkTokenMutation.isPending || exchangeTokenMutation.isPending}
                    data-testid="button-connect-bank"
                  >
                    {createLinkTokenMutation.isPending || exchangeTokenMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    {plaidInstitutions.length > 0 ? 'Connect Another Bank' : 'Connect Bank Account'}
                  </Button>

                  {plaidInstitutions.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Enable Financial Features</Label>
                          <p className="text-xs text-muted-foreground">
                            Use connected bank data for insights and queries
                          </p>
                        </div>
                        <Switch
                          checked={settings.plaidEnabled ?? false}
                          onCheckedChange={(checked) => {
                            const newSettings = { ...settings, plaidEnabled: checked };
                            setSettings(newSettings);
                            updateSettingsMutation.mutate(newSettings);
                          }}
                          data-testid="switch-plaid-enabled"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label>Include in Briefings</Label>
                          <p className="text-xs text-muted-foreground">
                            Show spending insights in morning briefings
                          </p>
                        </div>
                        <Switch
                          checked={settings.plaidIncludeInBriefings ?? true}
                          onCheckedChange={(checked) => {
                            const newSettings = { ...settings, plaidIncludeInBriefings: checked };
                            setSettings(newSettings);
                            updateSettingsMutation.mutate(newSettings);
                          }}
                          disabled={!settings.plaidEnabled}
                          data-testid="switch-plaid-briefings"
                        />
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      <Landmark className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p>
                        Bank connections are secured by Plaid and never share your login credentials with Keryx.
                        Your data is encrypted and used only for spending insights.
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-violet-500" />
                AI Task Execution
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Allow Keryx to perform actions on your behalf. Choose how each action type should be handled.
              </p>
              
              <div className="space-y-3">
                {availableActions.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    Connect a calendar or email service to enable AI actions.
                  </p>
                ) : (
                  availableActions.map((action) => {
                    const currentPolicy = getActionPolicy(action.actionType);
                    return (
                      <div 
                        key={action.actionType}
                        className={`p-3 rounded-lg border ${
                          action.available 
                            ? 'bg-muted/20 border-white/10' 
                            : 'bg-muted/10 border-white/5 opacity-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getPolicyIcon(currentPolicy)}
                            <div>
                              <span className="text-sm font-medium">{getActionTypeName(action.actionType)}</span>
                              <p className="text-xs text-muted-foreground">{action.description}</p>
                              {action.provider && (
                                <Badge variant="outline" className="text-xs mt-1">
                                  via {action.provider}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Select 
                            value={currentPolicy} 
                            onValueChange={(value) => handlePolicyChange(action.actionType, value)}
                            disabled={!action.available || updateActionPrefMutation.isPending}
                          >
                            <SelectTrigger 
                              className="w-32 h-8 text-xs"
                              data-testid={`select-policy-${action.actionType.replace('.', '-')}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">
                                <span className="flex items-center gap-2">
                                  <Zap className="w-3 h-3 text-green-500" /> Auto
                                </span>
                              </SelectItem>
                              <SelectItem value="confirm">
                                <span className="flex items-center gap-2">
                                  <ShieldQuestion className="w-3 h-3 text-yellow-500" /> Confirm
                                </span>
                              </SelectItem>
                              <SelectItem value="disabled">
                                <span className="flex items-center gap-2">
                                  <ShieldOff className="w-3 h-3 text-red-500" /> Disabled
                                </span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <Bot className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p><strong>Auto:</strong> AI executes immediately without asking</p>
                    <p><strong>Confirm:</strong> AI proposes actions for your approval</p>
                    <p><strong>Disabled:</strong> AI will never perform this action</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-amber-500" />
                Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Re-analyze all your memories to extract mood, emotions, people mentioned, and link to calendar events. 
                  This is useful if you have older memories that were created before these features were added.
                </p>
                
                {/* Progress indicator when running */}
                {backfillStatus?.status === 'running' && (
                  <div className="space-y-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary font-medium">Processing in background...</span>
                      <span className="text-muted-foreground">{backfillStatus.progress}%</span>
                    </div>
                    <Progress value={backfillStatus.progress || 0} className="h-2" />
                    <p className="text-xs text-muted-foreground">{backfillStatus.message}</p>
                  </div>
                )}

                {/* Completion message */}
                {backfillStatus?.status === 'completed' && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-500 font-medium">{backfillStatus.message}</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-3 py-2">
                  <Switch
                    id="include-embeddings"
                    checked={includeEmbeddings}
                    onCheckedChange={setIncludeEmbeddings}
                    disabled={backfillStatus?.status === 'running'}
                    data-testid="switch-include-embeddings"
                  />
                  <div className="flex-1">
                    <Label htmlFor="include-embeddings" className="text-sm font-medium">
                      Regenerate Search Embeddings
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Also regenerate vector embeddings for improved search accuracy (slower, uses more AI credits)
                    </p>
                  </div>
                </div>

                <Button
                  data-testid="button-backfill"
                  onClick={() => backfillMutation.mutate({ includeEmbeddings })}
                  disabled={backfillMutation.isPending || backfillStatus?.status === 'running'}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${backfillStatus?.status === 'running' ? 'animate-spin' : ''}`} />
                  {backfillStatus?.status === 'running' 
                    ? `Processing ${backfillStatus.processed || 0} of ${backfillStatus.total || 0}...` 
                    : "Re-analyze All Memories"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              data-testid="button-save-settings"
              onClick={handleSave}
              disabled={updateSettingsMutation.isPending}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white font-semibold px-6"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
