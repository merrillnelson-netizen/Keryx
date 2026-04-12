import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
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
  Wallet,
  Crown,
  X,
  ArrowRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PendingActions from "@/components/pending-actions";
import ContextualDiscoveries from "@/components/contextual-discoveries";
import { ErrorBoundary } from "@/components/error-boundary";

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

function BillingLiveBanner({ tier }: { tier: string }) {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('keryx-billing-live-dismissed') === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('keryx-billing-live-dismissed', 'true');
    setDismissed(true);
  };

  const isFree = tier === 'free';
  const tierLabel = tier === 'life_os' ? 'Life OS' : tier === 'core' ? 'Core' : 'Free';

  return (
    <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-blue-950/60 p-4">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-indigo-500/5 pointer-events-none" />
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-blue-400/60 hover:text-blue-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex flex-col gap-2.5 pr-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Wallet className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-300">
              Keryx is now a paid service
            </p>
            <p className="text-xs text-blue-400/80 mt-0.5 leading-relaxed">
              {isFree
                ? <>You're on the <strong className="text-blue-300">Free plan</strong> — limited to 100 memories. Upgrade to unlock unlimited memories and all features.</>
                : <>Your <strong className="text-blue-300">{tierLabel}</strong> plan is active and being billed. Thank you for supporting Keryx!</>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-12">
          <Button
            size="sm"
            onClick={() => navigate("/billing")}
            className="bg-blue-500 hover:bg-blue-400 text-white font-semibold text-xs h-8 px-3 gap-1"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            {isFree ? "Upgrade plan" : "Review your plan"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FoundingMemberBanner() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('keryx-founding-dismissed') === 'true'
  );
  const [joinedList, setJoinedList] = useState(false);
  const [joiningList, setJoiningList] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const { data: billing, refetch: refetchBilling } = useQuery<{
    enforcementActive: boolean;
    tier: string;
    earlyAdopterAt: string | null;
    stripeConfigured: boolean;
    spotsRemaining: number;
  }>({
    queryKey: ["/api/billing/status"],
    staleTime: 60_000,
  });

  if (dismissed && !billing?.enforcementActive) return null;

  if (billing?.enforcementActive) {
    return <BillingLiveBanner tier={billing.tier} />;
  }

  if (dismissed) return null;

  const alreadyOnList = !!billing?.earlyAdopterAt || joinedList;
  const spotsRemaining = billing?.spotsRemaining ?? 50;

  const handleDismiss = () => {
    localStorage.setItem('keryx-founding-dismissed', 'true');
    setDismissed(true);
  };

  const handleJoinList = async () => {
    setJoiningList(true);
    try {
      const res = await fetch('/api/billing/early-adopter', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setJoinedList(true);
        refetchBilling();
      }
    } catch {}
    setJoiningList(false);
  };

  const handleLockIn = async () => {
    if (!billing?.stripeConfigured) { navigate("/billing"); return; }
    setCheckingOut(true);
    try {
      const appBase = window.location.origin;
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'life_os',
          successUrl: `${appBase}/billing?success=true`,
          cancelUrl: `${appBase}/billing?canceled=true`,
        }),
      });
      if (res.ok) {
        const { url } = await res.json();
        if (url) window.location.href = url;
      } else {
        navigate("/billing");
      }
    } catch { navigate("/billing"); }
    setCheckingOut(false);
  };

  return (
    <div className="relative rounded-2xl overflow-hidden border border-yellow-500/30 bg-gradient-to-r from-yellow-950/60 via-amber-950/40 to-yellow-950/60 p-4">
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-amber-500/5 pointer-events-none" />
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-yellow-400/60 hover:text-yellow-300 transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex flex-col gap-2.5 pr-6">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-yellow-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Crown className="w-5 h-5 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-300">
              Founding Member offer — lock in $8/month before we launch
            </p>
            <p className="text-xs text-yellow-400/80 mt-0.5 leading-relaxed">
              Keryx is transitioning to a paid service soon. Early users can lock in
              <strong className="text-yellow-300"> Life OS for $8/mo forever</strong> — that's 33% off — using
              code <span className="font-mono bg-yellow-500/20 px-1.5 py-0.5 rounded text-yellow-200">FOUNDING8</span> at checkout.
            </p>
            <p className="text-xs font-semibold text-amber-400 mt-1">
              {spotsRemaining} of 50 founding spots left
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-12">
          {spotsRemaining === 0 ? (
            <p className="text-xs font-semibold text-yellow-400/80">Founding spots filled — thank you!</p>
          ) : (
            <Button
              size="sm"
              onClick={handleLockIn}
              disabled={checkingOut}
              className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-semibold text-xs h-8 px-3 gap-1"
            >
              {checkingOut ? <Loader2 className="w-3 h-3 animate-spin" /> : <Crown className="w-3.5 h-3.5" />}
              Lock in $8/mo now
            </Button>
          )}
          {alreadyOnList ? (
            <div className="flex items-center gap-1 text-xs text-yellow-400/80">
              <CheckCircle className="w-3.5 h-3.5 text-green-400" />
              You're on the list — {spotsRemaining} spots still available
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleJoinList}
              disabled={joiningList}
              variant="ghost"
              className="border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 text-xs h-8 px-3 gap-1"
            >
              {joiningList ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Join the interest list
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  // Custom queryFn to preserve full response with metadata
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  const { data: briefingData, isLoading: briefingLoading, isFetching: briefingFetching, refetch: refetchBriefing } = useQuery<BriefingResponse>({
    queryKey: ["/api/briefing", userTimezone],
    queryFn: async () => {
      const localHour = new Date().getHours();
      const response = await fetch(`/api/briefing?localHour=${localHour}&timezone=${encodeURIComponent(userTimezone)}`, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const { data: alertsData, isLoading: alertsLoading, isFetching: alertsFetching, refetch: refetchAlerts } = useQuery<AlertsResponse>({
    queryKey: ["/api/alerts", userTimezone],
    queryFn: async () => {
      const response = await fetch(`/api/alerts?timezone=${encodeURIComponent(userTimezone)}`, { credentials: "include" });
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
        {/* Founding Member Banner */}
        <FoundingMemberBanner />

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
        <ErrorBoundary fallback={null}>
          <ContextualDiscoveries />
        </ErrorBoundary>

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

        {/* Ecosystem View Entry Card */}
        <Card
          className="glass-card border-white/20 cursor-pointer hover:border-indigo-500/40 transition-colors group"
          onClick={() => navigate("/ecosystem")}
        >
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Ecosystem View</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Life at a glance — memory pulse, mood, topics, people, goals &amp; finance
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-indigo-400 transition-colors flex-shrink-0" />
            </div>
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
