import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
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
  Legend,
} from "recharts";

interface EcosystemStats {
  period: { days: number; timezone: string };
  systemHealth: {
    totalMemories: number;
    activeReminders: number;
    pendingActions: number;
  };
  memoryPulse: {
    perDay: { date: string; count: number }[];
    total7Days: number;
    velocityDeltaPct: number | null;
  };
  moodTrend: {
    trend: { date: string; avgScore: number; count: number }[];
    recentAvg: number | null;
  };
  topicDistribution: { topic: string; count: number }[];
  relationshipHealth: { name: string; mentionCount: number; closenessScore: number }[];
  goalProgress: {
    id: string;
    title: string;
    status: string;
    progress: number;
    milestones: { title: string; completed: boolean }[];
    aiSummary: string | null;
  }[];
  financial: {
    connected: boolean;
    totalSpending?: number;
    totalIncome?: number;
    transactionCount?: number;
    categoryBreakdown?: { category: string; amount: number }[];
  };
  generatedAt: string;
  cached: boolean;
}

const TOPIC_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#3b82f6",
  "#ec4899", "#8b5cf6", "#f97316", "#14b8a6",
];

const MOOD_COLOR = (score: number) => {
  if (score >= 30) return "#10b981";
  if (score <= -30) return "#ef4444";
  return "#f59e0b";
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function KpiBadge({ value, label, icon: Icon, color = "text-primary" }: {
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

function SectionHeader({ icon: Icon, title, color = "text-primary" }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={cn("w-5 h-5", color)} />
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
    </div>
  );
}

const MoodDot = ({ value }: { value: number }) => (
  <div
    className="w-3 h-3 rounded-full border border-background"
    style={{ background: MOOD_COLOR(value) }}
    title={`Score: ${value}`}
  />
);

const VelocityBadge = ({ delta }: { delta: number | null }) => {
  if (delta === null) return null;
  if (delta > 0) return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 gap-1 text-xs">
      <TrendingUp className="w-3 h-3" />+{delta}%
    </Badge>
  );
  if (delta < 0) return (
    <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1 text-xs">
      <TrendingDown className="w-3 h-3" />{delta}%
    </Badge>
  );
  return (
    <Badge className="bg-muted/40 text-muted-foreground border-muted/30 gap-1 text-xs">
      <Minus className="w-3 h-3" />flat
    </Badge>
  );
};

const MoodAvgBadge = ({ avg }: { avg: number | null }) => {
  if (avg === null) return null;
  const label = avg >= 30 ? "positive" : avg <= -30 ? "negative" : "neutral";
  const cls = avg >= 30
    ? "bg-green-500/20 text-green-400 border-green-500/30"
    : avg <= -30
    ? "bg-red-500/20 text-red-400 border-red-500/30"
    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  return (
    <Badge className={cn("text-xs", cls)}>
      avg {avg > 0 ? "+" : ""}{avg} — {label}
    </Badge>
  );
};

function closenessLabel(score: number): string {
  if (score >= 80) return "Close";
  if (score >= 50) return "Regular";
  if (score >= 20) return "Familiar";
  return "Acquaintance";
}

function closenessColor(score: number): string {
  if (score >= 80) return "#6366f1";
  if (score >= 50) return "#3b82f6";
  if (score >= 20) return "#f59e0b";
  return "#6b7280";
}

export default function Ecosystem() {
  const [, navigate] = useLocation();
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const { data, isLoading, isFetching, refetch } = useQuery<EcosystemStats>({
    queryKey: ["/api/ecosystem/stats", userTimezone],
    queryFn: async () => {
      const res = await fetch(
        `/api/ecosystem/stats?timezone=${encodeURIComponent(userTimezone)}&days=30`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleRefresh = () => {
    refetch();
    fetch(`/api/ecosystem/stats?timezone=${encodeURIComponent(userTimezone)}&days=30&refresh=true`, {
      credentials: "include",
    });
  };

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
                    ? `Last 30 days · Updated ${new Date(data.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}${data.cached ? " (cached)" : ""}`
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

        {/* Loading skeleton */}
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
            {/* ── System Health KPIs ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-3">
                <SectionHeader icon={Zap} title="System Health" color="text-yellow-500" />
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <KpiBadge
                    value={data.systemHealth.totalMemories.toLocaleString()}
                    label="Total Memories"
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
                </div>
              </CardContent>
            </Card>

            {/* ── Memory Pulse ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <SectionHeader icon={Activity} title="Memory Pulse" color="text-indigo-400" />
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-xs">
                      {data.memoryPulse.total7Days} last 7d
                    </Badge>
                    <VelocityBadge delta={data.memoryPulse.velocityDeltaPct} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {data.memoryPulse.perDay.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No memory data in the last 30 days.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={data.memoryPulse.perDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
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
                        interval={Math.floor(data.memoryPulse.perDay.length / 5)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "rgba(15,15,25,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                        labelFormatter={formatDate}
                        formatter={(val: number) => [val, "Memories"]}
                      />
                      <Area type="monotone" dataKey="count" stroke="#6366f1" fill="url(#memGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Mood Trend ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <SectionHeader icon={Heart} title="Mood Trend" color="text-pink-400" />
                  <MoodAvgBadge avg={data.moodTrend.recentAvg} />
                </div>
              </CardHeader>
              <CardContent>
                {data.moodTrend.trend.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No mood data yet. Add some memories with emotional content.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={data.moodTrend.trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                      <defs>
                        <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ec4899" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatShortDate}
                        tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                        interval={Math.floor(data.moodTrend.trend.length / 5)}
                      />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} domain={[-100, 100]} />
                      <Tooltip
                        contentStyle={{ background: "rgba(15,15,25,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                        labelFormatter={formatDate}
                        formatter={(val: number) => [val, "Mood Score"]}
                      />
                      {/* reference bands */}
                      <Line type="monotone" dataKey="avgScore" stroke="#ec4899" strokeWidth={2} dot={(props: any) => {
                        const { cx, cy, payload } = props;
                        const color = MOOD_COLOR(payload.avgScore);
                        return <circle key={payload.date} cx={cx} cy={cy} r={3} fill={color} stroke="transparent" />;
                      }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* ── Topic Distribution ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-3">
                <SectionHeader icon={Tag} title="Topic Distribution" color="text-amber-400" />
              </CardHeader>
              <CardContent>
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
                            <Cell key={entry.topic} fill={TOPIC_COLORS[i % TOPIC_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: "rgba(15,15,25,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
                          formatter={(val: number, name: string) => [val, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      {(() => {
                        const total = data.topicDistribution.reduce((s, t) => s + t.count, 0);
                        return data.topicDistribution.map((t, i) => (
                          <div key={t.topic} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] }} />
                            <span className="text-xs text-foreground truncate flex-1">{t.topic}</span>
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
              <CardHeader className="pb-3">
                <SectionHeader icon={Users} title="Relationship Health" color="text-blue-400" />
              </CardHeader>
              <CardContent>
                {data.relationshipHealth.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No people tracked yet. Log some memories that mention people.</p>
                ) : (
                  <div className="space-y-2.5">
                    {data.relationshipHealth.map((p) => {
                      const max = data.relationshipHealth[0]?.mentionCount || 1;
                      const pct = Math.round((p.mentionCount / max) * 100);
                      const color = closenessColor(p.closenessScore);
                      const label = closenessLabel(p.closenessScore);
                      return (
                        <div key={p.name} className="flex items-center gap-3">
                          <div className="w-20 text-xs text-foreground truncate text-right flex-shrink-0">{p.name}</div>
                          <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, background: color }}
                            />
                          </div>
                          <div className="w-16 flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">{p.mentionCount}</span>
                            <Badge
                              className="text-[10px] px-1 py-0 border"
                              style={{ borderColor: color + "55", color, background: color + "22" }}
                            >
                              {label}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Goal Progress ── */}
            <Card className="glass-card border-white/20">
              <CardHeader className="pb-3">
                <SectionHeader icon={Target} title="Goal Progress" color="text-emerald-400" />
              </CardHeader>
              <CardContent>
                {data.goalProgress.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No active goals. Head to Goals to set one.</p>
                ) : (
                  <div className="space-y-4">
                    {data.goalProgress.map((g) => {
                      const done = g.milestones.filter(m => m.completed).length;
                      const total = g.milestones.length;
                      return (
                        <div key={g.id} className="glass-card p-4 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground truncate flex-1">{g.title}</p>
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
                          {/* progress bar */}
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
                              {g.milestones.slice(0, 5).map((m, i) => (
                                m.completed
                                  ? <CheckCircle2 key={i} className="w-3.5 h-3.5 text-emerald-400" />
                                  : <Circle key={i} className="w-3.5 h-3.5 text-muted-foreground/40" />
                              ))}
                              <span className="ml-1">{done}/{total} milestones</span>
                            </div>
                          )}
                          {g.aiSummary && (
                            <p className="text-xs text-muted-foreground italic border-l-2 border-emerald-500/30 pl-2">{g.aiSummary}</p>
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
              <CardHeader className="pb-3">
                <SectionHeader icon={Wallet} title="Financial Pulse" color="text-teal-400" />
              </CardHeader>
              <CardContent>
                {!data.financial.connected ? (
                  <div className="text-center py-6 space-y-2">
                    <Wallet className="w-8 h-8 text-muted-foreground mx-auto opacity-40" />
                    <p className="text-muted-foreground text-sm">Plaid not connected.</p>
                    <p className="text-xs text-muted-foreground/60">Connect your bank in Settings to see spending insights here.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <KpiBadge
                        value={`$${(data.financial.totalSpending ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                        label="Spent"
                        icon={TrendingDown}
                        color="text-red-400"
                      />
                      <KpiBadge
                        value={`$${(data.financial.totalIncome ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
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
                    {data.financial.categoryBreakdown && data.financial.categoryBreakdown.length > 0 && (
                      <ResponsiveContainer width="100%" height={160}>
                        <BarChart
                          data={data.financial.categoryBreakdown}
                          layout="vertical"
                          margin={{ top: 4, right: 8, left: 4, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} tickFormatter={(v) => `$${v}`} />
                          <YAxis
                            type="category"
                            dataKey="category"
                            width={90}
                            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                            tickFormatter={(v: string) => v.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).slice(0, 14)}
                          />
                          <Tooltip
                            contentStyle={{ background: "rgba(15,15,25,0.9)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }}
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
