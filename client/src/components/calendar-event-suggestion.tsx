import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Calendar, Check, X, Clock, MapPin, Users, Loader2, AlertCircle, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetectedEvent {
  detected: boolean;
  title?: string;
  startDateTime?: string;
  endDateTime?: string;
  attendees?: string[];
  location?: string;
  description?: string;
}

interface ActionPreference {
  actionType: string;
  policy: string;
}

interface CalendarEventSuggestionProps {
  memoryText: string;
  memoryId?: string;
  onDismiss: () => void;
  onCreated?: () => void;
}

export default function CalendarEventSuggestion({
  memoryText,
  memoryId,
  onDismiss,
  onCreated,
}: CalendarEventSuggestionProps) {
  const [dismissed, setDismissed] = useState(false);
  const [autoExecuted, setAutoExecuted] = useState(false);
  const autoExecuteTriggered = useRef(false);
  const queryClient = useQueryClient();

  const { data: calendarStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/calendar/status"],
  });

  const { data: actionPreferences } = useQuery<ActionPreference[]>({
    queryKey: ["/api/actions/preferences"],
  });

  const isAutoMode = actionPreferences?.find(
    (p) => p.actionType === "calendar.create"
  )?.policy === "auto";

  const detectMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/calendar/events/detect", {
        memoryText,
      });
      if (!response.ok) throw new Error("Failed to detect event");
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (event: DetectedEvent) => {
      const response = await apiRequest("POST", "/api/calendar/events/create", {
        title: event.title,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
        attendees: event.attendees,
        location: event.location,
        description: event.description,
        memoryId,
      });
      if (!response.ok) throw new Error("Failed to create event");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      if (data.data?.duplicate) {
        // Event already exists
      } else {
        onCreated?.();
      }
      setDismissed(true);
    },
  });

  useEffect(() => {
    // Trigger detection when component mounts or memoryText/calendar connection changes
    if (calendarStatus?.connected && memoryText) {
      // Reset any previous detection state before running new detection
      detectMutation.reset();
      autoExecuteTriggered.current = false;
      // Small delay to ensure reset completes
      const timer = setTimeout(() => {
        detectMutation.mutate();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [calendarStatus?.connected, memoryText]);

  // Auto-execute if policy is set to auto and event is detected
  useEffect(() => {
    const detectedEvent = detectMutation.data?.data as DetectedEvent | undefined;
    if (
      isAutoMode &&
      detectedEvent?.detected &&
      detectedEvent.title &&
      detectedEvent.startDateTime &&
      detectedEvent.endDateTime &&
      !autoExecuteTriggered.current &&
      !createMutation.isPending &&
      !createMutation.isSuccess
    ) {
      autoExecuteTriggered.current = true;
      setAutoExecuted(true);
      createMutation.mutate(detectedEvent);
    }
  }, [isAutoMode, detectMutation.data, createMutation.isPending, createMutation.isSuccess]);

  if (dismissed || !calendarStatus?.connected) {
    return null;
  }

  if (detectMutation.isPending) {
    return (
      <Card className="glass-card border-purple-500/30 mt-4 animate-fade-in">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
          <span className="text-sm text-muted-foreground">
            Checking for calendar events...
          </span>
        </CardContent>
      </Card>
    );
  }

  // Handle detection errors silently - just don't show the suggestion
  if (detectMutation.isError) {
    return null;
  }

  const detectedEvent = detectMutation.data?.data as DetectedEvent | undefined;

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const handleCreate = () => {
    if (detectedEvent && detectedEvent.title && detectedEvent.startDateTime && detectedEvent.endDateTime) {
      createMutation.mutate(detectedEvent);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  // Handle creation errors
  if (createMutation.isError) {
    return (
      <Card className="glass-card border-red-500/30 border-l-4 border-l-red-500 mt-4 animate-fade-in">
        <CardContent className="p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Could not add to calendar</p>
            <p className="text-xs text-muted-foreground">Please try again or add manually</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            data-testid="button-dismiss-error"
          >
            <X className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!detectedEvent?.detected) {
    return null;
  }

  if (createMutation.isSuccess) {
    const result = createMutation.data?.data;
    return (
      <Card className={cn(
        "mt-4 animate-fade-in border-l-4",
        result?.duplicate 
          ? "glass-card border-yellow-500/30 border-l-yellow-500" 
          : "glass-card border-green-500/30 border-l-green-500"
      )}>
        <CardContent className="p-4 flex items-center gap-3">
          {result?.duplicate ? (
            <>
              <AlertCircle className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="text-sm font-medium text-yellow-400">Event already exists</p>
                <p className="text-xs text-muted-foreground">
                  {result.existingEvent?.title}
                </p>
              </div>
            </>
          ) : (
            <>
              {autoExecuted ? (
                <Zap className="w-5 h-5 text-green-400" />
              ) : (
                <Check className="w-5 h-5 text-green-400" />
              )}
              <div>
                <p className="text-sm font-medium text-green-400">
                  {autoExecuted ? "Auto-added to calendar" : "Added to calendar"}
                </p>
                <p className="text-xs text-muted-foreground">{result?.event?.title}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-purple-500/30 border-l-4 border-l-purple-500 mt-4 animate-fade-in">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-purple-400 mb-1">
              Add to Calendar?
            </p>
            <p className="text-base font-semibold text-foreground mb-2">
              {detectedEvent.title}
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {detectedEvent.startDateTime && (
                <Badge variant="outline" className="text-xs border-white/20">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDateTime(detectedEvent.startDateTime)}
                </Badge>
              )}
              {detectedEvent.location && (
                <Badge variant="outline" className="text-xs border-white/20">
                  <MapPin className="w-3 h-3 mr-1" />
                  {detectedEvent.location}
                </Badge>
              )}
              {detectedEvent.attendees && detectedEvent.attendees.length > 0 && (
                <Badge variant="outline" className="text-xs border-white/20">
                  <Users className="w-3 h-3 mr-1" />
                  {detectedEvent.attendees.join(", ")}
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="bg-purple-500 hover:bg-purple-600"
                data-testid="button-add-to-calendar"
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                ) : (
                  <Check className="w-4 h-4 mr-1" />
                )}
                Add to Calendar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                disabled={createMutation.isPending}
                data-testid="button-dismiss-calendar"
              >
                <X className="w-4 h-4 mr-1" />
                Skip
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
