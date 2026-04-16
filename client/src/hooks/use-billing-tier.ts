import { useQuery } from "@tanstack/react-query";

export type Tier = "free" | "pro" | "life_os";

export interface BillingStatus {
  tier: Tier;
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

const RANK: Record<Tier, number> = { free: 0, pro: 1, life_os: 2 };

export function useBillingTier() {
  const { data, isLoading } = useQuery<BillingStatus>({
    queryKey: ["/api/billing/status"],
    staleTime: 60_000,
  });

  const tier: Tier = data?.tier ?? "free";
  const enforcementActive = data?.enforcementActive ?? false;
  const isActive =
    data?.status === "active" || data?.status === "trialing" || !enforcementActive;

  const hasTier = (min: Tier): boolean => {
    if (!enforcementActive) return true;
    if (!isActive && min !== "free") return false;
    return RANK[tier] >= RANK[min];
  };

  return {
    tier,
    enforcementActive,
    isActive,
    hasTier,
    isLoading,
    billing: data,
  };
}
