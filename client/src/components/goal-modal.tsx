import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Target,
  Loader2,
  Sparkles,
  Trash2,
  Plus,
  Calendar,
  TrendingUp,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Wand2,
  Save,
} from "lucide-react";
import { format } from "date-fns";

interface GoalMilestone {
  id: string;
  title: string;
  isCompleted: boolean;
  completedAt?: string;
  order: number;
}

interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  progressPercent: number;
  status: string;
  milestones: GoalMilestone[];
  aiSummary: string | null;
  aiLastAnalyzed: string | null;
  relatedMemoryIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface GoalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalId: string | null;
  isCreating: boolean;
  onCreateGoal: (data: { title: string; description?: string; targetDate?: string }) => void;
  isCreatePending: boolean;
}

const statusOptions = [
  { value: 'active', label: 'Active', icon: TrendingUp, color: 'text-green-500' },
  { value: 'completed', label: 'Completed', icon: CheckCircle2, color: 'text-blue-500' },
  { value: 'paused', label: 'Paused', icon: PauseCircle, color: 'text-yellow-500' },
  { value: 'abandoned', label: 'Abandoned', icon: XCircle, color: 'text-gray-500' },
];

export function GoalModal({ open, onOpenChange, goalId, isCreating, onCreateGoal, isCreatePending }: GoalModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'milestones' | 'progress'>('details');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedTargetDate, setEditedTargetDate] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: goal, isLoading } = useQuery<Goal>({
    queryKey: ['/api/goals', goalId],
    queryFn: async () => {
      const res = await fetch(`/api/goals/${goalId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goal');
      return res.json();
    },
    enabled: !!goalId && !isCreating,
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (goal) {
      setEditedTitle(goal.title);
      setEditedDescription(goal.description || "");
      setEditedTargetDate(goal.targetDate ? format(new Date(goal.targetDate), 'yyyy-MM-dd') : "");
      setHasUnsavedChanges(false);
    } else if (isCreating) {
      setEditedTitle("");
      setEditedDescription("");
      setEditedTargetDate("");
      setHasUnsavedChanges(false);
    }
  }, [goal, isCreating]);

  const updateGoalMutation = useMutation({
    mutationFn: async (updates: Partial<Goal>) => {
      const response = await apiRequest("PATCH", `/api/goals/${goalId}`, updates);
      if (!response.ok) throw new Error("Failed to update goal");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      setHasUnsavedChanges(false);
      toast({ title: "Goal updated" });
    },
    onError: () => {
      toast({ title: "Failed to update goal", variant: "destructive" });
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/goals/${goalId}`);
      if (!response.ok) throw new Error("Failed to delete goal");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      onOpenChange(false);
      toast({ title: "Goal deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete goal", variant: "destructive" });
    },
  });

  const analyzeProgressMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/goals/${goalId}/analyze`);
      if (!response.ok) throw new Error("Failed to analyze progress");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      toast({ 
        title: "Progress analyzed", 
        description: `Progress updated to ${data.goal.progressPercent}%` 
      });
    },
    onError: () => {
      toast({ title: "Failed to analyze progress", variant: "destructive" });
    },
  });

  const suggestMilestonesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/goals/${goalId}/suggest-milestones`);
      if (!response.ok) throw new Error("Failed to suggest milestones");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.suggestions && data.suggestions.length > 0) {
        const currentMilestones = goal?.milestones || [];
        const newMilestones = data.suggestions.map((s: any, i: number) => ({
          id: `${Date.now()}-${i}`,
          title: s.title,
          isCompleted: false,
          order: currentMilestones.length + i,
        }));
        updateGoalMutation.mutate({ milestones: [...currentMilestones, ...newMilestones] } as any);
        toast({ title: `Added ${newMilestones.length} suggested milestones` });
      } else {
        toast({ title: "No new milestones suggested" });
      }
    },
    onError: () => {
      toast({ title: "Failed to get suggestions", variant: "destructive" });
    },
  });

  const handleSaveChanges = () => {
    if (isCreating) {
      onCreateGoal({
        title: editedTitle,
        description: editedDescription || undefined,
        targetDate: editedTargetDate || undefined,
      });
    } else {
      updateGoalMutation.mutate({
        title: editedTitle,
        description: editedDescription || null,
        targetDate: editedTargetDate ? new Date(editedTargetDate).toISOString() : null,
      } as any);
    }
  };

  const handleAddMilestone = () => {
    if (!newMilestoneTitle.trim() || !goal) return;
    const currentMilestones = goal.milestones || [];
    const newMilestone: GoalMilestone = {
      id: `${Date.now()}`,
      title: newMilestoneTitle.trim(),
      isCompleted: false,
      order: currentMilestones.length,
    };
    updateGoalMutation.mutate({ milestones: [...currentMilestones, newMilestone] } as any);
    setNewMilestoneTitle("");
  };

  const handleToggleMilestone = (milestoneId: string) => {
    if (!goal) return;
    const updatedMilestones = goal.milestones.map(m => 
      m.id === milestoneId 
        ? { ...m, isCompleted: !m.isCompleted, completedAt: !m.isCompleted ? new Date().toISOString() : undefined }
        : m
    );
    updateGoalMutation.mutate({ milestones: updatedMilestones } as any);
  };

  const handleDeleteMilestone = (milestoneId: string) => {
    if (!goal) return;
    const updatedMilestones = goal.milestones.filter(m => m.id !== milestoneId);
    updateGoalMutation.mutate({ milestones: updatedMilestones } as any);
  };

  const handleStatusChange = (status: string) => {
    if (status === 'completed') {
      updateGoalMutation.mutate({ status, progressPercent: 100 } as any);
    } else {
      updateGoalMutation.mutate({ status } as any);
    }
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
    updateGoalMutation.mutate({ progressPercent: value } as any);
  };

  const milestones = goal?.milestones || [];
  const completedCount = milestones.filter(m => m.isCompleted).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] flex flex-col p-0 gap-0 overflow-hidden top-[calc(50%+32px)] rounded-xl">
        {isLoading && !isCreating ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <DialogHeader className="flex-shrink-0 p-4 pb-2 border-b">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Target className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-lg font-semibold truncate">
                      {isCreating ? "New Goal" : goal?.title || "Goal"}
                    </DialogTitle>
                    {!isCreating && goal && (
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={goal.progressPercent} className="h-1.5 flex-1 max-w-32" />
                        <span className="text-xs text-muted-foreground">{goal.progressPercent}%</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isCreating && goal && (
                    <>
                      <Select value={goal.status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              <div className="flex items-center gap-2">
                                <opt.icon className={cn("w-3 h-3", opt.color)} />
                                {opt.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this goal?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{goal.title}". This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => deleteGoalMutation.mutate()}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </DialogHeader>

            {!isCreating && (
              <div className="flex border-b flex-shrink-0">
                {(['details', 'milestones', 'progress'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "flex-1 px-4 py-2 text-sm font-medium transition-colors capitalize",
                      activeTab === tab 
                        ? "border-b-2 border-primary text-primary" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {(isCreating || activeTab === 'details') && (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Goal Title</label>
                    <Input
                      value={editedTitle}
                      onChange={(e) => { setEditedTitle(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="What do you want to achieve?"
                      className="text-base"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Description</label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => { setEditedDescription(e.target.value); setHasUnsavedChanges(true); }}
                      placeholder="Describe your goal in detail..."
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Target Date (Optional)</label>
                    <Input
                      type="date"
                      value={editedTargetDate}
                      onChange={(e) => { setEditedTargetDate(e.target.value); setHasUnsavedChanges(true); }}
                    />
                  </div>
                  {(hasUnsavedChanges || isCreating) && (
                    <Button 
                      onClick={handleSaveChanges} 
                      disabled={!editedTitle.trim() || updateGoalMutation.isPending || isCreatePending}
                      className="w-full gap-2"
                    >
                      {(updateGoalMutation.isPending || isCreatePending) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {isCreating ? "Create Goal" : "Save Changes"}
                    </Button>
                  )}
                </div>
              )}

              {!isCreating && activeTab === 'milestones' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {completedCount} of {milestones.length} milestones completed
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => suggestMilestonesMutation.mutate()}
                      disabled={suggestMilestonesMutation.isPending}
                      className="gap-2"
                    >
                      {suggestMilestonesMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      AI Suggest
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={newMilestoneTitle}
                      onChange={(e) => setNewMilestoneTitle(e.target.value)}
                      placeholder="Add a milestone..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAddMilestone()}
                    />
                    <Button 
                      onClick={handleAddMilestone} 
                      disabled={!newMilestoneTitle.trim()}
                      size="icon"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {milestones.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <p>No milestones yet</p>
                        <p className="text-sm">Add milestones to break down your goal into steps</p>
                      </div>
                    ) : (
                      milestones.map((milestone) => (
                        <div
                          key={milestone.id}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-colors group",
                            milestone.isCompleted 
                              ? "bg-muted/50 border-muted" 
                              : "bg-card border-border"
                          )}
                        >
                          <Checkbox
                            checked={milestone.isCompleted}
                            onCheckedChange={() => handleToggleMilestone(milestone.id)}
                          />
                          <span className={cn(
                            "flex-1",
                            milestone.isCompleted && "line-through text-muted-foreground"
                          )}>
                            {milestone.title}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleDeleteMilestone(milestone.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {!isCreating && activeTab === 'progress' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Progress Tracking</h3>
                    <Button
                      onClick={() => analyzeProgressMutation.mutate()}
                      disabled={analyzeProgressMutation.isPending}
                      className="gap-2"
                    >
                      {analyzeProgressMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Analyze Progress
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Manual Progress</label>
                      <span className="text-2xl font-bold">{goal?.progressPercent || 0}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={goal?.progressPercent || 0}
                      onChange={handleProgressChange}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                    <Progress value={goal?.progressPercent || 0} className="h-3" />
                  </div>

                  {goal?.aiSummary && (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="w-4 h-4 text-primary" />
                        AI Analysis
                      </div>
                      <p className="text-sm text-muted-foreground">{goal.aiSummary}</p>
                      {goal.aiLastAnalyzed && (
                        <p className="text-xs text-muted-foreground">
                          Last analyzed: {format(new Date(goal.aiLastAnalyzed), 'MMM d, yyyy h:mm a')}
                        </p>
                      )}
                    </div>
                  )}

                  {goal?.targetDate && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2 text-sm font-medium mb-1">
                        <Calendar className="w-4 h-4" />
                        Target Date
                      </div>
                      <p className="text-lg font-semibold">
                        {format(new Date(goal.targetDate), 'MMMM d, yyyy')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
