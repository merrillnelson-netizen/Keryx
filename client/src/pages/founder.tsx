import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Crown, Users, Star, Zap, ArrowLeft, Loader2,
  CheckCircle, Clock, RefreshCw,
} from "lucide-react";

interface FounderStats {
  status: string;
  totals: {
    total: number;
    freeCount: number;
    proCount: number;
    lifeOsCount: number;
    paidFounders: number;
    waitlistCount: number;
    testAccounts: number;
  };
  spotsRemaining: number;
  foundingSpots: number;
  recentUsers: {
    username: string;
    subscriptionTier: string;
    subscriptionStatus: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    earlyAdopterAt: string | null;
    currentPeriodEnd: string | null;
  }[];
}

function StatCard({ label, value, sub, color = "text-foreground" }: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="glass-card border-white/20">
      <CardContent className="pt-5 pb-4">
        <div className={`text-3xl font-bold tabular-nums ${color}`}>{value}</div>
        <div className="text-sm font-medium mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function tierBadge(tier: string, hasSub: boolean) {
  if (tier === "life_os" && hasSub) return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 border text-xs">Life OS (paid)</Badge>;
  if (tier === "life_os") return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/40 border text-xs">Life OS (free)</Badge>;
  if (tier === "pro") return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40 border text-xs">Pro</Badge>;
  return <Badge className="bg-white/10 text-muted-foreground border-white/20 border text-xs">Free</Badge>;
}

export default function FounderDashboard() {
  const [, navigate] = useLocation();

  const { data, isLoading, error, refetch, isFetching } = useQuery<FounderStats>({
    queryKey: ["/api/admin/founder-stats"],
    staleTime: 30_000,
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

  if (error || (data as any)?.error) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center space-y-4">
          <Crown className="w-12 h-12 text-yellow-400 mx-auto" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">This page is for the Keryx founder only.</p>
          <Button variant="outline" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </AppLayout>
    );
  }

  const t = data!.totals;
  const spotsUsed = data!.foundingSpots - data!.spotsRemaining;
  const spotsPercent = Math.round((spotsUsed / data!.foundingSpots) * 100);
  const realUsers = t.total - t.testAccounts;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Crown className="w-6 h-6 text-yellow-400" />
              <h1 className="text-2xl font-bold">Founder Dashboard</h1>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">Live stats for Keryx launch</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Users" value={t.total} sub={`${realUsers} real`} />
          <StatCard label="Paid Founders" value={t.paidFounders} color="text-yellow-400" sub="locked in $8/mo" />
          <StatCard label="Interest List" value={t.waitlistCount} color="text-blue-400" sub="joined waitlist" />
          <StatCard label="Spots Left" value={data!.spotsRemaining} color={data!.spotsRemaining <= 10 ? "text-red-400" : "text-emerald-400"} sub={`of ${data!.foundingSpots} total`} />
        </div>

        <Card className="border border-yellow-500/30 bg-yellow-950/20">
          <CardContent className="pt-5 pb-5 space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-yellow-300">Founding spots filled</span>
              <span className="text-yellow-400 tabular-nums">{spotsUsed} / {data!.foundingSpots}</span>
            </div>
            <div className="w-full bg-yellow-950/60 rounded-full h-2.5">
              <div
                className="bg-yellow-500 h-2.5 rounded-full transition-all"
                style={{ width: `${spotsPercent}%` }}
              />
            </div>
            <div className="text-xs text-yellow-500/70">{spotsPercent}% claimed — {data!.spotsRemaining} remaining</div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Free tier" value={t.freeCount} />
          <StatCard label="Pro tier" value={t.proCount} color="text-blue-400" />
          <StatCard label="Life OS tier" value={t.lifeOsCount} color="text-yellow-400" />
          <StatCard label="Test accounts" value={t.testAccounts} color="text-muted-foreground" />
        </div>

        <Card className="glass-card border-white/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              Recent Users (last 50)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-white/10">
                    <th className="pb-2 pr-4 font-medium">Username</th>
                    <th className="pb-2 pr-4 font-medium">Tier</th>
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Waitlist</th>
                    <th className="pb-2 font-medium">Stripe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data!.recentUsers.map((u) => (
                    <tr key={u.username} className="hover:bg-white/5 transition-colors">
                      <td className="py-2 pr-4 font-mono text-xs max-w-[200px] truncate" title={u.username}>
                        {u.username}
                      </td>
                      <td className="py-2 pr-4">
                        {tierBadge(u.subscriptionTier, !!u.stripeSubscriptionId)}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`text-xs ${u.subscriptionStatus === "active" ? "text-emerald-400" : "text-muted-foreground"}`}>
                          {u.subscriptionStatus}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        {u.earlyAdopterAt ? (
                          <div className="flex items-center gap-1 text-xs text-blue-400">
                            <CheckCircle className="w-3 h-3" />
                            {new Date(u.earlyAdopterAt).toLocaleDateString()}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-2">
                        {u.stripeSubscriptionId ? (
                          <div className="flex items-center gap-1 text-xs text-yellow-400">
                            <Crown className="w-3 h-3" />
                            Paid
                          </div>
                        ) : u.stripeCustomerId ? (
                          <span className="text-xs text-muted-foreground">Customer</span>
                        ) : (
                          <span className="text-xs text-muted-foreground/40">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
