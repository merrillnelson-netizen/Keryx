import { useState, useEffect } from "react";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  History,
  ArrowUp,
  ArrowDown,
  Minus,
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

interface AiProgressSuggestion {
  progressPercent: number;
  summary: string;
  achievements?: string[];
  blockers?: string[];
  suggestions?: string[];
}

interface GoalProgressSnapshot {
  id: string;
  goalId: string;
  userId: string;
  progressPercent: number;
  note: string | null;
  createdAt: string;
}

type GoalUpdateInput = Partial<Goal> & { progress?: number; milestones?: GoalMilestone[] };

export function GoalModal({ open, onOpenChange, goalId, isCreating, onCreateGoal, isCreatePending }: GoalModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'details' | 'milestones' | 'progress' | 'history'>('details');
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedTargetDate, setEditedTargetDate] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [localProgress, setLocalProgress] = useState(0);
  const [aiSuggestion, setAiSuggestion] = useState<AiProgressSuggestion | null>(null);

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

  const { data: progressHistory, isLoading: historyLoading } = useQuery<GoalProgressSnapshot[]>({
    queryKey: ['/api/goals', goalId, 'history'],
    queryFn: async () => {
      const res = await fetch(`/api/goals/${goalId}/history`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch progress history');
      return res.json();
    },
    enabled: !!goalId && !isCreating && activeTab === 'history',
    staleTime: 30 * 1000,
  });

  useEffect(() => {
    if (goal) {
      setEditedTitle(goal.title);
      setEditedDescription(goal.description || "");
      setEditedTargetDate(goal.targetDate ? format(new Date(goal.targetDate), 'yyyy-MM-dd') : "");
      setHasUnsavedChanges(false);
      setLocalProgress(goal.progressPercent);
      setAiSuggestion(null);
    } else if (isCreating) {
      setEditedTitle("");
      setEditedDescription("");
      setEditedTargetDate("");
      setHasUnsavedChanges(false);
      setLocalProgress(0);
      setAiSuggestion(null);
    }
  }, [goal, isCreating]);

  const updateGoalMutation = useMutation({
    mutationFn: async (updates: GoalUpdateInput) => {
      const response = await apiRequest("PATCH", `/api/goals/${goalId}`, updates);
      if (!response.ok) throw new Error("Failed to update goal");
      return response.json();
    },
    onSuccess: (_data, updates) => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      if (updates.progress !== undefined) {
        queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId, 'history'] });
      }
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
      const response = await apiRequest("POST", `/api/goals/${goalId}/analyze?suggest=true`);
      if (!response.ok) throw new Error("Failed to analyze progress");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.analysis) {
        setAiSuggestion({
          progressPercent: data.analysis.progressPercent,
          summary: data.analysis.summary,
          achievements: data.analysis.achievements,
          blockers: data.analysis.blockers,
          suggestions: data.analysis.suggestions,
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to analyze progress", variant: "destructive" });
    },
  });

  const acceptAiSuggestionMutation = useMutation({
    mutationFn: async (progress: number) => {
      const response = await apiRequest("PATCH", `/api/goals/${goalId}`, { progress });
      if (!response.ok) throw new Error("Failed to apply suggestion");
      return response.json();
    },
    onSuccess: (_data, progress) => {
      setLocalProgress(progress);
      setAiSuggestion(null);
      queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      queryClient.invalidateQueries({ queryKey: ['/api/goals', goalId, 'history'] });
      toast({ title: "Progress updated", description: `Set to ${progress}%` });
    },
    onError: () => {
      toast({ title: "Failed to apply suggestion", variant: "destructive" });
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
    setLocalProgress(value);
  };

  const commitProgress = () => {
    if (localProgress !== goal?.progressPercent) {
      updateGoalMutation.mutate({ progress: localProgress } as any);
    }
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
            <DialogHeader className="flex-shrink-0 p-4 pb-3 border-b">
              <div className="flex items-center gap-3 min-w-0 pr-6">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-lg font-semibold truncate">
                    {isCreating ? "New Goal" : goal?.title || "Goal"}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {isCreating ? "Create a new goal to track" : `Details for ${goal?.title || "goal"}`}
                  </DialogDescription>
                </div>
              </div>
              {!isCreating && goal && (
                <div className="flex items-center gap-3 mt-2 pl-[52px]">
                  <Progress value={goal.progressPercent} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground flex-shrink-0">{goal.progressPercent}%</span>
                  <Select value={goal.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-32 h-8 text-xs flex-shrink-0">
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
                </div>
              )}
            </DialogHeader>

            {!isCreating && (
              <div className="flex border-b flex-shrink-0">
                {(['details', 'milestones', 'progress', 'history'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "flex-1 px-2 py-2 text-sm font-medium transition-colors capitalize",
                      activeTab === tab 
                        ? "border-b-2 border-primary text-primary" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab === 'history' ? (
                      <span className="flex items-center justify-center gap-1">
                        <History className="w-3 h-3" />
                        History
                      </span>
                    ) : tab}
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
                      disabled={!editedTitle?.trim() || updateGoalMutation.isPending || isCreatePending}
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
                  
                  {!isCreating && goal && (
                    <div className="pt-6 mt-6 border-t border-dashed">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-2">
                            <Trash2 className="w-4 h-4" />
                            Delete Goal
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
                    </div>
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
                      onClick={() => { setAiSuggestion(null); analyzeProgressMutation.mutate(); }}
                      disabled={analyzeProgressMutation.isPending}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      {analyzeProgressMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Ask Keryx
                    </Button>
                  </div>

                  {/* AI Suggestion callout */}
                  {aiSuggestion && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                        <Sparkles className="w-4 h-4" />
                        <span className="flex-1">Keryx suggests {aiSuggestion.progressPercent}%</span>
                        <ReadAloudButton
                          text={[
                            aiSuggestion.summary,
                            aiSuggestion.achievements?.length ? `Achievements: ${aiSuggestion.achievements.join(". ")}.` : "",
                            aiSuggestion.blockers?.length ? `Blockers: ${aiSuggestion.blockers.join(". ")}.` : "",
                            aiSuggestion.suggestions?.length ? `Suggestions: ${aiSuggestion.suggestions.join(". ")}.` : "",
                          ].filter(Boolean).join(" ")}
                          variant="ghost"
                          className="text-primary/70 hover:text-primary"
                        />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{aiSuggestion.summary}</p>
                      {aiSuggestion.achievements && aiSuggestion.achievements.length > 0 && (
                        <div className="space-y-1">
                          {aiSuggestion.achievements.map((a, i) => (
                            <p key={i} className="text-xs text-green-600 dark:text-green-400">✓ {a}</p>
                          ))}
                        </div>
                      )}
                      {aiSuggestion.blockers && aiSuggestion.blockers.length > 0 && (
                        <div className="space-y-1">
                          {aiSuggestion.blockers.map((b, i) => (
                            <p key={i} className="text-xs text-orange-600 dark:text-orange-400">⚠ {b}</p>
                          ))}
                        </div>
                      )}
                      {aiSuggestion.suggestions && aiSuggestion.suggestions.length > 0 && (
                        <div className="space-y-1">
                          {aiSuggestion.suggestions.map((s, i) => (
                            <p key={i} className="text-xs text-blue-600 dark:text-blue-400">→ {s}</p>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => acceptAiSuggestionMutation.mutate(aiSuggestion.progressPercent)}
                          disabled={acceptAiSuggestionMutation.isPending}
                          className="gap-2"
                        >
                          {acceptAiSuggestionMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          Accept {aiSuggestion.progressPercent}%
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAiSuggestion(null)}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Manual slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium">Manual Progress</label>
                      <span className="text-2xl font-bold">{localProgress}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localProgress}
                      onChange={handleProgressChange}
                      onMouseUp={commitProgress}
                      onTouchEnd={commitProgress}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
                    />
                    <Progress value={localProgress} className="h-3" />
                    {updateGoalMutation.isPending && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                      </p>
                    )}
                  </div>

                  {goal?.aiSummary && !aiSuggestion && (
                    <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Sparkles className="w-4 h-4 text-primary" />
                        <span className="flex-1">Last Keryx Analysis</span>
                        <ReadAloudButton text={goal.aiSummary} />
                      </div>
                      <p className="text-sm text-muted-foreground">{goal.aiSummary}</p>
                      {goal.aiLastAnalyzed && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(goal.aiLastAnalyzed), 'MMM d, yyyy h:mm a')}
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

              {!isCreating && activeTab === 'history' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Progress Timeline</h3>
                    {progressHistory && progressHistory.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {progressHistory.length} snapshot{progressHistory.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {historyLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : progressHistory && progressHistory.length > 0 ? (
                    <div className="relative">
                      {/* Sparkline bar */}
                      <div className="flex items-end gap-1 h-16 mb-4 px-1">
                        {[...progressHistory].reverse().map((snapshot, i, arr) => {
                          const prev = i > 0 ? arr[i - 1].progressPercent : snapshot.progressPercent;
                          const delta = snapshot.progressPercent - prev;
                          return (
                            <div
                              key={snapshot.id}
                              className="flex-1 min-w-0 flex flex-col items-center justify-end"
                              title={`${snapshot.progressPercent}%`}
                            >
                              <div
                                className={cn(
                                  "w-full rounded-sm transition-all",
                                  delta > 0 ? "bg-green-500 dark:bg-green-400" :
                                  delta < 0 ? "bg-red-400 dark:bg-red-500" :
                                  "bg-muted-foreground/40"
                                )}
                                style={{ height: `${Math.max(4, snapshot.progressPercent * 0.56)}px` }}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Timeline list */}
                      <div className="space-y-3">
                        {progressHistory.map((snapshot, i) => {
                          const prev = progressHistory[i + 1]?.progressPercent;
                          const delta = prev !== undefined ? snapshot.progressPercent - prev : null;
                          return (
                            <div key={snapshot.id} className="flex items-start gap-3">
                              <div className="flex flex-col items-center flex-shrink-0">
                                <div className={cn(
                                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                                  delta === null ? "bg-primary/10 text-primary" :
                                  delta > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                  delta < 0 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                                  "bg-muted text-muted-foreground"
                                )}>
                                  {delta === null ? <Minus className="w-3 h-3" /> :
                                   delta > 0 ? <ArrowUp className="w-3 h-3" /> :
                                   delta < 0 ? <ArrowDown className="w-3 h-3" /> :
                                   <Minus className="w-3 h-3" />}
                                </div>
                                {i < progressHistory.length - 1 && (
                                  <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0 pb-3">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-sm">
                                    {snapshot.progressPercent}%
                                  </span>
                                  {delta !== null && delta !== 0 && (
                                    <span className={cn(
                                      "text-xs font-medium",
                                      delta > 0 ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"
                                    )}>
                                      {delta > 0 ? '+' : ''}{delta}%
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-xs text-muted-foreground">
                                    {format(new Date(snapshot.createdAt), 'MMM d, yyyy h:mm a')}
                                  </span>
                                  {snapshot.note && (
                                    <span className="text-xs text-primary/70 italic">· {snapshot.note}</span>
                                  )}
                                </div>
                                <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${snapshot.progressPercent}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No history yet</p>
                      <p className="text-sm mt-1">
                        Progress snapshots are saved whenever you update progress using the slider or AI.
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
