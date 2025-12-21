import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Calendar, LayoutGrid, Table as TableIcon, Users, ChevronLeft, ChevronRight, Clock, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
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

interface CalendarGridProps {
  entries: LogEntry[];
  currentMonth: Date;
  onDayClick: (date: Date, entries: LogEntry[]) => void;
}

function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarGrid({ entries, currentMonth, onDayClick }: CalendarGridProps) {
  const entriesByDay = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    entries.forEach((entry) => {
      const dateKey = getLocalDateKey(new Date(entry.timestamp!));
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(entry);
    });
    return map;
  }, [entries]);

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

          return (
            <button
              key={day}
              onClick={() => {
                if (hasEntries) {
                  const clickedDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
                  onDayClick(clickedDate, dayEntries);
                }
              }}
              disabled={!hasEntries}
              className={cn(
                "aspect-square rounded-lg flex flex-col items-center justify-center p-1 transition-all relative",
                hasEntries 
                  ? "bg-purple-500/20 hover:bg-purple-500/30 cursor-pointer border border-purple-500/30" 
                  : "hover:bg-white/5",
                isToday && "ring-2 ring-primary"
              )}
              data-testid={`calendar-day-${day}`}
            >
              <span className={cn(
                "text-sm md:text-base font-medium",
                hasEntries ? "text-purple-400" : "text-muted-foreground"
              )}>
                {day}
              </span>
              {hasEntries && (
                <div className="flex gap-0.5 mt-0.5">
                  {dayEntries.slice(0, 3).map((entry, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-purple-400"
                    />
                  ))}
                  {dayEntries.length > 3 && (
                    <span className="text-[8px] text-purple-400">+{dayEntries.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Timeline() {
  const [filterMode, setFilterMode] = useState<"all" | "calendar">("all");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedEntries, setSelectedEntries] = useState<LogEntry[]>([]);
  const [detailViewMode, setDetailViewMode] = useState<"cards" | "table">("cards");
  
  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
  });

  const filteredEntries = useMemo(() => {
    if (filterMode === "calendar") {
      return logEntries.filter((entry) => entry.calendarEventId);
    }
    return logEntries;
  }, [logEntries, filterMode]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort(
      (a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime()
    );
  }, [filteredEntries]);

  const handleDayClick = (date: Date, entries: LogEntry[]) => {
    setSelectedDate(date);
    setSelectedEntries(entries);
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
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-500 flex items-center justify-center">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Timeline</h2>
                <p className="text-sm text-muted-foreground">
                  {filterMode === "all" ? "All memories" : "Calendar-linked memories"} ({filteredEntries.length} total)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1">
              <Button
                variant={filterMode === "all" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterMode("all")}
                data-testid="filter-all"
                className="text-xs"
              >
                <Filter className="w-3 h-3 mr-1" />
                All
              </Button>
              <Button
                variant={filterMode === "calendar" ? "default" : "ghost"}
                size="sm"
                onClick={() => setFilterMode("calendar")}
                data-testid="filter-calendar"
                className="text-xs"
              >
                <Calendar className="w-3 h-3 mr-1" />
                Calendar
              </Button>
            </div>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              {filterMode === "all" ? "No memories yet" : "No calendar-linked memories"}
            </h3>
            <p className="text-muted-foreground">
              {filterMode === "all" 
                ? "Start recording memories to see them here" 
                : "When you record memories during calendar events, they'll appear here"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-4 flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={goToPreviousMonth}
                data-testid="button-previous-month"
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
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <CalendarGrid
              entries={filteredEntries}
              currentMonth={currentMonth}
              onDayClick={handleDayClick}
            />

            {selectedDate && selectedEntries.length > 0 && (
              <Card className="glass-card border-white/20">
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <CardTitle className="flex items-center gap-2">
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
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={detailViewMode === "table" ? "default" : "outline"}
                        size="icon"
                        onClick={() => setDetailViewMode("table")}
                        data-testid="button-detail-table"
                        title="Table view"
                      >
                        <TableIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {detailViewMode === "cards" ? (
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
