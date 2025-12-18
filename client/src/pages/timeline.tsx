import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Calendar, Clock, Gift, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const MOOD_CONFIG: Record<string, { emoji: string; color: string }> = {
  happy: { emoji: "😊", color: "bg-green-500" },
  sad: { emoji: "😢", color: "bg-blue-500" },
  anxious: { emoji: "😰", color: "bg-yellow-500" },
  excited: { emoji: "🎉", color: "bg-purple-500" },
  neutral: { emoji: "😐", color: "bg-gray-500" },
  frustrated: { emoji: "😤", color: "bg-red-500" },
  hopeful: { emoji: "🌟", color: "bg-cyan-500" },
  grateful: { emoji: "🙏", color: "bg-pink-500" },
  stressed: { emoji: "😫", color: "bg-orange-500" },
  peaceful: { emoji: "😌", color: "bg-teal-500" },
  angry: { emoji: "😠", color: "bg-red-600" },
  confused: { emoji: "😕", color: "bg-amber-500" },
  proud: { emoji: "😊", color: "bg-indigo-500" },
  nostalgic: { emoji: "🥹", color: "bg-violet-500" },
  motivated: { emoji: "💪", color: "bg-lime-500" },
};

function groupEntriesByDate(entries: LogEntry[]): Map<string, LogEntry[]> {
  const groups = new Map<string, LogEntry[]>();
  entries.forEach((entry) => {
    const date = new Date(entry.timestamp!).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(entry);
  });
  return groups;
}

function groupEntriesByMonth(entries: LogEntry[]): Map<string, LogEntry[]> {
  const groups = new Map<string, LogEntry[]>();
  entries.forEach((entry) => {
    const date = new Date(entry.timestamp!).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
    });
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(entry);
  });
  return groups;
}

interface TimeCapsuleResponse {
  data: LogEntry[];
  count: number;
  date: { month: number; day: number };
  message: string;
}

export default function Timeline() {
  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
  });

  const { data: timeCapsuleData, isLoading: timeCapsuleLoading } = useQuery<TimeCapsuleResponse>({
    queryKey: ["/api/timecapsule"],
    queryFn: async () => {
      const response = await fetch("/api/timecapsule", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch time capsule");
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading timeline...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const groupedByMonth = groupEntriesByMonth(logEntries);
  const timeCapsuleEntries = timeCapsuleData?.data || [];
  const sortedMonths = Array.from(groupedByMonth.entries()).sort((a, b) => 
    new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Life Timeline</h2>
              <p className="text-sm text-muted-foreground">Your journey through memories</p>
            </div>
          </div>
        </div>

        {/* Time Capsule - On This Day */}
        {timeCapsuleEntries.length > 0 && (
          <Card className="glass-card border-white/20 border-l-4 border-l-yellow-500">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-yellow-500" />
                On This Day
              </CardTitle>
              <CardDescription>
                Memories from {timeCapsuleData?.date.month}/{timeCapsuleData?.date.day} in previous years
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {timeCapsuleEntries.map((entry) => {
                  const yearsAgo = new Date().getFullYear() - new Date(entry.timestamp!).getFullYear();
                  const mood = MOOD_CONFIG[entry.mood || "neutral"] || MOOD_CONFIG.neutral;
                  
                  return (
                    <div 
                      key={entry.id}
                      className="glass-card p-4 rounded-xl flex items-start gap-4"
                      data-testid={`timecapsule-${entry.id}`}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-2xl font-bold text-primary">{yearsAgo}</span>
                        <span className="text-xs text-muted-foreground">year{yearsAgo > 1 ? "s" : ""} ago</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-foreground">{entry.memoryText}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs border-white/20">
                            {new Date(entry.timestamp!).toLocaleDateString()}
                          </Badge>
                          {entry.mood && (
                            <span className="text-sm">{mood.emoji}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {logEntries.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Calendar className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
            <p className="text-muted-foreground">Start logging memories to see your timeline</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-secondary to-accent" />

            {/* Timeline Entries by Month */}
            {sortedMonths.map(([month, monthEntries]) => (
              <div key={month} className="mb-8">
                {/* Month Header */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center z-10">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{month}</h3>
                  <Badge variant="outline" className="border-white/20">
                    {monthEntries.length} memories
                  </Badge>
                </div>

                {/* Entries */}
                <div className="ml-20 space-y-4">
                  {monthEntries.map((entry) => {
                    const mood = MOOD_CONFIG[entry.mood || "neutral"] || MOOD_CONFIG.neutral;
                    
                    return (
                      <div 
                        key={entry.id}
                        className="relative"
                        data-testid={`timeline-entry-${entry.id}`}
                      >
                        {/* Connection Line */}
                        <div className="absolute -left-12 top-4 w-8 h-0.5 bg-white/20" />
                        
                        {/* Mood Indicator */}
                        <div className={cn(
                          "absolute -left-16 top-2 w-4 h-4 rounded-full z-10",
                          mood.color
                        )} />
                        
                        <Card className="glass-card border-white/20 hover:shadow-lg transition-all">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <p className="text-foreground">{entry.memoryText}</p>
                                <div className="flex items-center gap-2 mt-3 flex-wrap">
                                  <Badge variant="outline" className="text-xs border-white/20">
                                    {new Date(entry.timestamp!).toLocaleTimeString([], { 
                                      hour: "2-digit", 
                                      minute: "2-digit" 
                                    })}
                                  </Badge>
                                  <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30">
                                    {entry.topicTag}
                                  </Badge>
                                  {entry.mood && (
                                    <span className="text-lg" title={entry.mood}>
                                      {mood.emoji}
                                    </span>
                                  )}
                                  {entry.detectedPeople && entry.detectedPeople.length > 0 && (
                                    <Badge variant="outline" className="text-xs bg-sky-500/20 text-sky-400 border-sky-500/30">
                                      {entry.detectedPeople.length} people
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
