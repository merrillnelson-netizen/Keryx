import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Brain, Sparkles, Activity, Heart, Tag, Users, Target, Wallet, ArrowRight } from "lucide-react";
import PersonalInsights from "@/components/personal-insights";

const ECOSYSTEM_FEATURES = [
  { icon: Activity, label: "Memory Pulse", color: "text-indigo-400" },
  { icon: Heart, label: "Mood Trend", color: "text-pink-400" },
  { icon: Tag, label: "Topic Distribution", color: "text-amber-400" },
  { icon: Users, label: "Relationship Health", color: "text-blue-400" },
  { icon: Target, label: "Goal Progress", color: "text-emerald-400" },
  { icon: Wallet, label: "Financial Pulse", color: "text-teal-400" },
];

export default function Insights() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
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

        {/* Personal Insights from AI */}
        <PersonalInsights />

        {/* Ecosystem View teaser */}
        <Card className="glass-card border-white/20 hover:border-indigo-500/30 transition-colors group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              Ecosystem View
              <span className="ml-auto text-muted-foreground group-hover:text-indigo-400 transition-colors">
                <ArrowRight className="w-4 h-4" />
              </span>
            </CardTitle>
            <CardDescription>Your life at a glance — all data sources in one place</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              See your memory pulse, mood trend, topic distribution, relationship health, goal progress, and financial snapshot — all in a single unified dashboard with a full transaction browser.
            </p>
            <div className="flex flex-wrap gap-2">
              {ECOSYSTEM_FEATURES.map(({ icon: Icon, label, color }) => (
                <div
                  key={label}
                  className="flex items-center gap-1.5 text-xs bg-white/5 rounded-full px-2.5 py-1 text-muted-foreground"
                >
                  <Icon className={`w-3 h-3 ${color}`} />
                  {label}
                </div>
              ))}
            </div>
            <Button size="sm" asChild>
              <Link href="/ecosystem">
                Open Ecosystem View
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* AI Thematic Synthesis Link */}
        <Card className="glass-card border-white/20 hover:border-purple-500/30 transition-colors group">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              AI Thematic Synthesis
              <span className="ml-auto text-muted-foreground group-hover:text-purple-500 transition-colors">→</span>
            </CardTitle>
            <CardDescription>
              Deep analysis of patterns in your memories with interactive Q&A
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Get a comprehensive analysis of your memories, discover hidden patterns, and ask follow-up questions to explore your insights further.
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href="/synthesis">
                Open AI Synthesis
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
