import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Brain, TrendingUp, Lightbulb, Sparkles, Loader2, Wallet, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LineChart, Line, CartesianGrid, Legend, Tooltip } from "recharts";

interface MoodStat {
  mood: string;
  count: number;
  avgScore: number;
}

interface MoodTrendPoint {
  date: string;
  avgScore: number;
  count: number;
}

interface TopicFrequency {
  topic: string;
  count: number;
}

interface ThematicInsight {
  summary: string;
  patterns: string[];
  recommendations: string[];
  timespan: string;
}

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

interface PlaidStatus {
  configured: boolean;
  enabled: boolean;
  featureDisabled: boolean;
}

const MOOD_COLORS: Record<string, string> = {
  happy: "#22c55e",
  sad: "#3b82f6",
  anxious: "#eab308",
  excited: "#a855f7",
  neutral: "#6b7280",
  frustrated: "#ef4444",
  hopeful: "#06b6d4",
  grateful: "#ec4899",
  stressed: "#f97316",
  peaceful: "#14b8a6",
  angry: "#dc2626",
  confused: "#f59e0b",
  proud: "#6366f1",
  nostalgic: "#8b5cf6",
  motivated: "#84cc16",
};

const MOOD_EMOJIS: Record<string, string> = {
  happy: "😊",
  sad: "😢",
  anxious: "😰",
  excited: "🎉",
  neutral: "😐",
  frustrated: "😤",
  hopeful: "🌟",
  grateful: "🙏",
  stressed: "😫",
  peaceful: "😌",
  angry: "😠",
  confused: "😕",
  proud: "😊",
  nostalgic: "🥹",
  motivated: "💪",
};

const SPENDING_COLORS = [
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f97316", // orange
  "#eab308", // yellow
  "#84cc16", // lime
];

export default function Insights() {
  const [days, setDays] = useState("30");
  const [question, setQuestion] = useState("");

  const { data: moodStats, isLoading: moodLoading } = useQuery<{ data: MoodStat[]; period: string }>({
    queryKey: ["/api/mood/stats", days],
    queryFn: async () => {
      const response = await fetch(`/api/mood/stats?days=${days}`, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
  });

  const { data: moodTrend, isLoading: trendLoading } = useQuery<{ data: MoodTrendPoint[] }>({
    queryKey: ["/api/mood/trend", days],
    queryFn: async () => {
      const response = await fetch(`/api/mood/trend?days=${days}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch mood trend");
      return response.json();
    },
  });

  const { data: topicFrequency, isLoading: topicLoading } = useQuery<{ data: TopicFrequency[] }>({
    queryKey: ["/api/topics/frequency", days],
    queryFn: async () => {
      const response = await fetch(`/api/topics/frequency?days=${days}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch topic frequency");
      return response.json();
    },
  });

  const { data: plaidStatus } = useQuery<PlaidStatus>({
    queryKey: ["/api/plaid/status"],
    queryFn: async () => {
      const response = await fetch("/api/plaid/status", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch Plaid status");
      return response.json();
    },
  });

  const { data: spendingSummary, isLoading: spendingLoading } = useQuery<SpendingSummary>({
    queryKey: ["/api/plaid/spending-summary", days],
    queryFn: async () => {
      const response = await fetch(`/api/plaid/spending-summary?days=${days}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch spending summary");
      return response.json();
    },
    enabled: plaidStatus?.enabled && plaidStatus?.configured,
  });

  const insightsMutation = useMutation({
    mutationFn: async ({ question, days }: { question?: string; days: number }) => {
      const response = await apiRequest("POST", "/api/insights", { question, days });
      if (!response.ok) throw new Error("Failed to generate insights");
      return response.json();
    },
  });

  const handleGenerateInsights = () => {
    insightsMutation.mutate({ question: question || undefined, days: parseInt(days) });
  };

  // Memoize chart data to prevent unnecessary recalculations on re-renders
  const chartData = useMemo(() => 
    moodStats?.data?.map((stat) => ({
      name: stat.mood,
      value: stat.count,
      fill: MOOD_COLORS[stat.mood] || "#6b7280",
      emoji: MOOD_EMOJIS[stat.mood] || "😐",
    })) || [],
    [moodStats?.data]
  );

  const barChartData = useMemo(() =>
    moodStats?.data?.map((stat) => ({
      mood: `${MOOD_EMOJIS[stat.mood] || "😐"} ${stat.mood}`,
      count: stat.count,
      avgScore: stat.avgScore,
      fill: MOOD_COLORS[stat.mood] || "#6b7280",
    })) || [],
    [moodStats?.data]
  );

  const chartConfig: ChartConfig = useMemo(() =>
    Object.fromEntries(
      Object.entries(MOOD_COLORS).map(([mood, color]) => [mood, { label: mood, color }])
    ),
    []
  );

  // Memoize mood trend data for line chart
  const trendChartData = useMemo(() =>
    moodTrend?.data?.map(point => ({
      date: new Date(point.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      score: point.avgScore,
      memories: point.count,
    })) || [],
    [moodTrend?.data]
  );

  // Memoize topic frequency data
  const topicChartData = useMemo(() => 
    topicFrequency?.data || [],
    [topicFrequency?.data]
  );

  // Memoize spending chart data
  const spendingChartData = useMemo(() => {
    if (!spendingSummary?.categoryBreakdown) return [];
    return spendingSummary.categoryBreakdown.slice(0, 8).map((cat, i) => ({
      name: cat.category,
      value: cat.amount,
      fill: SPENDING_COLORS[i % SPENDING_COLORS.length],
    }));
  }, [spendingSummary?.categoryBreakdown]);

  const isFinancialEnabled = plaidStatus?.enabled && plaidStatus?.configured;

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section with Time Period Selector */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Cognitive Insights</h2>
                <p className="text-sm text-muted-foreground">Discover patterns in your memories and emotions</p>
              </div>
            </div>
            
            {/* Time Period Selector - moved to header */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Analyzing:</span>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-[160px] glass-card border-white/20" data-testid="select-days">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent className="glass-card border-primary/20">
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 3 months</SelectItem>
                  <SelectItem value="365">Last year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Mood Analytics */}
        <div className="grid md:grid-cols-2 gap-6 w-full overflow-hidden">
          {/* Mood Distribution Chart */}
          <Card className="glass-card border-white/20 min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Mood Distribution
              </CardTitle>
              <CardDescription>Your emotional patterns over time</CardDescription>
            </CardHeader>
            <CardContent>
              {moodLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : chartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <p>No mood data available yet. Start logging memories!</p>
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${MOOD_EMOJIS[name] || "😐"} ${value}`}
                        labelLine={false}
                      >
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Mood Breakdown */}
          <Card className="glass-card border-white/20 min-w-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Mood Breakdown
              </CardTitle>
              <CardDescription>Frequency and average sentiment</CardDescription>
            </CardHeader>
            <CardContent>
              {moodLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : barChartData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <p>No mood data available yet.</p>
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} layout="vertical">
                      <XAxis type="number" />
                      <YAxis dataKey="mood" type="category" width={100} />
                      <ChartTooltip 
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="glass-card p-2 rounded-lg border border-white/20">
                                <p className="font-medium">{data.mood}</p>
                                <p className="text-sm text-muted-foreground">Count: {data.count}</p>
                                <p className="text-sm text-muted-foreground">Avg Score: {data.avgScore}</p>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Bar dataKey="count" radius={4}>
                        {barChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mood Trend Over Time */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Mood Trend Over Time
            </CardTitle>
            <CardDescription>Your emotional journey day by day</CardDescription>
          </CardHeader>
          <CardContent>
            {trendLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : trendChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p>Not enough data to show trends. Keep logging!</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis 
                    dataKey="date" 
                    stroke="rgba(255,255,255,0.5)"
                    tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                  />
                  <YAxis 
                    domain={[-100, 100]} 
                    stroke="rgba(255,255,255,0.5)"
                    tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }}
                    label={{ value: 'Mood Score', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.5)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px'
                    }}
                    labelStyle={{ color: 'rgba(255,255,255,0.9)' }}
                    formatter={(value: number, name: string) => [
                      name === 'score' ? `${value} (${value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'})` : value,
                      name === 'score' ? 'Mood Score' : 'Memories'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="score" 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    dot={{ fill: '#a855f7', r: 4 }}
                    activeDot={{ r: 6, fill: '#d946ef' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Topic Frequency */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500" />
              Topic Frequency
            </CardTitle>
            <CardDescription>What you've been thinking about most</CardDescription>
          </CardHeader>
          <CardContent>
            {topicLoading ? (
              <div className="h-64 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : topicChartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <p>No topic data available yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, topicChartData.length * 40)}>
                <BarChart data={topicChartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                  <XAxis type="number" stroke="rgba(255,255,255,0.5)" tick={{ fill: 'rgba(255,255,255,0.7)', fontSize: 12 }} />
                  <YAxis 
                    dataKey="topic" 
                    type="category" 
                    width={75}
                    stroke="rgba(255,255,255,0.5)"
                    tick={{ fill: 'rgba(255,255,255,0.9)', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(0,0,0,0.8)', 
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px'
                    }}
                    formatter={(value: number) => [`${value} memories`, 'Count']}
                  />
                  <Bar 
                    dataKey="count" 
                    fill="#f97316" 
                    radius={[0, 4, 4, 0]}
                    background={{ fill: 'rgba(255,255,255,0.05)' }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Financial Insights - Only shown if Plaid is enabled */}
        {isFinancialEnabled && (
          <Card className="glass-card border-white/20 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-emerald-500" />
                Spending Breakdown
              </CardTitle>
              <CardDescription>Where your money is going</CardDescription>
            </CardHeader>
            <CardContent>
              {spendingLoading ? (
                <div className="h-64 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                </div>
              ) : !spendingSummary || spendingSummary.transactionCount === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p>No transaction data available for this period.</p>
                    <p className="text-sm mt-1">Sync your bank account in Settings to see spending insights.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-card p-4 rounded-xl text-center">
                      <p className="text-2xl font-bold text-emerald-500">
                        ${spendingSummary.totalSpending.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Total Spent</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl text-center">
                      <p className="text-2xl font-bold text-primary">
                        {spendingSummary.transactionCount}
                      </p>
                      <p className="text-xs text-muted-foreground">Transactions</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl text-center">
                      <p className="text-2xl font-bold text-cyan-500">
                        ${(spendingSummary.totalSpending / spendingSummary.transactionCount).toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground">Avg per Transaction</p>
                    </div>
                    <div className="glass-card p-4 rounded-xl text-center">
                      <p className="text-2xl font-bold text-violet-500">
                        {spendingSummary.categoryBreakdown.length}
                      </p>
                      <p className="text-xs text-muted-foreground">Categories</p>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    {spendingChartData.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-4">By Category</h4>
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={spendingChartData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              labelLine={{ stroke: 'rgba(255,255,255,0.3)' }}
                            >
                              {spendingChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Pie>
                            <Tooltip 
                              formatter={(value: number) => [`$${value.toFixed(2)}`, 'Amount']}
                              contentStyle={{ 
                                backgroundColor: 'rgba(0,0,0,0.8)', 
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '8px'
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {spendingSummary.topMerchants.length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-4">Top Merchants</h4>
                        <div className="space-y-2">
                          {spendingSummary.topMerchants.slice(0, 6).map((merchant, i) => (
                            <div key={i} className="glass-card p-3 rounded-lg">
                              <p className="text-sm text-foreground break-words">{merchant.merchant}</p>
                              <div className="flex justify-end mt-1">
                                <span className="text-sm font-medium text-emerald-500">${merchant.amount.toFixed(2)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI Thematic Synthesis */}
        <Card className="glass-card border-white/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              AI Thematic Synthesis
            </CardTitle>
            <CardDescription>
              Ask questions about patterns in your memories or get an automatic analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Textarea
                placeholder="Ask a question like: 'What patterns exist in my work stress?' or leave empty for general insights..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="flex-1 glass-card border-white/20 min-h-[80px]"
                data-testid="input-question"
              />
            </div>
            <Button
              onClick={handleGenerateInsights}
              disabled={insightsMutation.isPending}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90"
              data-testid="button-generate-insights"
            >
              {insightsMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Insights
                </>
              )}
            </Button>

            {insightsMutation.data && (
              <div className="mt-6 space-y-4 animate-fade-in">
                <div className="glass-card p-4 rounded-xl">
                  <h4 className="font-medium text-foreground mb-2">Summary</h4>
                  <p className="text-muted-foreground">{insightsMutation.data.data.summary}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Based on {insightsMutation.data.memoriesAnalyzed} memories • {insightsMutation.data.data.timespan}
                  </p>
                </div>

                {insightsMutation.data.data.patterns.length > 0 && (
                  <div className="glass-card p-4 rounded-xl">
                    <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      Patterns Detected
                    </h4>
                    <ul className="space-y-2">
                      {insightsMutation.data.data.patterns.map((pattern: string, i: number) => (
                        <li key={i} className="text-muted-foreground flex items-start gap-2">
                          <span className="text-primary">•</span>
                          {pattern}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {insightsMutation.data.data.recommendations.length > 0 && (
                  <div className="glass-card p-4 rounded-xl border-l-4 border-yellow-500">
                    <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-yellow-500" />
                      Recommendations
                    </h4>
                    <ul className="space-y-2">
                      {insightsMutation.data.data.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="text-muted-foreground flex items-start gap-2">
                          <span className="text-yellow-500">→</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
