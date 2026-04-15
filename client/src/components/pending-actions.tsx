import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Calendar, 
  Mail, 
  Bell, 
  Check, 
  X, 
  Clock, 
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Search,
  Brain,
  DollarSign,
  UserPen,
  Target,
  Newspaper,
  Sunrise,
  TrendingDown,
  Zap,
  MessageSquare
} from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { format, formatDistanceToNow } from "date-fns";
import { type AiAction, AI_ACTION_TYPES } from "@shared/schema";

interface PendingActionsProps {
  compact?: boolean;
}

export default function PendingActions({ compact = false }: PendingActionsProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [rejectingActionId, setRejectingActionId] = useState<string | null>(null);
  const [rejectionInput, setRejectionInput] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: pendingActions = [], isLoading } = useQuery<AiAction[]>({
    queryKey: ["/api/actions/pending"],
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const response = await apiRequest("POST", `/api/actions/${actionId}/approve`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      toast({
        title: "Action Executed",
        description: data.message || "The action was completed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Execution Failed",
        description: error.message || "Failed to execute the action.",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const body = reason ? { reason } : {};
      const response = await apiRequest("POST", `/api/actions/${id}/reject`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      setRejectingActionId(null);
      setRejectionInput("");
      toast({
        title: "Action Rejected",
        description: "The proposed action was declined.",
      });
    },
    onError: () => {
      toast({
        title: "Failed",
        description: "Could not reject the action.",
        variant: "destructive",
      });
    },
  });

  const getActionIcon = (actionType: string) => {
    if (actionType.startsWith('calendar')) {
      return <Calendar className="w-4 h-4 text-purple-500" />;
    }
    if (actionType.startsWith('email')) {
      return <Mail className="w-4 h-4 text-red-500" />;
    }
    if (actionType.startsWith('reminder')) {
      return <Bell className="w-4 h-4 text-amber-500" />;
    }
    if (actionType === AI_ACTION_TYPES.GOAL_UPDATE || actionType === AI_ACTION_TYPES.GOAL_MILESTONE) {
      return <Target className="w-4 h-4 text-emerald-500" />;
    }
    if (actionType.startsWith('goals') || actionType.startsWith('goal')) {
      return <Target className="w-4 h-4 text-emerald-500" />;
    }
    if (actionType === AI_ACTION_TYPES.PEOPLE_NOTE) {
      return <UserPen className="w-4 h-4 text-sky-500" />;
    }
    if (actionType.startsWith('people')) {
      return <Bot className="w-4 h-4 text-sky-500" />;
    }
    if (actionType === AI_ACTION_TYPES.WEB_SEARCH) {
      return <Search className="w-4 h-4 text-blue-500" />;
    }
    if (actionType === AI_ACTION_TYPES.MEMORY_CREATE) {
      return <Brain className="w-4 h-4 text-emerald-500" />;
    }
    if (actionType === AI_ACTION_TYPES.FINANCIAL_ALERT) {
      return <DollarSign className="w-4 h-4 text-yellow-500" />;
    }
    return <Bot className="w-4 h-4 text-violet-500" />;
  };

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return null;
    const config: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
      briefing: {
        label: 'Morning briefing',
        className: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
        icon: <Sunrise className="w-2.5 h-2.5" />,
      },
      discovery: {
        label: 'From discovery',
        className: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
        icon: <Newspaper className="w-2.5 h-2.5" />,
      },
      velocity: {
        label: 'Relationship trend',
        className: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
        icon: <TrendingDown className="w-2.5 h-2.5" />,
      },
      high_signal: {
        label: 'VIP alert',
        className: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
        icon: <Zap className="w-2.5 h-2.5" />,
      },
    };
    const c = config[sourceType];
    if (!c) return null;
    return (
      <Badge variant="outline" className={`flex items-center gap-1 text-[10px] px-1.5 py-0 h-4 ${c.className}`}>
        {c.icon}
        {c.label}
      </Badge>
    );
  };

  const getActionCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      calendar: 'bg-purple-500/20 text-purple-500',
      email: 'bg-red-500/20 text-red-500',
      reminder: 'bg-amber-500/20 text-amber-500',
      people: 'bg-sky-500/20 text-sky-500',
      goals: 'bg-emerald-500/20 text-emerald-500',
      research: 'bg-blue-500/20 text-blue-500',
      memory: 'bg-emerald-400/20 text-emerald-400',
      financial: 'bg-yellow-500/20 text-yellow-500',
    };
    return colors[category] || 'bg-muted text-muted-foreground';
  };

  const formatPayloadPreview = (action: AiAction): string => {
    const payload = action.payload as Record<string, any>;
    
    if (action.actionType === AI_ACTION_TYPES.CALENDAR_CREATE) {
      const start = payload.startDateTime ? format(new Date(payload.startDateTime), 'MMM d, h:mm a') : '';
      return `${payload.summary || 'Event'} - ${start}`;
    }
    if (action.actionType === AI_ACTION_TYPES.EMAIL_SEND) {
      const to = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
      return `To: ${to} - "${payload.subject || 'No subject'}"`;
    }
    if (action.actionType === AI_ACTION_TYPES.REMINDER_CREATE) {
      return `${payload.title || 'Reminder'}`;
    }
    if (action.actionType === AI_ACTION_TYPES.GOAL_UPDATE) {
      const prev = payload.currentProgress !== undefined ? ` (was ${payload.currentProgress}%)` : '';
      return `${payload.goalTitle || 'Goal'} → ${payload.newProgress ?? '?'}%${prev}`;
    }
    if (action.actionType === AI_ACTION_TYPES.GOAL_MILESTONE) {
      return `Milestone: ${payload.milestone || payload.title || action.title}`;
    }
    if (action.actionType === AI_ACTION_TYPES.PEOPLE_NOTE) {
      return `${payload.personName}: ${payload.note?.slice(0, 60) || ''}`;
    }
    if (action.actionType === AI_ACTION_TYPES.WEB_SEARCH) {
      return `"${payload.query}"`;
    }
    if (action.actionType === AI_ACTION_TYPES.MEMORY_CREATE) {
      return `${payload.memoryText?.slice(0, 80) || ''}`;
    }
    if (action.actionType === AI_ACTION_TYPES.FINANCIAL_ALERT) {
      return `${payload.title || 'Financial Alert'}`;
    }
    return action.title;
  };

  if (isLoading) {
    return (
      <Card className="glass-card border-white/20">
        <CardContent className="py-4">
          <div className="animate-pulse flex items-center gap-3">
            <div className="w-8 h-8 bg-muted rounded-full"></div>
            <div className="space-y-2 flex-1">
              <div className="h-4 bg-muted rounded w-1/3"></div>
              <div className="h-3 bg-muted rounded w-1/2"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pendingActions.length === 0) {
    if (compact) return null;
    
    return (
      <Card className="glass-card border-white/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="w-5 h-5 text-violet-500" />
            AI Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No pending actions. When you ask Keryx to schedule meetings or send emails, 
            they'll appear here for your approval.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card border-violet-500/20 bg-violet-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="w-5 h-5 text-violet-500" />
          Pending AI Actions
          <Badge variant="secondary" className="ml-auto">
            {pendingActions.length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pendingActions.map((action) => (
          <div
            key={action.id}
            className="p-3 rounded-lg bg-background/50 border border-white/10 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {getActionIcon(action.actionType)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{action.title}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${getActionCategoryBadge(action.actionCategory)}`}
                    >
                      {action.actionCategory}
                    </Badge>
                    {getSourceBadge(action.sourceType)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {formatPayloadPreview(action)}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                    {action.confidence && (
                      <>
                        <span>•</span>
                        <span>{Math.round(action.confidence * 100)}% confidence</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-green-500 hover:text-green-600 hover:bg-green-500/10"
                  onClick={() => approveMutation.mutate(action.id)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  data-testid={`approve-action-${action.id}`}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  onClick={() => {
                    setRejectingActionId(action.id);
                    setRejectionInput("");
                  }}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  data-testid={`reject-action-${action.id}`}
                >
                  <X className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                  data-testid={`expand-action-${action.id}`}
                >
                  {expandedAction === action.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {rejectingActionId === action.id && (
              <div className="mt-2 pt-2 border-t border-red-500/20 space-y-2">
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-1" />
                  <span className="text-xs text-muted-foreground">Why are you rejecting this? Keryx will remember and won't repeat it.</span>
                </div>
                <Textarea
                  value={rejectionInput}
                  onChange={(e) => setRejectionInput(e.target.value.slice(0, 500))}
                  placeholder="Why are you rejecting this? (optional)"
                  className="text-sm min-h-[60px] max-h-[90px] resize-none"
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => rejectMutation.mutate({ id: action.id, reason: rejectionInput.trim() || undefined })}
                    disabled={rejectMutation.isPending}
                  >
                    Submit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => rejectMutation.mutate({ id: action.id })}
                    disabled={rejectMutation.isPending}
                  >
                    Skip
                  </Button>
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1"
                    onClick={() => { setRejectingActionId(null); setRejectionInput(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {expandedAction === action.id && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2 text-sm">
                {action.description && (
                  <div>
                    <span className="text-muted-foreground">Description:</span>
                    <p className="text-foreground">{action.description}</p>
                  </div>
                )}
                
                {action.aiReasoning && (
                  <div className="p-2 rounded bg-violet-500/10 border border-violet-500/20">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-medium text-violet-500">AI Reasoning</span>
                        <p className="text-xs text-muted-foreground mt-0.5">{action.aiReasoning}</p>
                      </div>
                    </div>
                  </div>
                )}

                {action.sourceText && (
                  <div>
                    <span className="text-xs text-muted-foreground">Triggered by:</span>
                    <p className="text-xs italic">"{action.sourceText}"</p>
                  </div>
                )}

                <div className="pt-2">
                  <span className="text-xs text-muted-foreground">Payload Details:</span>
                  <pre className="mt-1 p-2 rounded bg-muted/30 text-xs overflow-auto max-h-32">
                    {JSON.stringify(action.payload, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
