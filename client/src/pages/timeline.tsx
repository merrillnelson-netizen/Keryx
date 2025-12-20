import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Calendar, Clock, Gift, LayoutGrid, Table as TableIcon, Users, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MOOD_CONFIG: Record<string, { emoji: string; color: string; label: string; bgColor: string }> = {
  happy: { emoji: "😊", color: "bg-green-500", bgColor: "bg-green-500/20", label: "Happy" },
  sad: { emoji: "😢", color: "bg-blue-500", bgColor: "bg-blue-500/20", label: "Sad" },
  anxious: { emoji: "😰", color: "bg-yellow-500", bgColor: "bg-yellow-500/20", label: "Anxious" },
  excited: { emoji: "🎉", color: "bg-purple-500", bgColor: "bg-purple-500/20", label: "Excited" },
  neutral: { emoji: "😐", color: "bg-gray-500", bgColor: "bg-gray-500/20", label: "Neutral" },
  frustrated: { emoji: "😤", color: "bg-red-500", bgColor: "bg-red-500/20", label: "Frustrated" },
  hopeful: { emoji: "🌟", color: "bg-cyan-500", bgColor: "bg-cyan-500/20", label: "Hopeful" },
  grateful: { emoji: "🙏", color: "bg-pink-500", bgColor: "bg-pink-500/20", label: "Grateful" },
  stressed: { emoji: "😫", color: "bg-orange-500", bgColor: "bg-orange-500/20", label: "Stressed" },
  peaceful: { emoji: "😌", color: "bg-teal-500", bgColor: "bg-teal-500/20", label: "Peaceful" },
  angry: { emoji: "😠", color: "bg-red-600", bgColor: "bg-red-600/20", label: "Angry" },
  confused: { emoji: "😕", color: "bg-amber-500", bgColor: "bg-amber-500/20", label: "Confused" },
  proud: { emoji: "😊", color: "bg-indigo-500", bgColor: "bg-indigo-500/20", label: "Proud" },
  nostalgic: { emoji: "🥹", color: "bg-violet-500", bgColor: "bg-violet-500/20", label: "Nostalgic" },
  motivated: { emoji: "💪", color: "bg-lime-500", bgColor: "bg-lime-500/20", label: "Motivated" },
};

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

function groupEntriesByDate(entries: LogEntry[]): Map<string, LogEntry[]> {
  const groups = new Map<string, LogEntry[]>();
  entries.forEach((entry) => {
    const date = new Date(entry.timestamp!).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
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

function MoodBadge({ mood, score }: { mood?: string | null; score?: number | null }) {
  if (!mood) return null;
  const config = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-lg" title={config.label}>
            {config.emoji}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
          {score !== null && score !== undefined && (
            <p className="text-xs text-muted-foreground">Score: {score}</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PeopleBadge({ people }: { people?: string[] | null }) {
  if (!people || people.length === 0) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="cursor-default text-xs bg-sky-500/20 text-sky-400 border-sky-500/30"
          >
            <Users className="w-3 h-3 mr-1" />
            {people.length}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">People mentioned:</p>
          <ul className="text-sm">
            {people.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function Timeline() {
  const [viewMode, setViewMode] = useState<"timeline" | "cards" | "table">("timeline");
  
  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
  });

  const { data: timeCapsuleData } = useQuery<TimeCapsuleResponse>({
    queryKey: ["/api/timecapsule"],
    queryFn: async () => {
      const response = await fetch("/api/timecapsule", { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
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
  const groupedByDate = groupEntriesByDate(logEntries);
  const timeCapsuleEntries = timeCapsuleData?.data || [];
  const sortedMonths = Array.from(groupedByMonth.entries()).sort((a, b) => 
    new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );
  const sortedDates = Array.from(groupedByDate.entries()).sort((a, b) => 
    new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );

  const sortedEntries = [...logEntries].sort((a, b) => 
    new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Life Timeline</h2>
                <p className="text-sm text-muted-foreground">Your journey through memories ({logEntries.length} total)</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "timeline" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("timeline")}
                data-testid="button-view-timeline"
                title="Timeline view"
              >
                <GitBranch className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("cards")}
                data-testid="button-view-cards"
                title="Card view"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("table")}
                data-testid="button-view-table"
                title="Table view"
              >
                <TableIcon className="w-4 h-4" />
              </Button>
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
        ) : viewMode === "table" ? (
          /* Table View */
          <div className="glass-card rounded-2xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-white/5">
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Time</TableHead>
                  <TableHead className="text-muted-foreground w-[40%]">Memory</TableHead>
                  <TableHead className="text-muted-foreground">Topic</TableHead>
                  <TableHead className="text-muted-foreground text-center">Mood</TableHead>
                  <TableHead className="text-muted-foreground text-center">People</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntries.map((entry) => {
                  const entryDate = new Date(entry.timestamp!);
                  
                  return (
                    <TableRow 
                      key={entry.id}
                      className="border-white/10 hover:bg-white/5"
                      data-testid={`timeline-row-${entry.id}`}
                    >
                      <TableCell className="font-medium">
                        {entryDate.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entryDate.toLocaleTimeString([], { 
                          hour: "2-digit", 
                          minute: "2-digit" 
                        })}
                      </TableCell>
                      <TableCell>
                        <p className="line-clamp-2">{entry.memoryText}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                          {entry.topicTag}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <MoodBadge mood={entry.mood} score={entry.moodScore} />
                      </TableCell>
                      <TableCell className="text-center">
                        <PeopleBadge people={entry.detectedPeople} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : viewMode === "timeline" ? (
          /* Timeline View - Compact chronological view */
          <div className="glass-card rounded-2xl p-6">
            <div className="relative">
              {/* Main Timeline Line */}
              <div className="absolute left-[120px] md:left-[140px] top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary via-secondary to-accent" />

              {sortedDates.map(([date, dateEntries], dateIndex) => (
                <div key={date} className="mb-6 last:mb-0">
                  {/* Date Header */}
                  <div className="flex items-center mb-3">
                    <div className="w-[120px] md:w-[140px] pr-4 text-right">
                      <span className="text-sm font-semibold text-foreground">{date.split(",")[0]}</span>
                      <span className="text-xs text-muted-foreground block">{date.split(",").slice(1).join(",").trim()}</span>
                    </div>
                    <div className="w-3 h-3 rounded-full bg-primary z-10 ring-4 ring-background" />
                  </div>

                  {/* Entries for this date */}
                  <div className="ml-[120px] md:ml-[140px] pl-6 space-y-2">
                    {dateEntries.map((entry, entryIndex) => {
                      const mood = MOOD_CONFIG[entry.mood || "neutral"] || MOOD_CONFIG.neutral;
                      const entryTime = new Date(entry.timestamp!).toLocaleTimeString([], { 
                        hour: "2-digit", 
                        minute: "2-digit" 
                      });
                      
                      return (
                        <div 
                          key={entry.id}
                          className={cn(
                            "relative p-3 rounded-lg border border-white/10 hover:border-white/20 transition-all",
                            mood.bgColor
                          )}
                          data-testid={`timeline-item-${entry.id}`}
                        >
                          {/* Connection dot */}
                          <div className={cn(
                            "absolute -left-[27px] top-4 w-2 h-2 rounded-full",
                            mood.color
                          )} />
                          
                          <div className="flex items-start gap-3">
                            <span className="text-lg flex-shrink-0">{mood.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground leading-relaxed">{entry.memoryText}</p>
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                <span className="text-xs text-muted-foreground">{entryTime}</span>
                                <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30">
                                  {entry.topicTag}
                                </Badge>
                                {entry.detectedPeople && entry.detectedPeople.length > 0 && (
                                  <PeopleBadge people={entry.detectedPeople} />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Card View with Timeline */
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
