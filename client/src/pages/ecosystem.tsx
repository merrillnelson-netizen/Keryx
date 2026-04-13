import { useState, useMemo } from "react";
import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Loader2,
  ArrowLeft,
  Activity,
  Heart,
  Tag,
  Users,
  Target,
  Wallet,
  Zap,
  Bell,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from "recharts";

interface SpendingCategory {
  category: string;
  amount: number;
}

interface SpendingSummary {
  totalSpending: number;
  transactionCount: number;
  categoryBreakdown: SpendingCategory[];
  topMerchants: Array<{ merchant: string; amount: number }>;
}

interface FinancialAccount {
  id: string;
  accountId: string;
  name: string;
  mask: string | null;
  type: string;
  isHidden: boolean;
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  date: string;
  name: string;
  merchantName: string | null;
  primaryCategory: string | null;
  pending: boolean | null;
  paymentChannel: string | null;
}

interface EcosystemCaptions {
  memoryPulse: string;
  moodTrend: string;
  topicDistribution: string;
  relationshipHealth: string;
  goalProgress: string;
  financial: string;
}

interface GoalMilestone {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string;
  order: number;
}

interface EcosystemStats {
  period: { days: number; timezone: string };
  systemHealth: {
    totalMemories: number;
    activeReminders: number;
    pendingActions: number;
    patternAlerts: { positive: number; negative: number; insight: number; neutral: number };
  };
  memoryPulse: {
    perDay: { date: string; count: number }[];
    total7Days: number;
    velocityDeltaPct: number | null;
  };
  moodTrend: {
    trend: { date: string; avgScore: number; count: number }[];
    recentAvg: number | null;
    trendDir: "up" | "down" | "flat";
  };
  topicDistribution: { topic: string; count: number }[];
  relationshipHealth: { name: string; mentionCount: number; velocityTier: string; relationship: string }[];
  goalProgress: {
    id: string;
    title: string;
    status: string;
    progress: number;
    milestones: GoalMilestone[];
    aiSummary: string | null;
  }[];
  financial: {
    connected: boolean;
    totalSpending?: number;
    totalIncome?: number;
    transactionCount?: number;
    categoryBreakdown?: { category: string; amount: number }[];
  };
  captions: EcosystemCaptions;
  generatedAt: string;
  cached: boolean;
}

const TOPIC_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6",
  "#ec4899", "#8b5cf6", "#f97316", "#14b8a6",
];

const SPENDING_COLORS = [
  "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6",
  "#ec4899", "#f97316", "#eab308", "#84cc16",
];

const TX_DAYS_OPTIONS = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

// Colors keyed by relationship type (what this person is to you)
const RELATIONSHIP_COLORS: Record<string, string> = {
  partner:      "#6366f1",
  family:       "#8b5cf6",
  close_friend: "#3b82f6",
  friend:       "#10b981",
  colleague:    "#f59e0b",
  client:       "#f97316",
  mentor:       "#06b6d4",
  other:        "#6b7280",
  unset:        "#6b7280",
  acquaintance: "#6b7280",
};

// Velocity tier fallback colors (used when relationship is unset/unknown)
const VELOCITY_TIER_COLORS: Record<string, string> = {
  high:         "#10b981",
  medium:       "#f59e0b",
  acquaintance: "#6b7280",
};

const VELOCITY_COLORS = RELATIONSHIP_COLORS; // alias for legend rendering

function relationshipColor(relationship: string, velocityTier: string): string {
  // Prefer relationship type color; fall back to velocity tier
  if (relationship && relationship !== 'unset' && relationship !== 'acquaintance') {
    return RELATIONSHIP_COLORS[relationship] ?? "#6b7280";
  }
  return VELOCITY_TIER_COLORS[velocityTier] ?? "#6b7280";
}

function velocityLabel(tier: string): string {
  return tier.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function moodColor(score: number): string {
  if (score >= 30) return "#10b981";
  if (score <= -30) return "#ef4444";
  return "#f59e0b";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function KpiBadge({
  value,
  label,
  icon: Icon,
  color = "text-primary",
}: {
  value: string | number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="glass-card p-4 rounded-xl flex flex-col gap-1 items-center text-center">
      <Icon className={cn("w-5 h-5 mb-1", color)} />
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function SectionCaption({ text }: { text: string }) {
  return (
    <p className="text-xs text-muted-foreground italic mb-3 border-l-2 border-primary/30 pl-2">
      {text}
    </p>
  );
}

function VelocityBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta > 0)
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1 text-xs">
        <TrendingUp className="w-3 h-3" />+{delta}%
      </Badge>
    );
  if (delta < 0)
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 text-xs">
        <TrendingDown className="w-3 h-3" />{delta}%
      </Badge>
    );
  return (
    <Badge className="bg-muted/40 text-muted-foreground border-muted/30 gap-1 text-xs">
      <Minus className="w-3 h-3" />flat
    </Badge>
  );
}

function MoodTrendDirBadge({ dir, avg }: { dir: "up" | "down" | "flat"; avg: number | null }) {
  const avgStr = avg !== null ? ` (avg ${avg > 0 ? "+" : ""}${avg})` : "";
  if (dir === "up")
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1 text-xs">
        <TrendingUp className="w-3 h-3" />improving{avgStr}
      </Badge>
    );
  if (dir === "down")
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 text-xs">
        <TrendingDown className="w-3 h-3" />declining{avgStr}
      </Badge>
    );
  return (
    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 gap-1 text-xs">
      <Minus className="w-3 h-3" />stable{avgStr}
    </Badge>
  );
}

const QUERY_KEY = "/api/ecosystem/stats";

export default function Ecosystem() {
  const [, navigate] = useLocation();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, isLoading, isFetching, refetch } = useQuery<EcosystemStats>({
    queryKey: [QUERY_KEY, userTimezone],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/ecosystem/stats?timezone=${encodeURIComponent(userTimezone)}&days=30`,
        { credentials: "include", signal }
      );
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = async () => {
    await fetch(
      `/api/ecosystem/stats?timezone=${encodeURIComponent(userTimezone)}&days=30&refresh=true`,
      { credentials: "include" }
    );
    queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userTimezone] });
    refetch();
  };

  const totalAlerts = data
    ? data.systemHealth.patternAlerts.positive +
      data.systemHealth.patternAlerts.negative +
      data.systemHealth.patternAlerts.insight +
      data.systemHealth.patternAlerts.neutral
    : 0;

  // ── Financial detail state ──
  const [txDays, setTxDays] = useState("30");
  const [selectedAccount, setSelectedAccount] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [privacyMode, setPrivacyMode] = useState(false);

  const fmt = (amount: number) =>
    privacyMode ? "••••••" : `$${amount.toFixed(2)}`;

  const isFinancialConnected = !!data?.financial.connected;

  const { data: spendingSummary, isLoading: spendingLoading } = useQuery<SpendingSummary>({
    queryKey: ["/api/plaid/spending-summary", txDays],
    queryFn: async () => {
      const res = await fetch(`/api/plaid/spending-summary?days=${txDays}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch spending summary");
      return res.json();
    },
    enabled: isFinancialConnected,
    staleTime: 1000 * 60 * 15,
  });

  const { data: accounts = [] } = useQuery<FinancialAccount[]>({
    queryKey: ["/api/plaid/accounts"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/accounts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json();
    },
    enabled: isFinancialConnected,
    staleTime: 1000 * 60 * 15,
  });

  const { data: categoryOptions = [] } = useQuery<string[]>({
    queryKey: ["/api/plaid/transaction-categories"],
    queryFn: async () => {
      const res = await fetch("/api/plaid/transaction-categories", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: isFinancialConnected,
    staleTime: 1000 * 60 * 30,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/plaid/transactions", txDays, selectedAccount, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams({ days: txDays, limit: "200" });
      if (selectedAccount !== "all") params.set("accountId", selectedAccount);
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      const res = await fetch(`/api/plaid/transactions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch transactions");
      return res.json();
    },
    enabled: isFinancialConnected,
    staleTime: 1000 * 60 * 10,
  });

  const accountNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of accounts) {
      map[a.id] = a.mask ? `${a.name} ····${a.mask}` : a.name;
    }
    return map;
  }, [accounts]);

  const visibleAccounts = useMemo(() => accounts.filter(a => !a.isHidden), [accounts]);

  const txTotal = useMemo(
    () => transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const spendingChartData = useMemo(() => {
    if (!spendingSummary?.categoryBreakdown) return [];
    return spendingSummary.categoryBreakdown.slice(0, 8).map((cat, i) => ({
      name: cat.category,
      value: cat.amount,
      fill: SPENDING_COLORS[i % SPENDING_COLORS.length],
    }));
  }, [spendingSummary?.categoryBreakdown]);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="glass-card p-5 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/dashboard")}
                className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                aria-label="Back to dashboard"
              >
                <ArrowLeft className="w-4 h-4 text-foreground" />
              </button>
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Ecosystem View</h2>
                <p className="text-xs text-muted-foreground">
                  {data
                    ? `Last 30 days · Updated ${new Date(data.generatedAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}${data.cached ? " (cached)" : ""}`
                    : "Life at a glance"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="border-white/20 hover:bg-white/10"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading && (
          <Card className="glass-card border-white/20">
            <CardContent className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Aggregating your ecosystem data…</p>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* ── System Health ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  System Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiBadge
                    value={data.systemHealth.totalMemories.toLocaleString()}
                    label="Memories"
                    icon={Activity}
                    color="text-indigo-400"
                  />
                  <KpiBadge
                    value={data.systemHealth.activeReminders}
                    label="Reminders"
                    icon={Bell}
                    color="text-amber-400"
                  />
                  <KpiBadge
                    value={data.systemHealth.pendingActions}
                    label="Pending Actions"
                    icon={CheckCircle2}
                    color="text-emerald-400"
                  />
                  <KpiBadge
                    value={totalAlerts}
                    label="Pattern Alerts"
                    icon={Zap}
                    color="text-purple-400"
                  />
                </div>
                {totalAlerts > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {data.systemHealth.patternAlerts.positive > 0 && (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                        {data.systemHealth.patternAlerts.positive} positive
                      </Badge>
                    )}
                    {data.systemHealth.patternAlerts.negative > 0 && (
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                        {data.systemHealth.patternAlerts.negative} negative
                      </Badge>
                    )}
                    {data.systemHealth.patternAlerts.insight > 0 && (
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">
                        {data.systemHealth.patternAlerts.insight} insight
                      </Badge>
                    )}
                    {data.systemHealth.patternAlerts.neutral > 0 && (
                      <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">
                        {data.systemHealth.patternAlerts.neutral} neutral
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Memory Pulse ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    Memory Pulse
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                      {data.memoryPulse.total7Days} last 7d
                    </Badge>
                    <VelocityBadge delta={data.memoryPulse.velocityDeltaPct} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.memoryPulse} />
                {data.memoryPulse.perDay.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No memory data in the last 30 days.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart
                      data={data.memoryPulse.perDay}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.5} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                        interval={Math.max(0, Math.floor(data.memoryPulse.perDay.length / 5) - 1)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,15,25,0.9)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                        }}
                        labelFormatter={formatDate}
                        formatter={(val: number) => [val, "Memories"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="#6366f1"
                        fill="url(#memGrad)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Mood Trend ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Heart className="w-4 h-4 text-pink-400" />
                    Mood Trend
                  </CardTitle>
                  <MoodTrendDirBadge
                    dir={data.moodTrend.trendDir}
                    avg={data.moodTrend.recentAvg}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.moodTrend} />
                {data.moodTrend.trend.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    No mood data yet. Add memories with emotional content.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart
                      data={data.moodTrend.trend}
                      margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                        interval={Math.max(0, Math.floor(data.moodTrend.trend.length / 5) - 1)}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                        domain={[-100, 100]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,15,25,0.9)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                        }}
                        labelFormatter={formatDate}
                        formatter={(val: number) => [val, "Mood Score"]}
                      />
                      {/* Positive band: ≥30 */}
                      <ReferenceArea
                        y1={30}
                        y2={100}
                        fill="#10b981"
                        fillOpacity={0.07}
                        strokeOpacity={0}
                        label={undefined}
                      />
                      {/* Negative band: ≤-30 */}
                      <ReferenceArea
                        y1={-100}
                        y2={-30}
                        fill="#ef4444"
                        fillOpacity={0.07}
                        strokeOpacity={0}
                        label={undefined}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgScore"
                        stroke="#ec4899"
                        strokeWidth={2}
                        dot={(dotProps: {
                          cx: number;
                          cy: number;
                          payload: { date: string; avgScore: number };
                        }) => {
                          const { cx, cy, payload } = dotProps;
                          return (
                            <circle
                              key={payload.date}
                              cx={cx}
                              cy={cy}
                              r={3}
                              fill={moodColor(payload.avgScore)}
                              stroke="transparent"
                            />
                          );
                        }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Topic Distribution ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Tag className="w-4 h-4 text-amber-400" />
                  Topic Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.topicDistribution} />
                {data.topicDistribution.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No topic data yet.</p>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <ResponsiveContainer width={180} height={180}>
                      <PieChart>
                        <Pie
                          data={data.topicDistribution}
                          dataKey="count"
                          nameKey="topic"
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {data.topicDistribution.map((entry, i) => (
                            <Cell
                              key={entry.topic}
                              fill={TOPIC_COLORS[i % TOPIC_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "rgba(15,15,25,0.9)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                          }}
                          formatter={(val: number, name: string) => [val, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {(() => {
                        const total = data.topicDistribution.reduce((s, t) => s + t.count, 0);
                        return data.topicDistribution.map((t, i) => (
                          <div key={t.topic} className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] }}
                            />
                            <span className="text-xs text-foreground truncate flex-1">
                              {t.topic}
                            </span>
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              {total > 0 ? Math.round((t.count / total) * 100) : 0}%
                            </span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Relationship Health ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-blue-400" />
                  Relationship Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.relationshipHealth} />
                {data.relationshipHealth.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    No people tracked yet. Log memories that mention people.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(120, data.relationshipHealth.length * 34)}>
                    <BarChart
                      data={data.relationshipHealth}
                      layout="vertical"
                      margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.06)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={80}
                        tick={{ fontSize: 11, fill: "rgba(255,255,255,0.7)" }}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,15,25,0.9)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 8,
                        }}
                        formatter={(val: number, _name: string, item: { payload: { relationship: string; velocityTier: string } }) => [
                          `${val} mentions — ${velocityLabel(item.payload.relationship || item.payload.velocityTier)}`,
                          "Mentions",
                        ]}
                      />
                      <Bar dataKey="mentionCount" radius={[0, 4, 4, 0]}>
                        {data.relationshipHealth.map((p) => (
                          <Cell
                            key={p.name}
                            fill={relationshipColor(p.relationship, p.velocityTier)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {data.relationshipHealth.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(RELATIONSHIP_COLORS)
                      .filter(([rel]) =>
                        rel !== 'unset' &&
                        data.relationshipHealth.some((p) =>
                          (p.relationship || 'acquaintance') === rel
                        )
                      )
                      .map(([rel, color]) => (
                        <div key={rel} className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {velocityLabel(rel)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Goal Progress ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Goal Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.goalProgress} />
                {data.goalProgress.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">
                    No active goals. Head to Goals to set one.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {data.goalProgress.map((g) => {
                      const done = g.milestones.filter((m) => m.isCompleted).length;
                      const total = g.milestones.length;
                      return (
                        <div key={g.id} className="glass-card p-4 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground truncate flex-1">
                              {g.title}
                            </p>
                            <Badge
                              variant="outline"
                              className={cn("text-xs capitalize flex-shrink-0", {
                                "border-emerald-500/40 text-emerald-400": g.status === "active",
                                "border-blue-500/40 text-blue-400": g.status === "completed",
                                "border-muted/40 text-muted-foreground": g.status === "paused",
                              })}
                            >
                              {g.status}
                            </Badge>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Progress</span>
                              <span>{g.progress}%</span>
                            </div>
                            <div className="w-full bg-white/5 rounded-full h-2">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all"
                                style={{ width: `${g.progress}%` }}
                              />
                            </div>
                          </div>
                          {total > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {g.milestones.slice(0, 5).map((m, i) =>
                                m.isCompleted ? (
                                  <CheckCircle2
                                    key={i}
                                    className="w-3.5 h-3.5 text-emerald-400"
                                  />
                                ) : (
                                  <Circle
                                    key={i}
                                    className="w-3.5 h-3.5 text-muted-foreground/40"
                                  />
                                )
                              )}
                              <span className="ml-1">
                                {done}/{total} milestones
                              </span>
                            </div>
                          )}
                          {g.aiSummary && (
                            <p className="text-xs text-muted-foreground italic border-l-2 border-emerald-500/30 pl-2">
                              {g.aiSummary}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Financial Pulse ── */}
            <Card className="glass-card border-white/20 overflow-hidden">
              <CardHeader className="pb-1">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Wallet className="w-4 h-4 text-teal-400" />
                    Financial Pulse
                  </CardTitle>
                  {data.financial.connected && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPrivacyMode(p => !p)}
                        className="h-8 w-8 p-0"
                        title={privacyMode ? "Show numbers" : "Hide numbers"}
                      >
                        {privacyMode
                          ? <Eye className="w-4 h-4 text-muted-foreground" />
                          : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                      </Button>
                      <Select
                        value={txDays}
                        onValueChange={(v) => {
                          setTxDays(v);
                          setSelectedAccount("all");
                          setSelectedCategory("all");
                        }}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TX_DAYS_OPTIONS.map(o => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <SectionCaption text={data.captions.financial} />
                {!data.financial.connected ? (
                  <div className="text-center py-6 space-y-2">
                    <Wallet className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-muted-foreground text-sm">Plaid not connected.</p>
                    <p className="text-xs text-muted-foreground/60">
                      Connect your bank in Settings to see spending insights here.
                    </p>
                  </div>
                ) : spendingLoading ? (
                  <div className="h-40 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
                  </div>
                ) : !spendingSummary || spendingSummary.transactionCount === 0 ? (
                  <div className="h-40 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <DollarSign className="w-10 h-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No transaction data for this period.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Summary KPI tiles */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="glass-card p-3 rounded-xl text-center">
                        <p className="text-lg font-bold text-emerald-500">
                          {fmt(spendingSummary.totalSpending)}
                        </p>
                        <p className="text-xs text-muted-foreground">Total Spent</p>
                      </div>
                      <div className="glass-card p-3 rounded-xl text-center">
                        <p className="text-lg font-bold text-primary">
                          {spendingSummary.transactionCount}
                        </p>
                        <p className="text-xs text-muted-foreground">Transactions</p>
                      </div>
                      <div className="glass-card p-3 rounded-xl text-center">
                        <p className="text-lg font-bold text-cyan-500">
                          {fmt(spendingSummary.totalSpending / spendingSummary.transactionCount)}
                        </p>
                        <p className="text-xs text-muted-foreground">Avg / Txn</p>
                      </div>
                      <div className="glass-card p-3 rounded-xl text-center">
                        <p className="text-lg font-bold text-violet-500">
                          {spendingSummary.categoryBreakdown.length}
                        </p>
                        <p className="text-xs text-muted-foreground">Categories</p>
                      </div>
                    </div>

                    {/* Charts: spending pie + top merchants */}
                    <div className="grid md:grid-cols-2 gap-5">
                      {spendingChartData.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            By Category <span className="opacity-60 normal-case">(tap to filter)</span>
                          </h4>
                          <ResponsiveContainer width="100%" height={200}>
                            <PieChart>
                              <Pie
                                data={spendingChartData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={72}
                                cursor="pointer"
                                label={({ name, percent }) =>
                                  `${name} ${(percent * 100).toFixed(0)}%`
                                }
                                labelLine={{ stroke: "rgba(255,255,255,0.3)" }}
                                onClick={(entry) => {
                                  const cat = entry?.name as string;
                                  setSelectedCategory(prev => prev === cat ? "all" : cat);
                                  const txEl = document.getElementById("eco-tx-browser");
                                  if (txEl) txEl.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                {spendingChartData.map((entry, idx) => (
                                  <Cell
                                    key={`cell-${idx}`}
                                    fill={entry.fill}
                                    opacity={selectedCategory === "all" || selectedCategory === entry.name ? 1 : 0.4}
                                    stroke={selectedCategory === entry.name ? "#fff" : "transparent"}
                                    strokeWidth={2}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number) => [
                                  privacyMode ? "••••••" : `$${value.toFixed(2)}`,
                                  "Amount",
                                ]}
                                contentStyle={{
                                  backgroundColor: "rgba(0,0,0,0.8)",
                                  border: "1px solid rgba(255,255,255,0.2)",
                                  borderRadius: "8px",
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {spendingSummary.topMerchants.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            Top Merchants
                          </h4>
                          <div className="space-y-2">
                            {spendingSummary.topMerchants.slice(0, 6).map((merchant, i) => (
                              <div
                                key={i}
                                className="glass-card p-2.5 rounded-lg flex items-center justify-between gap-2"
                              >
                                <p className="text-xs text-foreground break-words flex-1">
                                  {merchant.merchant}
                                </p>
                                <span className="text-xs font-semibold text-emerald-500 shrink-0">
                                  {fmt(merchant.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Transaction Browser */}
                    <div id="eco-tx-browser" className="space-y-3 pt-2 border-t border-white/10">
                      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2 uppercase tracking-wide">
                        <CreditCard className="w-4 h-4 text-teal-400" />
                        Transactions
                      </h4>

                      {/* Filters */}
                      <div className="flex flex-wrap gap-2">
                        {visibleAccounts.length > 1 && (
                          <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                            <SelectTrigger className="h-8 text-xs flex-1 min-w-32">
                              <SelectValue placeholder="All Accounts" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Accounts</SelectItem>
                              {visibleAccounts.map(a => (
                                <SelectItem key={a.id} value={a.id}>
                                  {a.name}{a.mask ? ` ····${a.mask}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {categoryOptions.length > 0 && (
                          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                            <SelectTrigger className="h-8 text-xs flex-1 min-w-36">
                              <SelectValue placeholder="All Categories" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Categories</SelectItem>
                              {categoryOptions.map(c => (
                                <SelectItem key={c} value={c}>{c}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {(selectedAccount !== "all" || selectedCategory !== "all") && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs px-2 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setSelectedAccount("all");
                              setSelectedCategory("all");
                            }}
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>

                      {/* Count + total */}
                      {!txLoading && transactions.length > 0 && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                          <span>
                            {transactions.length} transaction{transactions.length !== 1 ? "s" : ""}
                          </span>
                          <span className="font-medium text-emerald-500">
                            {fmt(txTotal)} spent
                          </span>
                        </div>
                      )}

                      {/* List */}
                      {txLoading ? (
                        <div className="space-y-2">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="glass-card p-3 rounded-lg animate-pulse">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-muted/40" />
                                <div className="flex-1 space-y-1">
                                  <div className="h-3 bg-muted/40 rounded w-2/3" />
                                  <div className="h-2.5 bg-muted/30 rounded w-1/3" />
                                </div>
                                <div className="h-3 bg-muted/40 rounded w-16" />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : transactions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <CreditCard className="w-10 h-10 mx-auto mb-2 opacity-30" />
                          <p className="text-sm">No transactions match your filters</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {transactions.map(tx => {
                            const isDebit = tx.amount > 0;
                            return (
                              <div
                                key={tx.id}
                                className="glass-card p-3 rounded-lg flex items-center gap-3"
                              >
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                                  isDebit ? "bg-red-500/10" : "bg-emerald-500/10"
                                )}>
                                  {isDebit
                                    ? <ArrowDownCircle className="w-4 h-4 text-red-400" />
                                    : <ArrowUpCircle className="w-4 h-4 text-emerald-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">
                                    {tx.merchantName || tx.name}
                                  </p>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(tx.date).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                    {tx.primaryCategory && (
                                      <span className="text-xs bg-white/10 text-muted-foreground rounded px-1.5 py-0.5">
                                        {tx.primaryCategory}
                                      </span>
                                    )}
                                    {tx.pending && (
                                      <span className="text-xs bg-yellow-500/20 text-yellow-400 rounded px-1.5 py-0.5 flex items-center gap-1">
                                        <Clock className="w-2.5 h-2.5" />Pending
                                      </span>
                                    )}
                                  </div>
                                  {accountNameMap[tx.accountId] && (
                                    <p className="text-xs text-muted-foreground/60 truncate">
                                      {accountNameMap[tx.accountId]}
                                    </p>
                                  )}
                                </div>
                                <span className={cn(
                                  "text-sm font-semibold shrink-0",
                                  isDebit ? "text-red-400" : "text-emerald-400"
                                )}>
                                  {privacyMode
                                    ? "••••••"
                                    : `${isDebit ? "-" : "+"}$${Math.abs(tx.amount).toFixed(2)}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
