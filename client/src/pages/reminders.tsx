import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Bell,
  Plus,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Loader2,
  AlarmClock,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { format, formatDistanceToNow, isPast, addMinutes, addHours, addDays } from "date-fns";

interface Reminder {
  id: string;
  userId: string;
  content: string;
  triggerType: string;
  triggerTime: string | null;
  triggerLocationName: string | null;
  triggerLocationId: string | null;
  status: string;
  snoozedUntil: string | null;
  snoozeCount: number | null;
  sourceMemoryId: string | null;
  triggeredAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "Pending", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Clock },
  triggered: { label: "Due Now", color: "bg-orange-500/10 text-orange-500 border-orange-500/20", icon: AlarmClock },
  snoozed: { label: "Snoozed", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: RotateCcw },
  completed: { label: "Completed", color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
  dismissed: { label: "Dismissed", color: "bg-gray-500/10 text-gray-500 border-gray-500/20", icon: XCircle },
};

function ReminderCard({ 
  reminder, 
  onComplete, 
  onSnooze, 
  onDismiss,
  onDelete,
  isUpdating 
}: { 
  reminder: Reminder; 
  onComplete: () => void;
  onSnooze: (minutes: number) => void;
  onDismiss: () => void;
  onDelete: () => void;
  isUpdating: boolean;
}) {
  const status = statusConfig[reminder.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const isOverdue = reminder.triggerTime && isPast(new Date(reminder.triggerTime)) && reminder.status === 'pending';
  const isDue = reminder.status === 'triggered' || isOverdue;

  return (
    <Card className={`border-border/50 bg-card/50 backdrop-blur-sm ${isDue ? 'ring-2 ring-orange-500/50' : ''}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
              reminder.triggerType === 'location' ? 'bg-purple-500/10' : 'bg-primary/10'
            }`}>
              {reminder.triggerType === 'location' ? (
                <MapPin className="w-5 h-5 text-purple-500" />
              ) : (
                <Bell className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-medium">{reminder.content}</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className={status.color}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {reminder.triggerType === 'time' && reminder.triggerTime && (
              <div className={`flex items-center gap-1 ${isOverdue ? 'text-orange-500 font-medium' : ''}`}>
                <Clock className="w-4 h-4" />
                <span>
                  {isOverdue 
                    ? `Overdue (${formatDistanceToNow(new Date(reminder.triggerTime), { addSuffix: true })})`
                    : format(new Date(reminder.triggerTime), 'MMM d, yyyy h:mm a')
                  }
                </span>
              </div>
            )}
            {reminder.triggerType === 'location' && reminder.triggerLocationName && (
              <div className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                <span>When at {reminder.triggerLocationName}</span>
              </div>
            )}
          </div>

          {reminder.snoozedUntil && reminder.status === 'snoozed' && (
            <div className="text-xs text-yellow-600 dark:text-yellow-400">
              Snoozed until {format(new Date(reminder.snoozedUntil), 'h:mm a')}
              {reminder.snoozeCount && reminder.snoozeCount > 1 && ` (${reminder.snoozeCount}x)`}
            </div>
          )}

          {(reminder.status === 'pending' || reminder.status === 'triggered' || reminder.status === 'snoozed') && (
            <div className="flex flex-wrap gap-2 pt-2">
              <Button 
                size="sm" 
                onClick={onComplete}
                disabled={isUpdating}
                className="gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Done
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onSnooze(30)}
                disabled={isUpdating}
                className="gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                30m
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => onSnooze(60)}
                disabled={isUpdating}
                className="gap-1"
              >
                <RotateCcw className="w-4 h-4" />
                1h
              </Button>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onDismiss}
                disabled={isUpdating}
                className="gap-1 text-muted-foreground"
              >
                <XCircle className="w-4 h-4" />
                Dismiss
              </Button>
            </div>
          )}

          {(reminder.status === 'completed' || reminder.status === 'dismissed') && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {reminder.status === 'completed' && reminder.completedAt && 
                  `Completed ${formatDistanceToNow(new Date(reminder.completedAt), { addSuffix: true })}`
                }
              </span>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={onDelete}
                disabled={isUpdating}
                className="gap-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RemindersPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("active");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);
  
  const [newReminder, setNewReminder] = useState({
    content: "",
    triggerType: "time" as "time" | "location",
    triggerTime: "",
    triggerLocationName: "",
  });

  const { data: reminders = [], isLoading } = useQuery<Reminder[]>({
    queryKey: ['/api/reminders'],
    staleTime: 60000,
  });

  const checkDueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reminders/check-due");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.count > 0) {
        queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
        toast({
          title: "Reminders triggered",
          description: `${data.count} reminder(s) are now due`,
        });
      }
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newReminder) => {
      const payload: any = {
        content: data.content,
        triggerType: data.triggerType,
      };
      if (data.triggerType === 'time' && data.triggerTime) {
        payload.triggerTime = new Date(data.triggerTime).toISOString();
      }
      if (data.triggerType === 'location' && data.triggerLocationName) {
        payload.triggerLocationName = data.triggerLocationName;
      }
      const res = await apiRequest("POST", "/api/reminders", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setIsCreateOpen(false);
      setNewReminder({ content: "", triggerType: "time", triggerTime: "", triggerLocationName: "" });
      toast({ title: "Reminder created", description: "Your reminder has been set" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create reminder", variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/reminders/${id}/complete`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      toast({ title: "Completed", description: "Reminder marked as done" });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async ({ id, minutes }: { id: string; minutes: number }) => {
      const res = await apiRequest("POST", `/api/reminders/${id}/snooze`, { minutes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      toast({ title: "Snoozed", description: "Reminder snoozed" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/reminders/${id}/dismiss`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      toast({ title: "Dismissed", description: "Reminder dismissed" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/reminders/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setDeleteReminderId(null);
      toast({ title: "Deleted", description: "Reminder deleted" });
    },
  });

  const activeReminders = reminders.filter(r => 
    ['pending', 'triggered', 'snoozed'].includes(r.status)
  ).sort((a, b) => {
    if (a.status === 'triggered' && b.status !== 'triggered') return -1;
    if (b.status === 'triggered' && a.status !== 'triggered') return 1;
    if (a.triggerTime && b.triggerTime) {
      return new Date(a.triggerTime).getTime() - new Date(b.triggerTime).getTime();
    }
    return 0;
  });

  const completedReminders = reminders.filter(r => 
    ['completed', 'dismissed'].includes(r.status)
  );

  const isUpdating = completeMutation.isPending || snoozeMutation.isPending || 
                     dismissMutation.isPending || deleteMutation.isPending;

  const getDefaultDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    now.setSeconds(0);
    now.setMilliseconds(0);
    return format(now, "yyyy-MM-dd'T'HH:mm");
  };

  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bell className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Reminders</h1>
              <p className="text-muted-foreground text-sm">
                Never forget important tasks
              </p>
            </div>
          </div>
          <Button onClick={() => {
            setNewReminder(prev => ({ ...prev, triggerTime: getDefaultDateTime() }));
            setIsCreateOpen(true);
          }} className="gap-2">
            <Plus className="w-4 h-4" />
            New Reminder
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="active" className="gap-2">
              <Clock className="w-4 h-4" />
              Active ({activeReminders.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle2 className="w-4 h-4" />
              History ({completedReminders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : activeReminders.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Bell className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No active reminders</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create a reminder or say "remind me to..." when logging a memory
                  </p>
                  <Button onClick={() => {
                    setNewReminder(prev => ({ ...prev, triggerTime: getDefaultDateTime() }));
                    setIsCreateOpen(true);
                  }} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Reminder
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {activeReminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onComplete={() => completeMutation.mutate(reminder.id)}
                    onSnooze={(minutes) => snoozeMutation.mutate({ id: reminder.id, minutes })}
                    onDismiss={() => dismissMutation.mutate(reminder.id)}
                    onDelete={() => setDeleteReminderId(reminder.id)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedReminders.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No completed reminders</h3>
                  <p className="text-muted-foreground text-center">
                    Completed and dismissed reminders will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {completedReminders.map((reminder) => (
                  <ReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onComplete={() => {}}
                    onSnooze={() => {}}
                    onDismiss={() => {}}
                    onDelete={() => setDeleteReminderId(reminder.id)}
                    isUpdating={isUpdating}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Reminder</DialogTitle>
              <DialogDescription>Set up a new time-based or location-based reminder.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="content">What do you need to remember?</Label>
                <Input
                  id="content"
                  placeholder="e.g., Call the dentist"
                  value={newReminder.content}
                  onChange={(e) => setNewReminder(prev => ({ ...prev, content: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label>When should I remind you?</Label>
                <RadioGroup
                  value={newReminder.triggerType}
                  onValueChange={(v) => setNewReminder(prev => ({ ...prev, triggerType: v as "time" | "location" }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="time" id="time" />
                    <Label htmlFor="time" className="flex items-center gap-1 cursor-pointer">
                      <Clock className="w-4 h-4" /> At a time
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="location" id="location" />
                    <Label htmlFor="location" className="flex items-center gap-1 cursor-pointer">
                      <MapPin className="w-4 h-4" /> At a place
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {newReminder.triggerType === 'time' && (
                <div className="space-y-2">
                  <Label htmlFor="triggerTime">Date & Time</Label>
                  <Input
                    id="triggerTime"
                    type="datetime-local"
                    value={newReminder.triggerTime}
                    onChange={(e) => setNewReminder(prev => ({ ...prev, triggerTime: e.target.value }))}
                  />
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setNewReminder(prev => ({ 
                        ...prev, 
                        triggerTime: format(addMinutes(new Date(), 30), "yyyy-MM-dd'T'HH:mm")
                      }))}
                    >
                      30 min
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setNewReminder(prev => ({ 
                        ...prev, 
                        triggerTime: format(addHours(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
                      }))}
                    >
                      1 hour
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => setNewReminder(prev => ({ 
                        ...prev, 
                        triggerTime: format(addDays(new Date(), 1), "yyyy-MM-dd'T'HH:mm")
                      }))}
                    >
                      Tomorrow
                    </Button>
                  </div>
                </div>
              )}

              {newReminder.triggerType === 'location' && (
                <div className="space-y-2">
                  <Label htmlFor="triggerLocation">Location name</Label>
                  <Input
                    id="triggerLocation"
                    placeholder="e.g., gym, grocery store, office"
                    value={newReminder.triggerLocationName}
                    onChange={(e) => setNewReminder(prev => ({ ...prev, triggerLocationName: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Reminder will trigger when you log a memory at this location
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createMutation.mutate(newReminder)}
                disabled={!newReminder.content || createMutation.isPending || 
                  (newReminder.triggerType === 'time' && !newReminder.triggerTime) ||
                  (newReminder.triggerType === 'location' && !newReminder.triggerLocationName)
                }
              >
                {createMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                Create Reminder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={!!deleteReminderId} onOpenChange={() => setDeleteReminderId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Reminder?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This reminder will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteReminderId && deleteMutation.mutate(deleteReminderId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
