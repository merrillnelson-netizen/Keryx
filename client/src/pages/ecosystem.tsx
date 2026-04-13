import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
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
} from "recharts";

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
  relationshipHealth: { name: string; mentionCount: number; velocityTier: string }[];
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

const VELOCITY_COLORS: Record<string, string> = {
  partner: "#6366f1",
  family: "#6366f1",
  close_friend: "#3b82f6",
  friend: "#10b981",
  acquaintance: "#6b7280",
};

function velocityColor(tier: string): string {
  return VELOCITY_COLORS[tier] ?? "#6b7280";
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
                        formatter={(val: number, _name: string, item: { payload: { velocityTier: string } }) => [
                          `${val} mentions — ${velocityLabel(item.payload.velocityTier)}`,
                          "Mentions",
                        ]}
                      />
                      <Bar dataKey="mentionCount" radius={[0, 4, 4, 0]}>
                        {data.relationshipHealth.map((p) => (
                          <Cell
                            key={p.name}
                            fill={velocityColor(p.velocityTier)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                {data.relationshipHealth.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {Object.entries(VELOCITY_COLORS)
                      .filter(([tier]) =>
                        data.relationshipHealth.some((p) => p.velocityTier === tier)
                      )
                      .map(([tier, color]) => (
                        <div key={tier} className="flex items-center gap-1.5">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="text-xs text-muted-foreground">
                            {velocityLabel(tier)}
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
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="w-4 h-4 text-teal-400" />
                  Financial Pulse
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <SectionCaption text={data.captions.financial} />
                {!data.financial.connected ? (
                  <div className="text-center py-6 space-y-2">
                    <Wallet className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-muted-foreground text-sm">Plaid not connected.</p>
                    <p className="text-xs text-muted-foreground/60">
                      Connect your bank in Settings to see spending insights here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <KpiBadge
                        value={`$${(data.financial.totalSpending ?? 0).toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}`}
                        label="Spent"
                        icon={TrendingDown}
                        color="text-red-400"
                      />
                      <KpiBadge
                        value={`$${(data.financial.totalIncome ?? 0).toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}`}
                        label="Income"
                        icon={TrendingUp}
                        color="text-emerald-400"
                      />
                      <KpiBadge
                        value={data.financial.transactionCount ?? 0}
                        label="Transactions"
                        icon={Activity}
                        color="text-teal-400"
                      />
                    </div>
                    {data.financial.categoryBreakdown &&
                      data.financial.categoryBreakdown.length > 0 && (
                        <ResponsiveContainer width="100%" height={160}>
                          <BarChart
                            data={data.financial.categoryBreakdown}
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
                              tickFormatter={(v: number) => `$${v}`}
                            />
                            <YAxis
                              type="category"
                              dataKey="category"
                              width={90}
                              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                              tickFormatter={(v: string) =>
                                v
                                  .replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) => c.toUpperCase())
                                  .slice(0, 14)
                              }
                            />
                            <Tooltip
                              contentStyle={{
                                background: "rgba(15,15,25,0.9)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: 8,
                              }}
                              formatter={(val: number) => [`$${val.toFixed(2)}`, "Spent"]}
                            />
                            <Bar dataKey="amount" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
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
