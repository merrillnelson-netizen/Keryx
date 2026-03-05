import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Zap, Crown, Lock } from "lucide-react";

interface UpgradePromptProps {
  requiredTier: "pro" | "life_os";
  feature: string;
  compact?: boolean;
}

interface BillingStatus {
  tier: string;
  enforcementActive: boolean;
}

export function UpgradePrompt({ requiredTier, feature, compact }: UpgradePromptProps) {
  const [, navigate] = useLocation();

  const { data: billing } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 60_000,
  });

  if (!billing?.enforcementActive) return null;

  const tierLabel = requiredTier === "life_os" ? "Life OS" : "Pro";
  const icon = requiredTier === "life_os"
    ? <Crown className="w-5 h-5 text-yellow-400" />
    : <Zap className="w-5 h-5 text-blue-400" />;

  if (compact) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>{feature} requires {tierLabel}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-xs"
          onClick={() => navigate("/billing")}
        >
          Upgrade
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-base">{feature}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This feature requires the <strong>{tierLabel}</strong> plan.
        </p>
      </div>
      <Button
        onClick={() => navigate("/billing")}
        className={requiredTier === "life_os"
          ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-semibold"
          : "bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold"}
      >
        See Plans
      </Button>
    </div>
  );
}
