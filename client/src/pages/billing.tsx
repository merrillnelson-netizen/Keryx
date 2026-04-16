import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import AppLayout from "@/components/app-layout";
import { useState } from "react";
import {
  Zap, Crown, Star, Check, Lock, ExternalLink, Loader2,
  CreditCard, Info, Gift, CheckCircle,
} from "lucide-react";

interface BillingStatus {
  tier: "free" | "pro" | "life_os";
  status: string;
  memoriesThisMonth: number;
  memoriesLimit: number | null;
  currentPeriodEnd: string | null;
  isFoundingMember: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeConfigured: boolean;
  enforcementActive: boolean;
  earlyAdopterAt: string | null;
  spotsRemaining: number;
}

const TIER_FEATURES = {
  free: [
    { label: "100 memories/month", included: true },
    { label: "Basic keyword & filter search", included: true },
    { label: "History view", included: true },
    { label: "People directory (basic CRUD)", included: true },
    { label: "Categories management", included: true },
    { label: "Mood tracking on memories", included: true },
    { label: "Voice & text capture", included: true },
    { label: "Settings & profile", included: true },
    { label: "PWA install + push notifications", included: true },
    { label: "Billing & founder banner access", included: true },
    { label: "Sass-o-Meter up to 25 (mild persona)", included: true },
  ],
  pro: [
    { label: "Unlimited memories", included: true },
    { label: "AI tagging on save (mood, people, topics)", included: true },
    { label: "Semantic AI search", included: true },
    { label: "Ecosystem stats (everything except Plaid)", included: true },
    { label: "Sass-o-Meter up to 75 (sharper persona)", included: true },
    { label: "Keryx Chat (multi-session)", included: true },
    { label: "AI Profile + observations", included: true },
    { label: "Morning briefings & news feed", included: true },
    { label: "Personal insights & pattern alerts", included: true },
    { label: "Goals, reminders & ideas workspace", included: true },
    { label: "Calendar & email (Google + Outlook)", included: true },
    { label: "People AI search & duplicate detection", included: true },
    { label: "Automation rules engine", included: true },
  ],
  life_os: [
    { label: "Everything in Pro", included: true },
    { label: "AI Agent (autonomous actions)", included: true },
    { label: "Messages sync (SMS/MMS/RCS)", included: true },
    { label: "Location intelligence + import", included: true },
    { label: "Universal Relay (any source → Keryx)", included: true },
    { label: "Android Bridge (Google Messages capture)", included: true },
    { label: "Meta Glasses companion", included: true },
    { label: "Financial insights (Plaid)", included: true },
    { label: "Contextual Discoveries (Tavily)", included: true },
    { label: "Sass-o-Meter up to 100 (full persona)", included: true },
  ],
};

function tierIcon(tier: string) {
  if (tier === "life_os") return <Crown className="w-4 h-4 text-yellow-400" />;
  if (tier === "pro") return <Zap className="w-4 h-4 text-blue-400" />;
  return <Star className="w-4 h-4 text-muted-foreground" />;
}

function tierLabel(tier: string) {
  if (tier === "life_os") return "Life OS";
  if (tier === "pro") return "Pro";
  return "Free";
}

function tierBadgeClass(tier: string) {
  if (tier === "life_os") return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  if (tier === "pro") return "bg-blue-500/20 text-blue-300 border-blue-500/40";
  return "bg-white/10 text-muted-foreground border-white/20";
}

export default function Billing() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [joinedList, setJoinedList] = useState(false);
  const [joiningList, setJoiningList] = useState(false);

  const { data: billing, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 60_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: async (tier: "pro" | "life_os") => {
      const res = await apiRequest("POST", "/api/billing/checkout", { tier });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.billingNotReady) {
        toast({
          title: "Billing setup in progress",
          description: "Check back soon — payment processing is being configured.",
        });
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Something went wrong",
        description: "Could not start checkout. Please try again.",
        variant: "destructive",
      });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal", {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.billingNotReady) {
        toast({ title: "Billing setup in progress", description: "Check back soon." });
        return;
      }
      if (data.url) window.location.href = data.url;
    },
    onError: () => {
      toast({ title: "Error", description: "Could not open billing portal.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const tier = billing?.tier ?? "free";
  const isFoundingMember = billing?.isFoundingMember ?? false;
  const enforcementActive = billing?.enforcementActive ?? false;
  const memoriesUsed = billing?.memoriesThisMonth ?? 0;
  const memoriesLimit = billing?.memoriesLimit;
  const alreadyOnList = !!billing?.earlyAdopterAt || joinedList;
  const hasPaidSubscription = !!billing?.stripeSubscriptionId;
  const spotsRemaining = billing?.spotsRemaining ?? 50;

  const handleJoinList = async () => {
    setJoiningList(true);
    try {
      const res = await fetch('/api/billing/early-adopter', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        setJoinedList(true);
        queryClient.invalidateQueries({ queryKey: ['/api/billing/status'] });
        toast({ title: "You're on the list!", description: "We'll keep you posted on launch." });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    }
    setJoiningList(false);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Subscription & Plan</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your Keryx subscription</p>
        </div>

        {!enforcementActive && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>All features are currently available to everyone during our early access period.</span>
          </div>
        )}

        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-5 h-5 text-primary" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                {tierIcon(tier)}
                <span className="font-semibold text-lg">{tierLabel(tier)}</span>
                <Badge className={`text-xs border ${tierBadgeClass(tier)}`}>
                  {tierLabel(tier)}
                </Badge>
              </div>
              {isFoundingMember && (
                <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 border flex items-center gap-1">
                  <Gift className="w-3 h-3" />
                  Founding Member — Life OS Forever
                </Badge>
              )}
              {!isFoundingMember && billing?.currentPeriodEnd && (
                <span className="text-xs text-muted-foreground">
                  Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </span>
              )}
            </div>

            {tier === "free" && enforcementActive && memoriesLimit && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Monthly memories</span>
                  <span>{memoriesUsed} / {memoriesLimit}</span>
                </div>
                <Progress value={(memoriesUsed / memoriesLimit) * 100} className="h-1.5" />
              </div>
            )}

            {tier !== "free" && billing?.stripeCustomerId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => portalMutation.mutate()}
                disabled={portalMutation.isPending}
                className="w-full sm:w-auto"
              >
                {portalMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ExternalLink className="w-4 h-4 mr-2" />
                )}
                Manage Subscription
              </Button>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PricingCard
            name="Free"
            price="$0"
            description="Get started with the basics"
            features={TIER_FEATURES.free}
            tier="free"
            currentTier={tier}
            icon={<Star className="w-5 h-5 text-muted-foreground" />}
            onUpgrade={() => {}}
            isPending={false}
          />
          <PricingCard
            name="Pro"
            price="$12"
            description="Full AI life operating system"
            features={TIER_FEATURES.pro}
            tier="pro"
            currentTier={tier}
            icon={<Zap className="w-5 h-5 text-blue-400" />}
            highlight
            onUpgrade={() => checkoutMutation.mutate("pro")}
            isPending={checkoutMutation.isPending}
          />
          <PricingCard
            name="Life OS"
            price="$24"
            description="Everything, including financial & glasses"
            features={TIER_FEATURES.life_os}
            tier="life_os"
            currentTier={tier}
            icon={<Crown className="w-5 h-5 text-yellow-400" />}
            gold
            onUpgrade={() => checkoutMutation.mutate("life_os")}
            isPending={checkoutMutation.isPending}
          />
        </div>

        {!enforcementActive && !hasPaidSubscription && (
          <Card className="border border-yellow-500/30 bg-gradient-to-r from-yellow-950/60 via-amber-950/40 to-yellow-950/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-yellow-300">
                <Crown className="w-5 h-5 text-yellow-400" />
                Last Call — 48 hours left for $8/mo Life OS forever
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-yellow-400/80 leading-relaxed">
                Final stretch. After Monday the founding rate is gone for good. Lock in{" "}
                <strong className="text-yellow-300">Life OS for $8/month forever</strong> —
                that's 33% off the regular price. Use code{" "}
                <span className="font-mono bg-yellow-500/20 px-1.5 py-0.5 rounded text-yellow-200">FOUNDING8</span> at checkout.
              </p>
              <p className="text-sm font-semibold text-amber-400">
                Deal ends Monday • {spotsRemaining} of 50 spots still open
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {spotsRemaining === 0 ? (
                  <p className="text-sm font-semibold text-yellow-400/80">Founding spots filled — thank you!</p>
                ) : (
                  <Button
                    onClick={() => checkoutMutation.mutate("life_os")}
                    disabled={checkoutMutation.isPending}
                    className="bg-yellow-500 hover:bg-yellow-400 text-yellow-950 font-semibold gap-1"
                  >
                    {checkoutMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Crown className="w-4 h-4" />
                    )}
                    Lock in $8/mo now
                  </Button>
                )}
                {alreadyOnList ? (
                  <div className="flex items-center gap-1.5 text-sm text-yellow-400/80">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    You're on the interest list — {spotsRemaining} spots still available
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={handleJoinList}
                    disabled={joiningList}
                    className="border border-yellow-500/40 text-yellow-300 hover:bg-yellow-500/10 gap-1"
                  >
                    {joiningList ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Join the interest list
                  </Button>
                )}
              </div>
              {!alreadyOnList && (
                <p className="text-xs text-yellow-500/60">
                  Not ready to pay yet? Join the interest list and we'll keep you posted after the founding deal ends.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

interface PricingCardProps {
  name: string;
  price: string;
  description: string;
  features: { label: string; included: boolean }[];
  tier: string;
  currentTier: string;
  icon: React.ReactNode;
  highlight?: boolean;
  gold?: boolean;
  onUpgrade: () => void;
  isPending: boolean;
}

function PricingCard({
  name, price, description, features, tier, currentTier,
  icon, highlight, gold, onUpgrade, isPending,
}: PricingCardProps) {
  const isCurrent = tier === currentTier;

  let cardClass = "glass-card border-white/20 flex flex-col";
  if (gold) cardClass = "glass-card border-yellow-500/40 flex flex-col bg-yellow-500/5";
  else if (highlight) cardClass = "glass-card border-blue-500/40 flex flex-col bg-blue-500/5";

  return (
    <Card className={cardClass}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <CardTitle className="text-base">{name}</CardTitle>
          {isCurrent && (
            <Badge className="ml-auto text-xs bg-primary/20 text-primary border-primary/30 border">
              Current
            </Badge>
          )}
        </div>
        <div className="text-2xl font-bold">
          {price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-4">
        <ul className="space-y-1.5 flex-1">
          {features.map((f) => (
            <li key={f.label} className={`flex items-center gap-2 text-xs ${f.included ? "" : "text-muted-foreground/60"}`}>
              {f.included ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Lock className="w-3.5 h-3.5 shrink-0 text-muted-foreground/40" />
              )}
              {f.label}
            </li>
          ))}
        </ul>
        {!isCurrent && tier !== "free" && (
          <Button
            onClick={onUpgrade}
            disabled={isPending}
            className={gold
              ? "w-full bg-gradient-to-r from-yellow-500 to-amber-600 hover:opacity-90 text-black font-semibold"
              : "w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:opacity-90 text-white font-semibold"}
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Upgrade to {name}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
