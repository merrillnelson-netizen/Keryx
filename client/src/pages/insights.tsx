import { useState } from "react";
import AppLayout from "@/components/app-layout";
import { TierGate } from "@/components/tier-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Brain, Sparkles, Activity, Heart, Tag, Users, Target, Wallet, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import PersonalInsights from "@/components/personal-insights";
import SynthesisContent from "@/components/synthesis-content";

type Tab = "insights" | "synthesis" | "ecosystem";

const ECOSYSTEM_FEATURES = [
  { icon: Activity, label: "Memory Pulse", color: "text-indigo-400" },
  { icon: Heart, label: "Mood Trend", color: "text-pink-400" },
  { icon: Tag, label: "Topic Distribution", color: "text-amber-400" },
  { icon: Users, label: "Relationship Health", color: "text-blue-400" },
  { icon: Target, label: "Goal Progress", color: "text-emerald-400" },
  { icon: Wallet, label: "Financial Pulse", color: "text-teal-400" },
];

const TABS: { id: Tab; label: string; icon: React.ElementType; color: string }[] = [
  { id: "insights", label: "Cognitive Insights", icon: Brain, color: "from-purple-500 via-pink-500 to-orange-500" },
  { id: "synthesis", label: "AI Synthesis", icon: Sparkles, color: "from-purple-500 to-indigo-500" },
  { id: "ecosystem", label: "Ecosystem View", icon: Activity, color: "from-indigo-500 via-purple-500 to-pink-500" },
];

function InsightsInner() {
  const [activeTab, setActiveTab] = useState<Tab>("insights");

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in">
        {/* Header */}
        <div className="glass-card p-5 rounded-2xl flex-shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className={cn(
              "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center",
              TABS.find(t => t.id === activeTab)?.color ?? "from-purple-500 to-pink-500"
            )}>
              {(() => {
                const Icon = TABS.find(t => t.id === activeTab)?.icon ?? Brain;
                return <Icon className="w-5 h-5 text-white" />;
              })()}
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {TABS.find(t => t.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeTab === "insights" && "Discover patterns in your memories and emotions"}
                {activeTab === "synthesis" && "Deep analysis of themes with interactive Q&A"}
                {activeTab === "ecosystem" && "Your life at a glance — all data sources in one place"}
              </p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-all duration-200",
                    activeTab === tab.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === "insights" && (
            <div className="space-y-4 pb-4">
              <PersonalInsights />
            </div>
          )}

          {activeTab === "synthesis" && (
            <div className="h-full" style={{ minHeight: "60vh" }}>
              <SynthesisContent />
            </div>
          )}

          {activeTab === "ecosystem" && (
            <div className="space-y-4 pb-4">
              {/* Feature grid */}
              <Card className="glass-card border-white/20">
                <CardContent className="pt-5 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    See your memory pulse, mood trend, topic distribution, relationship health, goal progress,
                    and financial snapshot — all in a single unified dashboard with a full transaction browser.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ECOSYSTEM_FEATURES.map(({ icon: Icon, label, color }) => (
                      <div
                        key={label}
                        className="flex items-center gap-1.5 text-xs bg-white/5 rounded-full px-2.5 py-1 text-muted-foreground"
                      >
                        <Icon className={cn("w-3 h-3", color)} />
                        {label}
                      </div>
                    ))}
                  </div>
                  <Button asChild className="w-full sm:w-auto">
                    <Link href="/ecosystem">
                      Open Ecosystem View
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
  );
}

export default function Insights() {
  return (
    <AppLayout>
      <TierGate
        required="pro"
        feature="Insights"
        description="Unlock Cognitive Insights, AI Synthesis, and Ecosystem View to see patterns across your memories, emotions, goals, and relationships."
      >
        <InsightsInner />
      </TierGate>
    </AppLayout>
  );
}
