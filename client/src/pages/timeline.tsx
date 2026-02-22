import AppLayout from "@/components/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Calendar, Users, ChevronLeft, ChevronRight, Clock, Flame, TrendingUp, Brain, Loader2, X, MessageCircle, CalendarDays, BookOpen, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface DayMessage {
  id: string;
  body: string | null;
  senderName: string | null;
  direction: string;
  timestamp: string;
  conversationId: string;
  mood: string | null;
}

interface DayDetailModalProps {
  open: boolean;
  onClose: () => void;
  date: Date;
  entries: LogEntry[];
  dateKey: string;
}

function DayDetailModal({ open, onClose, date, entries, dateKey }: DayDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"memories" | "messages">("memories");

  useEffect(() => {
    if (open) setActiveTab("memories");
  }, [dateKey, open]);

  const { data: messagesData, isLoading: messagesLoading } = useQuery<{ status: string; data: DayMessage[] }>({
    queryKey: ["/api/messages/by-date", dateKey],
    queryFn: async () => {
      const response = await fetch(`/api/messages/by-date?date=${dateKey}`, { credentials: "include" });
      if (!response.ok) return { status: 'success', data: [] };
      return response.json();
    },
    enabled: open && activeTab === "messages",
    staleTime: 1000 * 60 * 5,
  });

  const dayMessages = messagesData?.data || [];

  const calendarEvents = useMemo(() => {
    const events: { title: string; attendees?: string[] }[] = [];
    const seen = new Set<string>();
    entries.forEach(entry => {
      if (entry.calendarEventTitle && !seen.has(entry.calendarEventTitle)) {
        seen.add(entry.calendarEventTitle);
        events.push({
          title: entry.calendarEventTitle,
          attendees: entry.calendarEventAttendees || undefined,
        });
      }
    });
    return events;
  }, [entries]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => 
      new Date(a.timestamp!).getTime() - new Date(b.timestamp!).getTime()
    );
  }, [entries]);

  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base pr-6">
            <CalendarDays className="w-5 h-5 text-purple-400 flex-shrink-0" />
            <span className="truncate">{formattedDate}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            View memories and messages for {formattedDate}
          </DialogDescription>
        </DialogHeader>

        <div className="flex border-b flex-shrink-0">
          <button
            onClick={() => setActiveTab("memories")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === "memories"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <BookOpen className="w-4 h-4" />
            Memories
            {entries.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{entries.length}</Badge>
            )}
          </button>
          <button
            onClick={() => setActiveTab("messages")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
              activeTab === "messages"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="w-4 h-4" />
            Messages
            {dayMessages.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{dayMessages.length}</Badge>
            )}
          </button>
        </div>

        {calendarEvents.length > 0 && (
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
            <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Calendar Events
            </div>
            <div className="flex flex-wrap gap-2">
              {calendarEvents.map((event, i) => (
                <TooltipProvider key={i}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 cursor-default">
                        <Calendar className="w-3 h-3 mr-1" />
                        {event.title.length > 30 ? event.title.substring(0, 30) + "..." : event.title}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{event.title}</p>
                      {event.attendees && event.attendees.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.attendees.slice(0, 3).join(", ")}
                          {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "memories" && (
            <>
              {sortedEntries.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No memories on this day</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedEntries.map((entry) => {
                    const mood = MOOD_CONFIG[entry.mood || "neutral"] || MOOD_CONFIG.neutral;
                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "p-3 rounded-xl border border-white/10 transition-colors hover:border-white/20",
                          mood.bgColor
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-lg flex-shrink-0 mt-0.5">{mood.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground leading-relaxed">{entry.memoryText}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp!).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-5 bg-primary/20 text-primary border-primary/30"
                              >
                                {entry.topicTag}
                              </Badge>
                              {entry.detectedPeople && entry.detectedPeople.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-5 bg-sky-500/10 text-sky-400 border-sky-500/30"
                                >
                                  <Users className="w-3 h-3 mr-0.5" />
                                  {entry.detectedPeople.join(", ")}
                                </Badge>
                              )}
                              {entry.importance && entry.importance >= 8 && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-5 bg-amber-500/10 text-amber-400 border-amber-500/30"
                                >
                                  Important
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === "messages" && (
            <>
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : dayMessages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No messages on this day</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "sent" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl px-3 py-2",
                          msg.direction === "sent"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        {msg.direction !== "sent" && msg.senderName && (
                          <p className={cn(
                            "text-[10px] font-medium mb-0.5",
                            msg.direction === "sent" ? "text-primary-foreground/70" : "text-muted-foreground"
                          )}>
                            {msg.senderName}
                          </p>
                        )}
                        <p className="text-sm">{msg.body || "(no content)"}</p>
                        <p className={cn(
                          "text-[10px] mt-1",
                          msg.direction === "sent" ? "text-primary-foreground/60" : "text-muted-foreground"
                        )}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CalendarGridProps {
  entriesByDay: Map<string, LogEntry[]>;
  currentMonth: Date;
  onDayClick: (date: Date, entries: LogEntry[], dateKey: string) => void;
}

function CalendarGrid({ entriesByDay, currentMonth, onDayClick }: CalendarGridProps) {
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

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day);
  }

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const maxEntriesInDay = useMemo(() => {
    let max = 0;
    const monthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
    entriesByDay.forEach((entries, key) => {
      if (key.startsWith(monthPrefix) && entries.length > max) max = entries.length;
    });
    return max;
  }, [entriesByDay, currentMonth]);

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
          <div key={day} className="text-center text-xs md:text-sm font-medium text-muted-foreground py-2">
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

          return (
            <button
              key={day}
              onClick={() => {
                const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                onDayClick(clickedDate, dayEntries, dateKey);
              }}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center p-1 transition-all relative border",
                hasEntries 
                  ? cn(getIntensityClass(dayEntries.length), "hover:brightness-125 cursor-pointer")
                  : "border-transparent hover:bg-white/5 cursor-pointer",
                isToday && "ring-2 ring-primary"
              )}
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
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEntries, setSelectedEntries] = useState<LogEntry[]>([]);
  const [selectedDateKey, setSelectedDateKey] = useState("");
  
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

  const handleDayClick = (date: Date, entries: LogEntry[], dateKey: string) => {
    setSelectedDate(date);
    setSelectedEntries(entries);
    setSelectedDateKey(dateKey);
    setModalOpen(true);
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

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
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth} aria-label="Previous month">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">
                  {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </h3>
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Today
                </Button>
              </div>
              <Button variant="ghost" size="icon" onClick={goToNextMonth} aria-label="Next month">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <CalendarGrid
              entriesByDay={entriesByDay}
              currentMonth={currentMonth}
              onDayClick={handleDayClick}
            />

            {!loadedAll && (
              <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-2 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading memories... ({allEntries.length} of {totalCount})
              </div>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Tap any date to see your memories and messages for that day
            </p>
          </div>
        )}

        <DayDetailModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          date={selectedDate}
          entries={selectedEntries}
          dateKey={selectedDateKey}
        />
      </div>
    </AppLayout>
  );
}
