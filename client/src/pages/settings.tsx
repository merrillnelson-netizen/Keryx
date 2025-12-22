import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Settings, Category } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSessionCategory } from "@/hooks/use-session-category";
import SpeechDebug from "@/components/speech-debug";
import { Settings as SettingsIcon, Mic, Volume2, Save, RefreshCw, Database, Tag, Calendar, Mail, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface BackfillStatus {
  status: 'idle' | 'running' | 'completed' | 'failed' | 'started' | 'already_running';
  progress?: number;
  total?: number;
  processed?: number;
  calendarLinked?: number;
  message?: string;
  toProcess?: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const [hasShownCompletion, setHasShownCompletion] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sessionCategory, setSessionCategory } = useSessionCategory();

  const { data: currentSettings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Use combined providers status endpoint for all provider info
  const { data: providersStatus } = useQuery<{
    calendar: { google: boolean; outlook: boolean; activeProvider: string | null; userPreference: string | null };
    email: { gmail: boolean; outlook: boolean; activeProvider: string | null; userPreference: string | null };
    providerSelectionMode: string;
  }>({
    queryKey: ["/api/providers/status"],
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
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/backfill", { force: true });
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

  // Auto-save provider preference when clicked
  const handleProviderSelect = (type: 'calendar' | 'email', provider: string) => {
    const newSettings = type === 'calendar' 
      ? { ...settings, calendarProvider: provider }
      : { ...settings, emailProvider: provider };
    setSettings(newSettings);
    updateSettingsMutation.mutate(
      type === 'calendar' 
        ? { calendarProvider: provider } 
        : { emailProvider: provider }
    );
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
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    providersStatus?.calendar.google 
                      ? providersStatus?.calendar.activeProvider === 'google'
                        ? 'bg-blue-500/10 border border-blue-500/30'
                        : 'bg-muted/30 hover:bg-blue-500/5'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  onClick={() => providersStatus?.calendar.google && handleProviderSelect('calendar', 'google')}
                  data-testid="calendar-provider-google"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <span className="text-blue-500 text-xs font-bold">G</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Google Calendar</span>
                      {providersStatus?.calendar.google && providersStatus?.calendar.activeProvider === 'google' && (
                        <p className="text-xs text-green-500">Active</p>
                      )}
                      {providersStatus?.calendar.google && providersStatus?.calendar.activeProvider !== 'google' && (
                        <p className="text-xs text-muted-foreground">Click to make active</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {providersStatus?.calendar.google ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${providersStatus?.calendar.google ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {providersStatus?.calendar.google ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>

                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    providersStatus?.calendar.outlook 
                      ? providersStatus?.calendar.activeProvider === 'outlook'
                        ? 'bg-cyan-500/10 border border-cyan-500/30'
                        : 'bg-muted/30 hover:bg-cyan-500/5'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  onClick={() => providersStatus?.calendar.outlook && handleProviderSelect('calendar', 'outlook')}
                  data-testid="calendar-provider-outlook"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <span className="text-cyan-500 text-xs font-bold">O</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Outlook Calendar</span>
                      {providersStatus?.calendar.outlook && providersStatus?.calendar.activeProvider === 'outlook' && (
                        <p className="text-xs text-green-500">Active</p>
                      )}
                      {providersStatus?.calendar.outlook && providersStatus?.calendar.activeProvider !== 'outlook' && (
                        <p className="text-xs text-muted-foreground">Click to make active</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {providersStatus?.calendar.outlook ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${providersStatus?.calendar.outlook ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {providersStatus?.calendar.outlook ? 'Connected' : 'Not connected'}
                    </span>
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
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    providersStatus?.email.gmail 
                      ? providersStatus?.email.activeProvider === 'gmail'
                        ? 'bg-red-500/10 border border-red-500/30'
                        : 'bg-muted/30 hover:bg-red-500/5'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  onClick={() => providersStatus?.email.gmail && handleProviderSelect('email', 'gmail')}
                  data-testid="email-provider-gmail"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                      <span className="text-red-500 text-xs font-bold">G</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Gmail</span>
                      {providersStatus?.email.gmail && providersStatus?.email.activeProvider === 'gmail' && (
                        <p className="text-xs text-green-500">Active</p>
                      )}
                      {providersStatus?.email.gmail && providersStatus?.email.activeProvider !== 'gmail' && (
                        <p className="text-xs text-muted-foreground">Click to make active</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {providersStatus?.email.gmail ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${providersStatus?.email.gmail ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {providersStatus?.email.gmail ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>

                <div 
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    providersStatus?.email.outlook 
                      ? providersStatus?.email.activeProvider === 'outlook'
                        ? 'bg-cyan-500/10 border border-cyan-500/30'
                        : 'bg-muted/30 hover:bg-cyan-500/5'
                      : 'bg-muted/30 opacity-60'
                  }`}
                  onClick={() => providersStatus?.email.outlook && handleProviderSelect('email', 'outlook')}
                  data-testid="email-provider-outlook"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <span className="text-cyan-500 text-xs font-bold">O</span>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Outlook Mail</span>
                      {providersStatus?.email.outlook && providersStatus?.email.activeProvider === 'outlook' && (
                        <p className="text-xs text-green-500">Active</p>
                      )}
                      {providersStatus?.email.outlook && providersStatus?.email.activeProvider !== 'outlook' && (
                        <p className="text-xs text-muted-foreground">Click to make active</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {providersStatus?.email.outlook ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <span className={`text-sm ${providersStatus?.email.outlook ? 'text-green-500' : 'text-muted-foreground'}`}>
                      {providersStatus?.email.outlook ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                </div>
              </div>

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

                <Button
                  data-testid="button-backfill"
                  onClick={() => backfillMutation.mutate()}
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
