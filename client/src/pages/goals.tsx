import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  Plus,
  Calendar,
  TrendingUp,
  CheckCircle2,
  PauseCircle,
  XCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { GoalModal } from "@/components/goal-modal";
import { format, formatDistanceToNow, isPast } from "date-fns";

interface Goal {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  progressPercent: number;
  status: string;
  milestones: any[];
  aiSummary: string | null;
  aiLastAnalyzed: string | null;
  relatedMemoryIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "Active", color: "bg-green-500/10 text-green-500 border-green-500/20", icon: TrendingUp },
  completed: { label: "Completed", color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: CheckCircle2 },
  paused: { label: "Paused", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: PauseCircle },
  abandoned: { label: "Abandoned", color: "bg-gray-500/10 text-gray-500 border-gray-500/20", icon: XCircle },
};

function GoalCard({ goal, onClick }: { goal: Goal; onClick: () => void }) {
  const status = statusConfig[goal.status] || statusConfig.active;
  const StatusIcon = status.icon;
  const isOverdue = goal.targetDate && isPast(new Date(goal.targetDate)) && goal.status === 'active';
  const completedMilestones = Array.isArray(goal.milestones) 
    ? goal.milestones.filter((m: any) => m.isCompleted).length 
    : 0;
  const totalMilestones = Array.isArray(goal.milestones) ? goal.milestones.length : 0;

  return (
    <Card 
      className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:scale-[1.01] border-border/50 bg-card/50 backdrop-blur-sm"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Target className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-medium truncate">{goal.title}</CardTitle>
              {goal.description && (
                <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                  {goal.description}
                </p>
              )}
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
          <div>
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{goal.progressPercent}%</span>
            </div>
            <Progress value={goal.progressPercent} className="h-2" />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              {goal.targetDate && (
                <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
                  <Calendar className="w-3 h-3" />
                  <span>
                    {isOverdue ? 'Overdue' : format(new Date(goal.targetDate), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              {totalMilestones > 0 && (
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{completedMilestones}/{totalMilestones} milestones</span>
                </div>
              )}
            </div>
            {goal.aiLastAnalyzed && (
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Analyzed {formatDistanceToNow(new Date(goal.aiLastAnalyzed), { addSuffix: true })}</span>
              </div>
            )}
          </div>

          {goal.aiSummary && (
            <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded-md line-clamp-2">
              {goal.aiSummary}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoalsPage() {
  const { toast } = useToast();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: ['/api/goals', statusFilter],
    queryFn: async () => {
      const url = statusFilter ? `/api/goals?status=${statusFilter}` : '/api/goals';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const createGoalMutation = useMutation({
    mutationFn: async (data: { title: string; description?: string; targetDate?: string }) => {
      const response = await apiRequest("POST", "/api/goals", data);
      if (!response.ok) throw new Error("Failed to create goal");
      return response.json();
    },
    onSuccess: (newGoal) => {
      queryClient.invalidateQueries({ queryKey: ['/api/goals'] });
      setIsCreating(false);
      setSelectedGoalId(newGoal.id);
      toast({ title: "Goal created", description: "Start tracking your progress!" });
    },
    onError: () => {
      toast({ title: "Failed to create goal", variant: "destructive" });
    },
  });

  const activeGoals = goals.filter(g => g.status === 'active');
  const completedGoals = goals.filter(g => g.status === 'completed');
  const otherGoals = goals.filter(g => g.status !== 'active' && g.status !== 'completed');

  const avgProgress = activeGoals.length > 0
    ? Math.round(activeGoals.reduce((sum, g) => sum + g.progressPercent, 0) / activeGoals.length)
    : 0;

  return (
    <div className="container max-w-4xl mx-auto p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-primary" />
            Goals
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Track your goals and let AI monitor your progress
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Goal
        </Button>
      </div>

      {goals.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-green-500">{activeGoals.length}</div>
              <div className="text-sm text-muted-foreground">Active Goals</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-blue-500">{completedGoals.length}</div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
            <CardContent className="pt-4">
              <div className="text-3xl font-bold text-purple-500">{avgProgress}%</div>
              <div className="text-sm text-muted-foreground">Avg Progress</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <Button
          variant={statusFilter === null ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter(null)}
        >
          All
        </Button>
        <Button
          variant={statusFilter === 'active' ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter('active')}
        >
          Active
        </Button>
        <Button
          variant={statusFilter === 'completed' ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter('completed')}
        >
          Completed
        </Button>
        <Button
          variant={statusFilter === 'paused' ? "default" : "outline"}
          size="sm"
          onClick={() => setStatusFilter('paused')}
        >
          Paused
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : goals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No goals yet</h3>
            <p className="text-muted-foreground mb-4 max-w-sm">
              Set your first goal and let AI help you track your progress through your daily memories.
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Create Your First Goal
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onClick={() => setSelectedGoalId(goal.id)}
            />
          ))}
        </div>
      )}

      <GoalModal
        open={!!selectedGoalId || isCreating}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGoalId(null);
            setIsCreating(false);
          }
        }}
        goalId={selectedGoalId}
        isCreating={isCreating}
        onCreateGoal={(data) => createGoalMutation.mutate(data)}
        isCreatePending={createGoalMutation.isPending}
      />
    </div>
  );
}
