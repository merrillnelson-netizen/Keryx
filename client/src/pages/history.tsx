import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Edit2, Trash2, ChevronDown, ChevronUp, LayoutGrid, Table as TableIcon, Users, MapPin, Calendar, Brain, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Category } from "@shared/schema";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const MOOD_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  happy: { emoji: "😊", color: "bg-green-500/20 text-green-400 border-green-500/30", label: "Happy" },
  sad: { emoji: "😢", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", label: "Sad" },
  anxious: { emoji: "😰", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", label: "Anxious" },
  excited: { emoji: "🎉", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", label: "Excited" },
  neutral: { emoji: "😐", color: "bg-gray-500/20 text-gray-400 border-gray-500/30", label: "Neutral" },
  frustrated: { emoji: "😤", color: "bg-red-500/20 text-red-400 border-red-500/30", label: "Frustrated" },
  hopeful: { emoji: "🌟", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", label: "Hopeful" },
  grateful: { emoji: "🙏", color: "bg-pink-500/20 text-pink-400 border-pink-500/30", label: "Grateful" },
  stressed: { emoji: "😫", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", label: "Stressed" },
  peaceful: { emoji: "😌", color: "bg-teal-500/20 text-teal-400 border-teal-500/30", label: "Peaceful" },
  angry: { emoji: "😠", color: "bg-red-600/20 text-red-500 border-red-600/30", label: "Angry" },
  confused: { emoji: "😕", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", label: "Confused" },
  proud: { emoji: "😊", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", label: "Proud" },
  nostalgic: { emoji: "🥹", color: "bg-violet-500/20 text-violet-400 border-violet-500/30", label: "Nostalgic" },
  motivated: { emoji: "💪", color: "bg-lime-500/20 text-lime-400 border-lime-500/30", label: "Motivated" },
};

function formatMetadataValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(v => String(v)).join(', ');
  } else if (value !== null && value !== undefined) {
    return String(value);
  }
  return 'N/A';
}

function MetadataDetails({ metadataJson }: { metadataJson: unknown }) {
  if (!metadataJson || typeof metadataJson !== 'object') return null;
  const entries = Object.entries(metadataJson as Record<string, unknown>);
  if (entries.length === 0) return null;
  
  return (
    <div className="border-t border-white/10 pt-3">
      <h4 className="text-sm font-medium text-foreground mb-2">Extracted Details</h4>
      <div className="glass-card p-3 rounded-lg">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start gap-2 mb-1 last:mb-0">
            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[80px]">
              {key.replace(/_/g, ' ')}:
            </span>
            <span className="text-sm text-foreground">
              {formatMetadataValue(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIReasoningLog({ aiReasoning }: { aiReasoning: unknown }) {
  if (!aiReasoning || typeof aiReasoning !== 'object') return null;
  const reasoning = aiReasoning as Record<string, string>;
  if (!reasoning.topic && !reasoning.mood && !reasoning.people && !reasoning.calendar) return null;
  
  return (
    <div className="border-t border-white/10 pt-3 mt-3">
      <h4 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
        <Brain className="w-4 h-4 text-purple-400" />
        AI Decision Log
      </h4>
      <div className="glass-card p-3 rounded-lg space-y-2 text-sm">
        {reasoning.topic && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[70px]">Topic:</span>
            <span className="text-foreground">{reasoning.topic}</span>
          </div>
        )}
        {reasoning.mood && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[70px]">Mood:</span>
            <span className="text-foreground">{reasoning.mood}</span>
          </div>
        )}
        {reasoning.people && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[70px]">People:</span>
            <span className="text-foreground">{reasoning.people}</span>
          </div>
        )}
        {reasoning.calendar && (
          <div className="flex items-start gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[70px]">Calendar:</span>
            <span className="text-foreground">{reasoning.calendar}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MoodBadge({ mood, score }: { mood?: string | null; score?: number | null }) {
  if (!mood) return null;
  const config = MOOD_CONFIG[mood] || MOOD_CONFIG.neutral;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn("cursor-default text-xs", config.color)}
            data-testid="mood-badge"
          >
            <span className="mr-1">{config.emoji}</span>
            {config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Mood: {config.label}</p>
          {score !== null && score !== undefined && (
            <p className="text-xs text-muted-foreground">Sentiment score: {score}</p>
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
            data-testid="people-badge"
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

function LocationBadge({ lat, lng, placeName }: { lat?: number | null; lng?: number | null; placeName?: string | null }) {
  if (!lat || !lng) return null;
  
  const displayText = placeName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <a 
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge 
              variant="outline" 
              className="cursor-pointer text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
              data-testid="location-badge"
            >
              <MapPin className="w-3 h-3 mr-1" />
              {placeName ? placeName.substring(0, 20) + (placeName.length > 20 ? '...' : '') : 'Location'}
            </Badge>
          </a>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Location</p>
          <p className="text-sm">{displayText}</p>
          <p className="text-xs text-muted-foreground">Click to open in Maps</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CalendarBadge({ eventTitle, attendees }: { eventTitle?: string | null; attendees?: string[] | null }) {
  if (!eventTitle) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className="cursor-default text-xs bg-purple-500/20 text-purple-400 border-purple-500/30"
            data-testid="calendar-badge"
          >
            <Calendar className="w-3 h-3 mr-1" />
            {eventTitle.substring(0, 15) + (eventTitle.length > 15 ? '...' : '')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">Linked Meeting</p>
          <p className="text-sm">{eventTitle}</p>
          {attendees && attendees.length > 0 && (
            <>
              <p className="font-medium mt-1">Attendees:</p>
              <ul className="text-xs">
                {attendees.slice(0, 5).map((name, i) => (
                  <li key={i}>{name}</li>
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

export default function History() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editMetadata, setEditMetadata] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [quickEditCategoryId, setQuickEditCategoryId] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const PAGE_SIZE = 30;
  
  interface LogsResponse {
    status: string;
    data: LogEntry[];
    count: number;
    total?: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  }

  const {
    data: paginatedData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery<LogsResponse>({
    queryKey: ["/api/logs", "paginated"],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/logs?limit=${PAGE_SIZE}&offset=${pageParam}`);
      if (!response.ok) throw new Error("Failed to fetch logs");
      return response.json();
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.hasMore) {
        return lastPage.offset + lastPage.limit;
      }
      return undefined;
    },
    initialPageParam: 0,
  });
  
  const logEntries = useMemo(() => {
    return paginatedData?.pages.flatMap(page => page.data) || [];
  }, [paginatedData]);
  
  const totalCount = paginatedData?.pages[0]?.total;

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/logs/${id}`, {});
      if (!response.ok) {
        throw new Error("Failed to delete memory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs", "paginated"] });
      toast({
        title: "Memory deleted",
        description: "Memory has been successfully deleted",
      });
      setDeletingId(null);
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete memory. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LogEntry> }) => {
      const response = await apiRequest("PATCH", `/api/logs/${id}`, data);
      if (!response.ok) {
        throw new Error("Failed to update memory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs", "paginated"] });
      toast({
        title: "Memory updated",
        description: "Memory has been successfully updated",
      });
      setEditingEntry(null);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update memory. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ id, topicTag }: { id: string; topicTag: string }) => {
      const response = await apiRequest("PATCH", `/api/memories/${id}`, { topicTag });
      if (!response.ok) {
        throw new Error("Failed to update category");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs", "paginated"] });
      toast({
        title: "Category updated",
        description: "Memory category has been successfully changed",
      });
      setQuickEditCategoryId(null);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update category. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (entry: LogEntry) => {
    setEditingEntry(entry);
    setEditText(entry.memoryText);
    setEditTopic(entry.topicTag || "");
    setEditMetadata(entry.metadataJson ? JSON.stringify(entry.metadataJson, null, 2) : "");
  };

  const handleSaveEdit = () => {
    if (editingEntry) {
      try {
        // Parse metadata or use empty object (never null - DB constraint)
        const metadata = editMetadata ? JSON.parse(editMetadata) : {};
        updateMutation.mutate({
          id: editingEntry.id,
          data: {
            memoryText: editText,
            topicTag: editTopic || undefined,
            metadataJson: metadata,
          },
        });
      } catch (error) {
        toast({
          title: "Invalid JSON",
          description: `Please check your metadata format: ${error instanceof Error ? error.message : "Unknown error"}`,
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading memories...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Memory History</h2>
                <p className="text-sm text-muted-foreground">All your saved memories</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "h-9 w-9 p-0 transition-all",
                  viewMode === "cards" 
                    ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
                data-testid="button-view-cards"
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setViewMode("table")}
                className={cn(
                  "h-9 w-9 p-0 transition-all",
                  viewMode === "table" 
                    ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                )}
                data-testid="button-view-table"
              >
                <TableIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Memories List - Scrollable Container */}
        {!logEntries || logEntries.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
            <p className="text-muted-foreground">Start logging memories to see your activity here</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="max-h-[calc(100vh-250px)] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-[110px] text-foreground font-semibold">Date</TableHead>
                    <TableHead className="w-[110px] text-foreground font-semibold">Topic</TableHead>
                    <TableHead className="w-[80px] text-foreground font-semibold">Mood</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Location</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Meeting</TableHead>
                    <TableHead className="min-w-[300px] text-foreground font-semibold">Memory</TableHead>
                    <TableHead className="w-[90px] text-right text-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logEntries.map((entry) => (
                    <TableRow 
                      key={entry.id} 
                      data-testid={`memory-row-${entry.id}`}
                      className="border-white/10 hover:bg-white/5 transition-colors"
                    >
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap" data-testid={`date-cell-${entry.id}`}>
                        {new Date(entry.timestamp!).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`topic-cell-${entry.id}`}>
                        {quickEditCategoryId === entry.id ? (
                          <div className="inline-block" onClick={(e) => e.stopPropagation()}>
                            <Select 
                              value={entry.topicTag || 'General'} 
                              onValueChange={(value) => {
                                updateCategoryMutation.mutate({ id: entry.id, topicTag: value });
                              }}
                            >
                              <SelectTrigger 
                                className="h-7 w-auto min-w-[120px] text-xs border-primary/30 bg-primary/20"
                                data-testid={`category-editor-table-${entry.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="glass-card border-primary/20">
                                {categories.map((category) => (
                                  <SelectItem 
                                    key={category.id} 
                                    value={category.name}
                                    data-testid={`quick-option-table-${entry.id}-${category.name.toLowerCase()}`}
                                  >
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <Badge 
                            variant="secondary" 
                            className="bg-primary/20 text-primary border-primary/30 text-xs cursor-pointer hover:bg-primary/30 transition-colors"
                            onClick={() => setQuickEditCategoryId(entry.id)}
                            title="Click to change category"
                          >
                            {entry.topicTag || "General"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`mood-cell-${entry.id}`}>
                        <MoodBadge mood={entry.mood} score={entry.moodScore} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`location-cell-${entry.id}`}>
                        <LocationBadge lat={entry.geoLat} lng={entry.geoLng} placeName={entry.geoPlaceName} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap" data-testid={`calendar-cell-${entry.id}`}>
                        <CalendarBadge eventTitle={entry.calendarEventTitle} attendees={entry.calendarEventAttendees} />
                      </TableCell>
                      <TableCell className="font-medium text-foreground" data-testid={`memory-cell-${entry.id}`}>
                        {entry.memoryText}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(entry)}
                            className="h-8 w-8 p-0 hover:bg-white/10"
                            data-testid={`edit-button-${entry.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(entry.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                            data-testid={`delete-button-${entry.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {/* Load More button for table view */}
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="border-primary/30 hover:bg-primary/20"
                    data-testid="button-load-more-table"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      `Load More ${totalCount ? `(${logEntries.length} of ${totalCount})` : ''}`
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
            <div className="flex flex-col space-y-4">
              {logEntries.map((entry) => (
                <Card key={entry.id} data-testid={`memory-card-${entry.id}`} className="glass-card border-white/20 overflow-hidden hover:shadow-xl transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {quickEditCategoryId === entry.id ? (
                          <div className="inline-block" onClick={(e) => e.stopPropagation()}>
                            <Select 
                              value={entry.topicTag || 'General'} 
                              onValueChange={(value) => {
                                updateCategoryMutation.mutate({ id: entry.id, topicTag: value });
                              }}
                            >
                              <SelectTrigger 
                                className="h-7 w-auto min-w-[120px] text-xs border-primary/30 bg-primary/20"
                                data-testid={`category-editor-${entry.id}`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="glass-card border-primary/20">
                                {categories.map((category) => (
                                  <SelectItem 
                                    key={category.id} 
                                    value={category.name}
                                    data-testid={`quick-option-${entry.id}-${category.name.toLowerCase()}`}
                                  >
                                    {category.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <Badge 
                            variant="secondary" 
                            data-testid={`topic-badge-${entry.id}`} 
                            className="bg-primary/20 text-primary border-primary/30 cursor-pointer hover:bg-primary/30 transition-colors"
                            onClick={() => setQuickEditCategoryId(entry.id)}
                            title="Click to change category"
                          >
                            {entry.topicTag || 'General'}
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`date-badge-${entry.id}`} className="border-white/20">
                          {new Date(entry.timestamp!).toLocaleDateString()}
                        </Badge>
                        <MoodBadge mood={entry.mood} score={entry.moodScore} />
                        <PeopleBadge people={entry.detectedPeople} />
                        <LocationBadge lat={entry.geoLat} lng={entry.geoLng} placeName={entry.geoPlaceName} />
                        <CalendarBadge eventTitle={entry.calendarEventTitle} attendees={entry.calendarEventAttendees} />
                      </div>
                      <CardTitle className="text-base font-normal text-foreground" data-testid={`memory-text-${entry.id}`}>
                        {entry.memoryText}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(entry)}
                        className="h-8 w-8 p-0 hover:bg-white/10"
                        data-testid={`edit-button-${entry.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(entry.id)}
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`delete-button-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="h-8 w-8 p-0 hover:bg-white/10"
                        data-testid={`expand-button-${entry.id}`}
                      >
                        {expandedId === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {expandedId === entry.id && (
                  <CardContent className="pt-0 animate-slide-in" data-testid={`metadata-details-${entry.id}`}>
                    {/* Extracted metadata details */}
                    <MetadataDetails metadataJson={entry.metadataJson} />
                    
                    {/* AI Decision Log - transparency about AI reasoning */}
                    <AIReasoningLog aiReasoning={entry.aiReasoning} />
                    
                    <p className="text-xs text-muted-foreground mt-3">
                      Saved {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </CardContent>
                )}
              </Card>
              ))}
              
              {/* Load More button for pagination */}
              {hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="border-primary/30 hover:bg-primary/20"
                    data-testid="button-load-more"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      `Load More ${totalCount ? `(${logEntries.length} of ${totalCount})` : ''}`
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent data-testid="edit-dialog" className="glass-card-strong border-white/20">
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>
              Make changes to your memory. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="edit-topic">Category</Label>
              <Select value={editTopic} onValueChange={setEditTopic}>
                <SelectTrigger 
                  id="edit-topic"
                  className="glass-card border-white/20"
                  data-testid="select-edit-category"
                >
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="glass-card border-primary/20">
                  {categories.map((category) => (
                    <SelectItem 
                      key={category.id} 
                      value={category.name}
                      data-testid={`option-edit-category-${category.name.toLowerCase()}`}
                    >
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-text">Memory Text</Label>
              <Textarea
                id="edit-text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Enter memory text..."
                className="min-h-[100px] glass-card border-white/20"
                data-testid="input-edit-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-metadata">Metadata (JSON)</Label>
              <Textarea
                id="edit-metadata"
                value={editMetadata}
                onChange={(e) => setEditMetadata(e.target.value)}
                placeholder='{"key": "value"}'
                className="min-h-[120px] font-mono text-sm glass-card border-white/20"
                data-testid="input-edit-metadata"
              />
              <p className="text-xs text-muted-foreground">Optional: Edit the AI-extracted metadata in JSON format</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEntry(null)}
              data-testid="button-cancel-edit"
              className="border-white/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent data-testid="delete-dialog" className="glass-card-strong border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete" className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
