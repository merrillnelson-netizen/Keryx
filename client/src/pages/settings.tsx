import MobileLayout from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Settings } from "@shared/schema";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Partial<Settings>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentSettings, isLoading } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (newSettings: Partial<Settings>) =>
      apiRequest("PUT", "/api/settings", newSettings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved successfully" });
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
      <MobileLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading settings...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      {/* Desktop Header - Hidden on mobile */}
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground">Configure voice recognition and application preferences</p>
        </div>
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
        <p className="text-sm text-muted-foreground">Configure voice recognition and application preferences</p>
      </div>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="material-icons mr-2">mic</span>
                  Voice Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="activationPhrase">Activation Phrase</Label>
                  <Input
                    id="activationPhrase"
                    value={settings.activationPhrase || ""}
                    onChange={(e) => setSettings({ ...settings, activationPhrase: e.target.value })}
                    placeholder="Hey M"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    The phrase that triggers voice recognition
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Voice Response</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable spoken responses from the system
                    </p>
                  </div>
                  <Switch
                    checked={settings.voiceResponseEnabled || false}
                    onCheckedChange={(checked) => 
                      setSettings({ ...settings, voiceResponseEnabled: checked })
                    }
                  />
                </div>

                <div>
                  <Label>Confidence Threshold: {settings.confidenceThreshold || 80}%</Label>
                  <Slider
                    value={[settings.confidenceThreshold || 80]}
                    onValueChange={(value) => 
                      setSettings({ ...settings, confidenceThreshold: value[0] })
                    }
                    min={50}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Less Sensitive</span>
                    <span>More Sensitive</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button 
                onClick={handleSave}
                disabled={updateSettingsMutation.isPending}
              >
                {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </main>
    </MobileLayout>
  );
}
