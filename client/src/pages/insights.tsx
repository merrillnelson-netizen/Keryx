import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Brain, TrendingUp, Lightbulb, Sparkles, Loader2 } from "lucide-react";
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
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from "recharts";

interface MoodStat {
  mood: string;
  count: number;
  avgScore: number;
}

interface ThematicInsight {
  summary: string;
  patterns: string[];
  recommendations: string[];
  timespan: string;
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

export default function Insights() {
  const [days, setDays] = useState("30");
  const [question, setQuestion] = useState("");

  const { data: moodStats, isLoading: moodLoading } = useQuery<{ data: MoodStat[]; period: string }>({
    queryKey: ["/api/mood/stats", days],
    queryFn: async () => {
      const response = await fetch(`/api/mood/stats?days=${days}`);
      if (!response.ok) throw new Error("Failed to fetch mood stats");
      return response.json();
    },
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

  const chartData = moodStats?.data?.map((stat) => ({
    name: stat.mood,
    value: stat.count,
    fill: MOOD_COLORS[stat.mood] || "#6b7280",
    emoji: MOOD_EMOJIS[stat.mood] || "😐",
  })) || [];

  const barChartData = moodStats?.data?.map((stat) => ({
    mood: `${MOOD_EMOJIS[stat.mood] || "😐"} ${stat.mood}`,
    count: stat.count,
    avgScore: stat.avgScore,
    fill: MOOD_COLORS[stat.mood] || "#6b7280",
  })) || [];

  const chartConfig: ChartConfig = Object.fromEntries(
    Object.entries(MOOD_COLORS).map(([mood, color]) => [mood, { label: mood, color }])
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Cognitive Insights</h2>
              <p className="text-sm text-muted-foreground">Discover patterns in your memories and emotions</p>
            </div>
          </div>
        </div>

        {/* Time Period Selector */}
        <div className="glass-card p-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Analyzing:</span>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[180px] glass-card border-white/20" data-testid="select-days">
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

        {/* Mood Analytics */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Mood Distribution Chart */}
          <Card className="glass-card border-white/20">
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
          <Card className="glass-card border-white/20">
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
