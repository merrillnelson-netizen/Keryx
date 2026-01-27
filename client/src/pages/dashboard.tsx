import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { 
  Sun, 
  Moon, 
  CloudSun, 
  Sparkles, 
  Target, 
  Bell, 
  Heart, 
  Lightbulb, 
  AlertTriangle,
  CheckCircle,
  Info,
  RefreshCw,
  Loader2,
  Mail,
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";
import PendingActions from "@/components/pending-actions";
import ContextualDiscoveries from "@/components/contextual-discoveries";

interface MorningBriefing {
  greeting: string;
  summary: string;
  focusAreas: string[];
  reminders: string[];
  moodTrend: string;
  affirmation: string;
  emailHighlights?: string[];
  financialInsights?: string[];
}

interface PatternAlert {
  type: "positive" | "negative" | "neutral" | "insight";
  title: string;
  description: string;
  actionSuggestion?: string;
}

const getTimeIcon = () => {
  const hour = new Date().getHours();
  if (hour < 6 || hour >= 20) return Moon;
  if (hour < 12) return Sun;
  return CloudSun;
};

const getAlertStyle = (type: PatternAlert["type"]) => {
  switch (type) {
    case "positive":
      return { 
        bg: "bg-green-500/20", 
        border: "border-green-500/30", 
        icon: CheckCircle,
        iconColor: "text-green-500"
      };
    case "negative":
      return { 
        bg: "bg-red-500/20", 
        border: "border-red-500/30", 
        icon: AlertTriangle,
        iconColor: "text-red-500"
      };
    case "insight":
      return { 
        bg: "bg-purple-500/20", 
        border: "border-purple-500/30", 
        icon: Lightbulb,
        iconColor: "text-purple-500"
      };
    default:
      return { 
        bg: "bg-blue-500/20", 
        border: "border-blue-500/30", 
        icon: Info,
        iconColor: "text-blue-500"
      };
  }
};

interface BriefingResponse {
  data: MorningBriefing;
  memoriesAnalyzed: number;
  emailsAnalyzed?: number;
  hasFinancialData?: boolean;
  generatedAt: string;
}

interface AlertsResponse {
  data: PatternAlert[];
  memoriesAnalyzed: number;
  periodDays: number;
}

export default function Dashboard() {
  // Custom queryFn to preserve full response with metadata
  const { data: briefingData, isLoading: briefingLoading, isFetching: briefingFetching, refetch: refetchBriefing } = useQuery<BriefingResponse>({
    queryKey: ["/api/briefing"],
    queryFn: async () => {
      const localHour = new Date().getHours();
      const response = await fetch(`/api/briefing?localHour=${localHour}`, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const { data: alertsData, isLoading: alertsLoading, isFetching: alertsFetching, refetch: refetchAlerts } = useQuery<AlertsResponse>({
    queryKey: ["/api/alerts"],
    queryFn: async () => {
      const response = await fetch("/api/alerts", { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  const TimeIcon = getTimeIcon();
  const briefing = briefingData?.data;
  const alerts = alertsData?.data || [];

  const handleRefresh = () => {
    refetchBriefing();
    refetchAlerts();
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header with Refresh */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 flex items-center justify-center">
                <TimeIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Your Daily Briefing</h2>
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleDateString("en-US", { 
                    weekday: "long", 
                    month: "long", 
                    day: "numeric" 
                  })}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={briefingFetching || alertsFetching}
              className="border-white/20 hover:bg-white/10"
              data-testid="button-refresh-briefing"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", (briefingFetching || alertsFetching) && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Main Briefing Card */}
        {briefingLoading ? (
          <Card className="glass-card border-white/20">
            <CardContent className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Generating your personalized briefing...</p>
            </CardContent>
          </Card>
        ) : briefing ? (
          <Card className="glass-card border-white/20 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5" />
            <CardHeader className="relative">
              <CardTitle className="text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-500" />
                {briefing.greeting}
              </CardTitle>
              <CardDescription className="text-base leading-relaxed mt-2">
                {briefing.summary}
              </CardDescription>
            </CardHeader>
            <CardContent className="relative space-y-6">
              {/* Focus Areas */}
              {briefing.focusAreas.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Focus Areas for Today
                  </h4>
                  <div className="grid gap-2">
                    {briefing.focusAreas.map((area, i) => (
                      <div key={i} className="glass-card p-3 rounded-lg flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs font-medium text-primary">{i + 1}</span>
                        </div>
                        <p className="text-muted-foreground">{area}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reminders */}
              {briefing.reminders.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4 text-amber-500" />
                    Reminders
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {briefing.reminders.map((reminder, i) => (
                      <Badge 
                        key={i} 
                        variant="outline" 
                        className="bg-amber-500/10 border-amber-500/30 text-amber-300 py-1.5"
                      >
                        {reminder}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Highlights */}
              {briefing.emailHighlights && briefing.emailHighlights.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Mail className="w-4 h-4 text-blue-500" />
                    Relevant Emails
                  </h4>
                  <div className="grid gap-2">
                    {briefing.emailHighlights.map((highlight, i) => (
                      <div key={i} className="glass-card p-3 rounded-lg flex items-start gap-3 border-l-2 border-l-blue-500">
                        <p className="text-muted-foreground text-sm">{highlight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Financial Insights */}
              {briefing.financialInsights && briefing.financialInsights.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-500" />
                    Spending Insights
                  </h4>
                  <div className="grid gap-2">
                    {briefing.financialInsights.map((insight, i) => (
                      <div key={i} className="glass-card p-3 rounded-lg flex items-start gap-3 border-l-2 border-l-emerald-500">
                        <p className="text-muted-foreground text-sm">{insight}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : briefingData?.hasFinancialData ? (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-500" />
                    Spending Insights
                  </h4>
                  <div className="glass-card p-3 rounded-lg border-l-2 border-l-emerald-500/50">
                    <p className="text-muted-foreground text-sm">No recent transactions to analyze. Sync your accounts in Settings to get spending insights.</p>
                  </div>
                </div>
              ) : null}

              {/* Mood Trend */}
              <div className="glass-card p-4 rounded-xl border-l-4 border-l-pink-500">
                <div className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-foreground mb-1">Emotional Patterns</h4>
                    <p className="text-muted-foreground text-sm">{briefing.moodTrend}</p>
                  </div>
                </div>
              </div>

              {/* Affirmation */}
              <div className="bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 p-4 rounded-xl text-center">
                <p className="text-lg font-medium text-foreground italic">"{briefing.affirmation}"</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="glass-card border-white/20">
            <CardContent className="py-12 text-center">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-foreground mb-2">No briefing available</h3>
              <p className="text-muted-foreground">Start logging memories to get personalized briefings</p>
            </CardContent>
          </Card>
        )}

        {/* Pending AI Actions */}
        <PendingActions />

        {/* Personal News Feed */}
        <ContextualDiscoveries />

        {/* Pattern Alerts */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              Pattern Alerts
            </CardTitle>
            <CardDescription>
              AI-detected patterns from your recent memories
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alertsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-8">
                <Info className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">
                  {alertsData?.memoriesAnalyzed && alertsData.memoriesAnalyzed < 5
                    ? "Log more memories to unlock pattern detection (minimum 5 needed)"
                    : "No significant patterns detected recently"}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, i) => {
                  const style = getAlertStyle(alert.type);
                  const Icon = style.icon;
                  return (
                    <div 
                      key={i}
                      className={cn(
                        "p-4 rounded-xl border",
                        style.bg,
                        style.border
                      )}
                      data-testid={`alert-${alert.type}-${i}`}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", style.iconColor)} />
                        <div className="flex-1">
                          <h4 className="font-medium text-foreground">{alert.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                          {alert.actionSuggestion && (
                            <p className="text-sm text-primary mt-2 flex items-center gap-1">
                              <span>→</span> {alert.actionSuggestion}
                            </p>
                          )}
                        </div>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs capitalize", style.border)}
                        >
                          {alert.type}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats Footer */}
        {(briefingData || alertsData) && (
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            {briefingData && (
              <span>Briefing based on {briefingData.memoriesAnalyzed} memories</span>
            )}
            {briefingData && alertsData && <span>•</span>}
            {alertsData && (
              <span>Patterns from last {alertsData.periodDays} days</span>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
