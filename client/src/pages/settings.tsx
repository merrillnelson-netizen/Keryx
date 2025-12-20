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
import { Settings as SettingsIcon, Mic, Volume2, Save, RefreshCw, Database, Tag } from "lucide-react";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sessionCategory, setSessionCategory } = useSessionCategory();

  const { data: currentSettings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Partial<Settings>) =>
      apiRequest("PUT", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved successfully" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/backfill", { force: true });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ 
        title: "AI Analysis Complete", 
        description: `Processed ${data.entriesProcessed} memories, found mood and people data.`
      });
    },
    onError: () => {
      toast({ 
        title: "Analysis Failed", 
        description: "Could not process memories. Please try again.",
        variant: "destructive"
      });
    },
  });

  useEffect(() => {
    if (currentSettings) {
      setSettings(currentSettings);
    }
  }, [currentSettings]);

  const handleSave = () => {
    updateSettingsMutation.mutate(settings);
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
                <Database className="w-5 h-5 text-amber-500" />
                Data Management
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Re-analyze all your memories to extract mood, emotions, and people mentioned. 
                  This is useful if you have older memories that were created before these features were added.
                </p>
                <Button
                  data-testid="button-backfill"
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  variant="outline"
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
                  {backfillMutation.isPending ? "Analyzing memories..." : "Re-analyze All Memories"}
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
