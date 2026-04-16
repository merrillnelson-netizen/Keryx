import { Link } from "wouter";
import { Lock, Crown, Zap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useBillingTier, type Tier } from "@/hooks/use-billing-tier";

interface TierGateProps {
  required: "pro" | "life_os";
  feature: string;
  description?: string;
  children: React.ReactNode;
  /** When true, render a small inline lock card instead of a full-page block */
  inline?: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  pro: "Pro",
  life_os: "Life OS",
};

export function TierGate({
  required,
  feature,
  description,
  children,
  inline = false,
}: TierGateProps) {
  const { hasTier, tier, isLoading } = useBillingTier();

  if (isLoading) {
    if (inline) {
      return (
        <Card data-testid="tier-gate-loading-inline">
          <CardContent className="p-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Checking access…</span>
          </CardContent>
        </Card>
      );
    }
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[40vh] p-6"
        data-testid="tier-gate-loading"
      >
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (hasTier(required)) return <>{children}</>;

  const Icon = required === "life_os" ? Crown : Zap;
  const requiredLabel = TIER_LABEL[required];
  const accent =
    required === "life_os"
      ? "from-yellow-500/20 to-orange-500/10 border-yellow-500/30"
      : "from-blue-500/20 to-purple-500/10 border-blue-500/30";

  if (inline) {
    return (
      <Card className={`bg-gradient-to-br ${accent}`} data-testid="tier-gate-inline">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-background/50 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {feature} — {requiredLabel} feature
            </div>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/billing">Upgrade</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] p-6"
      data-testid="tier-gate-page"
    >
      <Card className={`max-w-md w-full bg-gradient-to-br ${accent} border-2`}>
        <CardContent className="p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-background/50 flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              {requiredLabel} feature
            </div>
            <h2 className="text-2xl font-bold flex items-center justify-center gap-2">
              <Icon className="w-5 h-5" />
              {feature}
            </h2>
          </div>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
          <p className="text-xs text-muted-foreground">
            You're on the <span className="font-medium">{TIER_LABEL[tier]}</span> plan.
            Upgrade to unlock this feature.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button asChild size="lg" className="w-full">
              <Link href="/billing">
                <Crown className="w-4 h-4 mr-2" />
                See plans
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Back to dashboard</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
