import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInfiniteQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Calendar, LayoutGrid, Table as TableIcon, Users, ChevronLeft, ChevronRight, Clock, Flame, TrendingUp, Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
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

function CalendarBadge({ title, attendees }: { title?: string | null; attendees?: string[] | null }) {
  if (!title) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="cursor-default text-xs bg-purple-500/20 text-purple-400 border-purple-500/30"
          >
            <Calendar className="w-3 h-3 mr-1" />
            {title.length > 20 ? title.substring(0, 20) + "..." : title}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{title}</p>
          {attendees && attendees.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-1">Attendees:</p>
              <ul className="text-xs">
                {attendees.slice(0, 5).map((email, i) => (
                  <li key={i}>{email}</li>
                ))}
                {attendees.length > 5 && <li>+{attendees.length - 5} more</li>}
              </ul>
            </>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface CalendarGridProps {
  entriesByDay: Map<string, LogEntry[]>;
  currentMonth: Date;
  onDayClick: (date: Date, entries: LogEntry[]) => void;
  selectedDateKey: string | null;
}

function CalendarGrid({ entriesByDay, currentMonth, onDayClick, selectedDateKey }: CalendarGridProps) {
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const maxEntriesInDay = useMemo(() => {
    let max = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const count = entriesByDay.get(dateKey)?.length || 0;
      if (count > max) max = count;
    }
    return max;
  }, [entriesByDay, currentMonth, daysInMonth]);

  const getIntensityClass = (count: number) => {
    if (count === 0) return "";
    if (maxEntriesInDay <= 1) return "bg-purple-500/40 border-purple-500/50";
    const ratio = count / maxEntriesInDay;
    if (ratio > 0.75) return "bg-purple-500/60 border-purple-500/70";
    if (ratio > 0.5) return "bg-purple-500/40 border-purple-500/50";
    if (ratio > 0.25) return "bg-purple-500/25 border-purple-500/35";
    return "bg-purple-500/15 border-purple-500/25";
  };

  return (
    <div className="glass-card rounded-2xl p-4 md:p-6">
      <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-xs md:text-sm font-medium text-muted-foreground py-2"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 md:gap-2">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="aspect-square" />;
          }

          const dateKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const dayEntries = entriesByDay.get(dateKey) || [];
          const hasEntries = dayEntries.length > 0;
          const isToday = getLocalDateKey(new Date()) === dateKey;
          const isSelected = selectedDateKey === dateKey;

          return (
            <button
              key={day}
              onClick={() => {
                const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                onDayClick(clickedDate, dayEntries);
              }}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center p-1 transition-all relative border",
                hasEntries 
                  ? cn(getIntensityClass(dayEntries.length), "hover:brightness-125 cursor-pointer")
                  : "border-transparent hover:bg-white/5 cursor-pointer",
                isToday && "ring-2 ring-primary",
                isSelected && "ring-2 ring-white"
              )}
              data-testid={`calendar-day-${day}`}
            >
              <span className={cn(
                "text-sm md:text-base font-medium",
                hasEntries ? "text-purple-300" : "text-muted-foreground"
              )}>
                {day}
              </span>
              {hasEntries && (
                <span className="text-[10px] text-purple-300 font-medium">
                  {dayEntries.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Timeline() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<LogEntry[]>([]);
  const [detailViewMode, setDetailViewMode] = useState<"cards" | "table">("cards");
  
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<{
    data: LogEntry[];
    hasMore: boolean;
    total?: number;
    offset: number;
  }>({
    queryKey: ["/api/logs", "timeline-all"],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam as number;
      const response = await fetch(`/api/logs?limit=100&offset=${offset}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch");
      const result = await response.json();
      return { data: result.data, hasMore: result.hasMore, total: result.total, offset };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      return lastPage.offset + 100;
    },
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allEntries = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap(page => page.data);
  }, [data]);

  const totalCount = data?.pages?.[0]?.total || allEntries.length;
  const loadedAll = !hasNextPage;

  const entriesByDay = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    allEntries.forEach((entry) => {
      if (!entry.timestamp) return;
      const dateKey = getLocalDateKey(new Date(entry.timestamp));
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(entry);
    });
    return map;
  }, [allEntries]);

  const monthStats = useMemo(() => {
    const monthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
    let memoryCount = 0;
    let activeDays = 0;
    const moodCounts: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    
    entriesByDay.forEach((entries, dateKey) => {
      if (!dateKey.startsWith(monthPrefix)) return;
      memoryCount += entries.length;
      activeDays++;
      entries.forEach(e => {
        if (e.mood) moodCounts[e.mood] = (moodCounts[e.mood] || 0) + 1;
        if (e.topicTag) topicCounts[e.topicTag] = (topicCounts[e.topicTag] || 0) + 1;
      });
    });
    
    const topMoods = Object.entries(moodCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
      
    const topTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
    
    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    
    return { memoryCount, activeDays, daysInMonth, topMoods, topTopics };
  }, [entriesByDay, currentMonth]);

  const streakInfo = useMemo(() => {
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    
    let currentStreak = 0;
    let checkDate = new Date(today);
    
    if (!entriesByDay.has(todayKey)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    
    while (true) {
      const key = getLocalDateKey(checkDate);
      if (entriesByDay.has(key)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    
    let longestStreak = 0;
    let tempStreak = 0;
    const sortedDates = Array.from(entriesByDay.keys()).sort();
    
    for (let i = 0; i < sortedDates.length; i++) {
      if (i === 0) {
        tempStreak = 1;
      } else {
        const prevDate = new Date(sortedDates[i - 1] + 'T12:00:00');
        const currDate = new Date(sortedDates[i] + 'T12:00:00');
        const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
        } else {
          tempStreak = 1;
        }
      }
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    }
    
    return { currentStreak, longestStreak };
  }, [entriesByDay]);

  const handleDayClick = (date: Date, entries: LogEntry[]) => {
    setSelectedDate(date);
    setSelectedEntries(entries.sort((a, b) => 
      new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
    ));
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    setSelectedDate(null);
    setSelectedEntries([]);
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    setSelectedDate(null);
    setSelectedEntries([]);
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
    setSelectedDate(null);
    setSelectedEntries([]);
  };

  const selectedDateKey = selectedDate ? getLocalDateKey(selectedDate) : null;

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

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-500 flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Timeline</h2>
              <p className="text-sm text-muted-foreground">
                {totalCount} {totalCount === 1 ? "memory" : "memories"} across {entriesByDay.size} days
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{monthStats.memoryCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Memories this month</div>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-foreground">
              {monthStats.activeDays}<span className="text-sm text-muted-foreground font-normal">/{monthStats.daysInMonth}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Active days</div>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <Flame className="w-5 h-5 text-orange-400" />
              <span className="text-2xl font-bold text-foreground">{streakInfo.currentStreak}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Current streak</div>
          </div>
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-2xl font-bold text-foreground">{streakInfo.longestStreak}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Best streak</div>
          </div>
        </div>

        {monthStats.topMoods.length > 0 && (
          <div className="glass-card rounded-xl p-4">
            <div className="flex flex-wrap gap-4 justify-between">
              <div className="flex-1 min-w-[140px]">
                <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Brain className="w-3 h-3" />
                  Top moods this month
                </div>
                <div className="flex flex-wrap gap-2">
                  {monthStats.topMoods.map(([mood, count]) => {
                    const config = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
                    return (
                      <Badge key={mood} variant="outline" className={cn("text-xs", config.bgColor)}>
                        {config.emoji} {config.label} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </div>
              {monthStats.topTopics.length > 0 && (
                <div className="flex-1 min-w-[140px]">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Top topics this month</div>
                  <div className="flex flex-wrap gap-2">
                    {monthStats.topTopics.map(([topic, count]) => (
                      <Badge key={topic} variant="secondary" className="text-xs bg-primary/20 text-primary">
                        {topic} ({count})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {allEntries.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
            <p className="text-muted-foreground">Start recording memories to see your timeline</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPreviousMonth}
                data-testid="button-previous-month"
                aria-label="Previous month"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">
                  {currentMonth.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToToday}
                  data-testid="button-today"
                >
                  Today
                </Button>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={goToNextMonth}
                data-testid="button-next-month"
                aria-label="Next month"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <CalendarGrid
              entriesByDay={entriesByDay}
              currentMonth={currentMonth}
              onDayClick={handleDayClick}
              selectedDateKey={selectedDateKey}
            />

            {!loadedAll && (
              <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading memories... ({allEntries.length} of {totalCount})
              </div>
            )}

            {selectedDate && (
              <Card className="glass-card border-white/20">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                      <Calendar className="w-5 h-5 text-purple-500" />
                      {selectedDate.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <Badge variant="outline" className="ml-2">
                        {selectedEntries.length} {selectedEntries.length === 1 ? "memory" : "memories"}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={detailViewMode === "cards" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setDetailViewMode("cards")}
                        data-testid="button-detail-cards"
                        title="Card view"
                        aria-label="Switch to card view"
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={detailViewMode === "table" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setDetailViewMode("table")}
                        data-testid="button-detail-table"
                        title="Table view"
                        aria-label="Switch to table view"
                      >
                        <TableIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedEntries.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No memories recorded on this day</p>
                  ) : detailViewMode === "cards" ? (
                    <div className="space-y-3">
                      {selectedEntries.map((entry) => {
                        const mood = MOOD_CONFIG[entry.mood || "neutral"] || MOOD_CONFIG.neutral;
                        return (
                          <div
                            key={entry.id}
                            className={cn(
                              "p-4 rounded-xl border border-white/10",
                              mood.bgColor
                            )}
                            data-testid={`selected-entry-${entry.id}`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-xl">{mood.emoji}</span>
                              <div className="flex-1">
                                <p className="text-foreground">{entry.memoryText}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <Badge variant="outline" className="text-xs border-white/20">
                                    {new Date(entry.timestamp!).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </Badge>
                                  <Badge
                                    variant="secondary"
                                    className="text-xs bg-primary/20 text-primary border-primary/30"
                                  >
                                    {entry.topicTag}
                                  </Badge>
                                  <CalendarBadge
                                    title={entry.calendarEventTitle}
                                    attendees={entry.calendarEventAttendees}
                                  />
                                  <PeopleBadge people={entry.detectedPeople} />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden border border-white/10">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-white/10 hover:bg-white/5">
                            <TableHead className="text-muted-foreground">Time</TableHead>
                            <TableHead className="text-muted-foreground w-[40%]">Memory</TableHead>
                            <TableHead className="text-muted-foreground">Topic</TableHead>
                            <TableHead className="text-muted-foreground text-center">Mood</TableHead>
                            <TableHead className="text-muted-foreground text-center">People</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedEntries.map((entry) => (
                            <TableRow
                              key={entry.id}
                              className="border-white/10 hover:bg-white/5"
                              data-testid={`selected-row-${entry.id}`}
                            >
                              <TableCell className="text-muted-foreground">
                                {new Date(entry.timestamp!).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </TableCell>
                              <TableCell>
                                <p className="line-clamp-2">{entry.memoryText}</p>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  className="bg-primary/20 text-primary border-primary/30"
                                >
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
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
