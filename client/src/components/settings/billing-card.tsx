import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Crown, ExternalLink } from "lucide-react";

interface BillingCardProps {
  isFounder?: boolean;
}

export function BillingCard({ isFounder }: BillingCardProps) {
  const [, navigate] = useLocation();
  const { data: billing } = useQuery<{
    tier: string;
    isFoundingMember: boolean;
    currentPeriodEnd: string | null;
  }>({
    queryKey: ["/api/billing/status"],
    staleTime: 60_000,
  });

  const tier = billing?.tier ?? "free";
  const tierLabel = tier === "life_os" ? "Life OS" : tier === "pro" ? "Pro" : "Free";

  return (
    <Card className="glass-card border-white/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Subscription & Plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Current plan: <span className="text-primary">{tierLabel}</span></p>
            {billing?.isFoundingMember && !isFounder && (
              <p className="text-xs text-yellow-400">Founding Member — Life OS Forever</p>
            )}
            {isFounder && (
              <button
                onClick={() => navigate("/founder")}
                className="flex items-center gap-1.5 group"
                aria-label="Founder dashboard"
              >
                <Crown className="w-3.5 h-3.5 text-yellow-400 opacity-60 group-active:opacity-100 group-hover:opacity-100 transition-opacity" />
                <p className="text-xs text-yellow-400">Founding Member — Life OS Forever</p>
              </button>
            )}
            {!billing?.isFoundingMember && !isFounder && billing?.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                Renews {new Date(billing.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/billing")}>
            <ExternalLink className="w-4 h-4 mr-2" />
            Manage Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
