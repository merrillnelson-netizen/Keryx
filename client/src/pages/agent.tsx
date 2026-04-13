import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, formatDistanceToNow } from "date-fns";
import AppLayout from "@/components/app-layout";
import {
  Bot,
  Calendar,
  Mail,
  Bell,
  Users,
  Target,
  Zap,
  Radio,
  Check,
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ArrowLeft,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  TrendingUp,
  Eye,
  Plus,
  Play,
  Trash2,
  Power,
  Settings2,
  Workflow,
  RotateCcw,
  Filter,
  Search,
  Brain,
  DollarSign,
  UserPen,
  GitBranch,
} from "lucide-react";
import { type AiAction, AI_ACTION_TYPES, AUTOMATION_TRIGGERS, AUTOMATION_ACTIONS } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionStats {
  pendingCount: number;
  completedToday: number;
  completedTotal: number;
  failedToday: number;
  failedTotal: number;
  rejectedToday: number;
  rejectedTotal: number;
  totalActions: number;
  categoryBreakdown: Record<string, number>;
}

interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  triggerConditions?: Record<string, any> | null;
  actionType: string;
  actionPayload: Record<string, any>;
  runCount: number;
  lastRunAt?: string;
  lastRunResult?: string;
  maxRunsPerDay: number;
  createdAt: string;
}

// ─── Config Maps ──────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Bot; color: string }> = {
  calendar: { label: "Calendar", icon: Calendar, color: "text-purple-500" },
  email: { label: "Email", icon: Mail, color: "text-red-500" },
  reminder: { label: "Reminder", icon: Bell, color: "text-amber-500" },
  people: { label: "People", icon: Users, color: "text-sky-500" },
  goals: { label: "Goals", icon: Target, color: "text-emerald-500" },
  research: { label: "Research", icon: Search, color: "text-blue-500" },
  memory: { label: "Memory", icon: Brain, color: "text-emerald-400" },
  financial: { label: "Financial", icon: DollarSign, color: "text-yellow-500" },
  system: { label: "System", icon: Zap, color: "text-violet-500" },
  relay: { label: "Relay", icon: Radio, color: "text-orange-500" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/20" },
  approved: { label: "Approved", color: "text-blue-500", bg: "bg-blue-500/10 border-blue-500/20" },
  executing: { label: "Executing", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  completed: { label: "Done", color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/20" },
  rejected: { label: "Rejected", color: "text-muted-foreground", bg: "bg-muted/10 border-border" },
  failed: { label: "Failed", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted/10 border-border" },
};

const TRIGGER_LABELS: Record<string, string> = {
  [AUTOMATION_TRIGGERS.MEMORY_LOGGED]: "Memory Logged",
  [AUTOMATION_TRIGGERS.MOOD_DROPPED]: "Mood Drops Low",
  [AUTOMATION_TRIGGERS.MOOD_SPIKED]: "Mood Spikes High",
  [AUTOMATION_TRIGGERS.PERSON_MENTIONED]: "Person Mentioned",
  [AUTOMATION_TRIGGERS.REMINDER_DUE]: "Reminder Due",
  [AUTOMATION_TRIGGERS.BRIEFING_GENERATED]: "Briefing Generated",
  [AUTOMATION_TRIGGERS.GOAL_UPDATED]: "Goal Updated",
  [AUTOMATION_TRIGGERS.KEYWORD_DETECTED]: "Keyword Detected",
  [AUTOMATION_TRIGGERS.DAILY_SCHEDULE]: "Daily Schedule",
  [AUTOMATION_TRIGGERS.ACTION_COMPLETED]: "Action Completed",
};

const ACTION_LABELS: Record<string, string> = {
  [AUTOMATION_ACTIONS.CREATE_REMINDER]: "Create Reminder",
  [AUTOMATION_ACTIONS.SEND_NOTIFICATION]: "Send Notification",
  [AUTOMATION_ACTIONS.CREATE_AI_ACTION]: "Create AI Action",
  [AUTOMATION_ACTIONS.LOG_MEMORY]: "Auto-log Memory",
  [AUTOMATION_ACTIONS.RELAY_OUTBOUND]: "Relay Outbound",
  [AUTOMATION_ACTIONS.SEND_EMAIL]: "Send Email",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryIcon(category: string, className = "w-4 h-4") {
  const cfg = CATEGORY_CONFIG[category];
  if (!cfg) return <Bot className={`${className} text-violet-500`} />;
  const Icon = cfg.icon;
  return <Icon className={`${className} ${cfg.color}`} />;
}

function formatPayloadPreview(action: AiAction): string {
  const payload = action.payload as Record<string, any>;
  switch (action.actionType) {
    case AI_ACTION_TYPES.CALENDAR_CREATE: {
      const start = payload.startDateTime
        ? format(new Date(payload.startDateTime), "MMM d, h:mm a")
        : "";
      return `${payload.summary || "Event"} — ${start}`;
    }
    case AI_ACTION_TYPES.EMAIL_SEND:
    case AI_ACTION_TYPES.EMAIL_DRAFT: {
      const to = Array.isArray(payload.to) ? payload.to.join(", ") : (payload.to || "");
      return `To: ${to} — "${payload.subject || "No subject"}"`;
    }
    case AI_ACTION_TYPES.REMINDER_CREATE:
      return payload.title || payload.content || "Reminder";
    case AI_ACTION_TYPES.PEOPLE_REACH_OUT:
      return `Reach out to ${payload.personName || payload.name || "contact"}`;
    case AI_ACTION_TYPES.GOAL_UPDATE:
      return `Update: ${payload.goalTitle || "goal"} → ${payload.newProgress ?? "?"}%`;
    case AI_ACTION_TYPES.GOAL_MILESTONE:
      return `Milestone: ${payload.milestone || payload.title || ""}`;
    case AI_ACTION_TYPES.INSIGHT_SURFACE:
      return payload.summary || payload.content || "Proactive insight";
    case AI_ACTION_TYPES.RELAY_OUTBOUND:
      return `→ ${payload.destination || "relay"}: ${(payload.content || "").slice(0, 60)}`;
    case AI_ACTION_TYPES.PEOPLE_NOTE:
      return `${payload.personName}: ${(payload.note || "").slice(0, 60)}`;
    case AI_ACTION_TYPES.WEB_SEARCH:
      return `"${payload.query}"`;
    case AI_ACTION_TYPES.MEMORY_CREATE:
      return `${(payload.memoryText || "").slice(0, 80)}`;
    case AI_ACTION_TYPES.FINANCIAL_ALERT:
      return `${payload.title || "Financial Alert"}`;
    case "person_decay_audit":
      return `Relationship check: ${payload.personName || ""}`;
    default:
      return action.title;
  }
}

// ─── Helper: source type label ─────────────────────────────────────────────────

function getSourceLabel(sourceType: string): string {
  const labels: Record<string, string> = {
    voice_input: "Voice",
    memory: "Memory",
    briefing: "Briefing",
    manual: "Manual",
    discovery: "Discovery",
    velocity: "Velocity",
    automation: "Automation",
    proactive: "Proactive",
  };
  return labels[sourceType] || sourceType;
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

function ActionCard({ action, onMutated, isChild }: { action: AiAction; onMutated?: () => void; isChild?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/actions/${action.id}/approve`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      toast({ title: "Action executed", description: data.message || "Completed successfully." });
      onMutated?.();
    },
    onError: (err: Error) => {
      // Refresh the list so stale "pending" state doesn't stay visible after a failed attempt
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      onMutated?.();
      // Parse clean message from raw JSON error if present
      let msg = err.message;
      try { msg = JSON.parse(msg).message ?? msg; } catch { /* use raw */ }
      toast({ title: "Execution failed", description: msg, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/actions/${action.id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      toast({ title: "Action rejected", description: "The proposed action was declined." });
      onMutated?.();
    },
    onError: (err: Error) => {
      // Refresh so the list shows actual status instead of stale pending
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/pending"] });
      onMutated?.();
      let msg = err.message;
      try { msg = JSON.parse(msg).message ?? msg; } catch { /* use raw */ }
      toast({ title: "Could not reject action", description: msg, variant: "destructive" });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/actions/${action.id}/rollback`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/actions/stats"] });
      toast({ title: "Action rolled back", description: data.message });
      onMutated?.();
    },
    onError: (err: Error) => {
      toast({ title: "Rollback failed", description: err.message, variant: "destructive" });
    },
  });

  const isPending = action.status === "pending";
  const isCompleted = action.status === "completed";
  const isRolledBack = !!action.rolledBackAt;
  const hasRollback = isCompleted && action.rollbackAvailable && !isRolledBack;
  const statusCfg = STATUS_CONFIG[action.status] || STATUS_CONFIG.pending;
  const catCfg = CATEGORY_CONFIG[action.actionCategory];
  const anyMutating = approveMutation.isPending || rejectMutation.isPending || rollbackMutation.isPending;

  const chainDepth = action.chainDepth ?? 0;
  const parentActionId = action.parentActionId ?? null;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${statusCfg.bg} ${isChild ? 'border-l-2 border-l-violet-500/50' : ''}`}>
      {/* Chain header badge */}
      {parentActionId && (
        <div className="flex items-center gap-1.5 text-xs text-violet-400 pb-1 border-b border-violet-500/20">
          <GitBranch className="w-3 h-3" />
          <span>
            → spawned from{' '}
            <span className="font-medium">
              {action.sourceText?.startsWith('Chained from: ')
                ? action.sourceText.slice('Chained from: '.length)
                : 'parent action'}
            </span>
          </span>
          {chainDepth > 0 && <span className="text-muted-foreground">· depth {chainDepth}</span>}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {getCategoryIcon(action.actionCategory, "w-4 h-4 mt-0.5 flex-shrink-0")}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{action.title}</span>
              <Badge
                variant="outline"
                className={`text-xs ${catCfg ? `bg-muted/40 ${catCfg.color}` : 'bg-muted text-muted-foreground'}`}
              >
                {catCfg?.label || action.actionCategory}
              </Badge>
              {isRolledBack ? (
                <Badge variant="outline" className="text-xs bg-gray-500/10 text-gray-400 border-gray-500/30">
                  Rolled back
                </Badge>
              ) : (
                <Badge variant="outline" className={`text-xs ${statusCfg.color}`}>
                  {statusCfg.label}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {formatPayloadPreview(action)}
            </p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
              <span>•</span>
              <span className="bg-white/5 px-1.5 py-0.5 rounded capitalize">{getSourceLabel(action.sourceType)}</span>
              {action.confidence != null && (
                <>
                  <span>•</span>
                  <span>{Math.round((action.confidence as number) * 100)}% confidence</span>
                </>
              )}
            </div>
            {action.errorMessage && action.status === "failed" && (
              <p className="mt-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">
                Error: {action.errorMessage}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                onClick={() => approveMutation.mutate()}
                disabled={anyMutating}
                title="Approve"
                data-testid={`approve-action-${action.id}`}
              >
                {approveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                onClick={() => rejectMutation.mutate()}
                disabled={anyMutating}
                title="Reject"
                data-testid={`reject-action-${action.id}`}
              >
                <X className="w-4 h-4" />
              </Button>
            </>
          )}
          {hasRollback && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
              onClick={() => rollbackMutation.mutate()}
              disabled={anyMutating}
              title="Undo this action"
              data-testid={`rollback-action-${action.id}`}
            >
              {rollbackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Collapse" : "Expand"}
            data-testid={`expand-action-${action.id}`}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-2 text-sm">
          {action.description && (
            <div>
              <span className="text-xs text-muted-foreground">What:</span>
              <p className="text-sm">{action.description}</p>
            </div>
          )}
          {action.aiReasoning && (
            <div className="p-2 rounded bg-violet-500/10 border border-violet-500/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-violet-400">AI Reasoning</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.aiReasoning}</p>
                </div>
              </div>
            </div>
          )}
          {action.sourceText && (
            <div>
              <span className="text-xs text-muted-foreground">Triggered by:</span>
              <p className="text-xs italic mt-0.5">"{action.sourceText}"</p>
            </div>
          )}
          {action.executedAt && (
            <div className="text-xs text-muted-foreground">
              Executed: {format(new Date(action.executedAt), "MMM d, yyyy h:mm a")}
            </div>
          )}
          {action.rolledBackAt && (
            <div className="text-xs text-gray-400">
              Rolled back: {format(new Date(action.rolledBackAt), "MMM d, yyyy h:mm a")}
            </div>
          )}
          {isCompleted && action.resultData != null && (() => {
            const rd = action.resultData as Record<string, unknown> | string;
            const msg = typeof rd === "object"
              ? ((rd.message as string) || (rd.summary as string) || "Completed successfully")
              : String(rd);
            return (
              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-xs text-emerald-400">{msg}</span>
              </div>
            );
          })()}
          {action.errorMessage && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-xs text-red-400">{action.errorMessage}</span>
            </div>
          )}
          <div>
            <span className="text-xs text-muted-foreground">Payload:</span>
            <pre className="mt-1 p-2 rounded bg-muted/30 text-xs overflow-auto max-h-28 text-foreground">
              {JSON.stringify(action.payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RuleCard ─────────────────────────────────────────────────────────────────

function RuleCard({ rule, onRefresh }: { rule: AutomationRule; onRefresh: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automation/rules/${rule.id}/toggle`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
    },
    onError: () => toast({ title: "Failed to toggle rule", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/automation/rules/${rule.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
      toast({ title: "Rule deleted" });
    },
    onError: () => toast({ title: "Failed to delete rule", variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automation/rules/${rule.id}/test`, {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Rule triggered (test)", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/actions"] });
    },
    onError: (err: Error) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  const lastRunOk = rule.lastRunResult === "success";

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${rule.enabled ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-60"}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{rule.name}</span>
            {rule.enabled ? (
              <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
            )}
          </div>
          {rule.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{rule.description}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
            <span>
              <span className="text-amber-400">When:</span> {TRIGGER_LABELS[rule.triggerType] || rule.triggerType}
            </span>
            <span>
              <span className="text-sky-400">Then:</span> {ACTION_LABELS[rule.actionType] || rule.actionType}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>{rule.runCount} run{rule.runCount !== 1 ? "s" : ""}</span>
            {rule.lastRunAt && (
              <span className={`flex items-center gap-1 ${lastRunOk ? "text-emerald-400" : "text-red-400"}`}>
                {lastRunOk ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {formatDistanceToNow(new Date(rule.lastRunAt), { addSuffix: true })}
              </span>
            )}
            <span>Max {rule.maxRunsPerDay}/day</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending || !rule.enabled}
            title="Test rule now"
          >
            {testMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            title={rule.enabled ? "Disable" : "Enable"}
          >
            <Power className={`w-3.5 h-3.5 ${rule.enabled ? "text-emerald-400" : "text-muted-foreground"}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-red-400 hover:bg-red-500/10"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Conditions preview */}
      {rule.triggerConditions && Object.keys(rule.triggerConditions).length > 0 && (
        <div className="pt-2 border-t border-border/40">
          <p className="text-xs text-muted-foreground">
            Conditions: {Object.entries(rule.triggerConditions)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── CreateRuleForm ───────────────────────────────────────────────────────────

function CreateRuleForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [actionType, setActionType] = useState("");
  const [conditionJson, setConditionJson] = useState("");
  const [aiTopicFilter, setAiTopicFilter] = useState("");
  const [aiSentimentFilter, setAiSentimentFilter] = useState("");
  const [payloadJson, setPayloadJson] = useState("{}");
  const [maxRunsPerDay, setMaxRunsPerDay] = useState("3");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      let triggerConditions: any = null;
      let actionPayload: any = {};

      if (conditionJson.trim()) {
        triggerConditions = JSON.parse(conditionJson);
      }
      // Merge quick-select AI filters into conditions object
      if (aiTopicFilter.trim() || aiSentimentFilter) {
        triggerConditions = triggerConditions || {};
        if (aiTopicFilter.trim()) triggerConditions.aiTopic = aiTopicFilter.trim();
        if (aiSentimentFilter) triggerConditions.aiSentiment = aiSentimentFilter;
      }
      actionPayload = JSON.parse(payloadJson || "{}");

      const res = await apiRequest("POST", "/api/automation/rules", {
        name: name.trim(),
        description: description.trim() || undefined,
        triggerType,
        triggerConditions,
        actionType,
        actionPayload,
        maxRunsPerDay: parseInt(maxRunsPerDay) || 3,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] });
      toast({ title: "Automation rule created" });
      setName(""); setDescription(""); setTriggerType(""); setActionType("");
      setConditionJson(""); setAiTopicFilter(""); setAiSentimentFilter("");
      setPayloadJson("{}"); setMaxRunsPerDay("3");
      onCreated();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create rule", description: err.message, variant: "destructive" });
    },
  });

  const payloadPlaceholder = (() => {
    switch (actionType) {
      case AUTOMATION_ACTIONS.SEND_NOTIFICATION:
        return '{\n  "title": "Alert",\n  "body": "{{memoryContent}}",\n  "url": "/dashboard"\n}';
      case AUTOMATION_ACTIONS.CREATE_REMINDER:
        return '{\n  "content": "Take a break",\n  "minutesFromNow": 30\n}';
      case AUTOMATION_ACTIONS.CREATE_AI_ACTION:
        return '{\n  "actionType": "INSIGHT_SURFACE",\n  "title": "Insight from automation",\n  "description": "{{memoryContent}}"\n}';
      case AUTOMATION_ACTIONS.LOG_MEMORY:
        return '{\n  "content": "Automated log: {{memoryContent}}"\n}';
      default:
        return '{}';
    }
  })();

  const conditionPlaceholder = (() => {
    switch (triggerType) {
      case AUTOMATION_TRIGGERS.MOOD_DROPPED:
        return '{ "moodBelow": 4 }';
      case AUTOMATION_TRIGGERS.MOOD_SPIKED:
        return '{ "moodAbove": 8 }';
      case AUTOMATION_TRIGGERS.PERSON_MENTIONED:
        return '{ "personName": "Alice" }';
      case AUTOMATION_TRIGGERS.KEYWORD_DETECTED:
        return '{ "keyword": "stress" }';
      case AUTOMATION_TRIGGERS.DAILY_SCHEDULE:
        return '{ "atHour": 8 }';
      case AUTOMATION_TRIGGERS.MEMORY_LOGGED:
        return '{ "aiSentiment": "negative", "topic": "Health" }';
      default:
        return '';
    }
  })();

  const valid = name.trim() && triggerType && actionType;

  return (
    <div className="space-y-4 p-4 rounded-lg border border-border bg-card">
      <h3 className="font-semibold text-sm flex items-center gap-2">
        <Plus className="w-4 h-4 text-violet-400" />
        New Automation Rule
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Rule Name *</Label>
          <Input
            placeholder="e.g., Notify on low mood"
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Max runs per day</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={maxRunsPerDay}
            onChange={e => setMaxRunsPerDay(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Description (optional)</Label>
        <Input
          placeholder="What does this rule do?"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-amber-400">When (Trigger) *</Label>
          <Select value={triggerType} onValueChange={(v) => {
            const prevTrigger = triggerType;
            setTriggerType(v);
            // daily.schedule should default to once/day to prevent unintended repeated fires.
            // Only auto-adjust if the value hasn't been manually changed from the previous auto-default.
            if (v === AUTOMATION_TRIGGERS.DAILY_SCHEDULE && prevTrigger !== AUTOMATION_TRIGGERS.DAILY_SCHEDULE) {
              setMaxRunsPerDay("1");
            } else if (prevTrigger === AUTOMATION_TRIGGERS.DAILY_SCHEDULE && maxRunsPerDay === "1") {
              setMaxRunsPerDay("3");
            }
          }}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Choose trigger…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-sky-400">Then (Action) *</Label>
          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Choose action…" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACTION_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* AI-aware quick condition controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-violet-400">AI Topic filter</Label>
          <Input
            placeholder='e.g. Health, Work, Family…'
            value={aiTopicFilter}
            onChange={e => setAiTopicFilter(e.target.value)}
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">Matches AI-detected topic tag, not raw text</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-violet-400">AI Sentiment filter</Label>
          <Select value={aiSentimentFilter || "any"} onValueChange={v => setAiSentimentFilter(v === "any" ? "" : v)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Any sentiment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any sentiment</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Sourced from AI mood label (e.g. stressed→negative, happy→positive)</p>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Additional conditions (JSON, optional){conditionPlaceholder && ` — e.g., ${conditionPlaceholder}`}
        </Label>
        <Textarea
          placeholder={conditionPlaceholder || 'e.g. { "keyword": "stress", "moodBelow": 4 }'}
          value={conditionJson}
          onChange={e => setConditionJson(e.target.value)}
          className="text-xs font-mono h-14 resize-none"
        />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Also supports: <code className="bg-muted px-1 rounded">keyword</code> (word-boundary — "stress" catches "stressed"), <code className="bg-muted px-1 rounded">moodBelow</code> / <code className="bg-muted px-1 rounded">moodAbove</code> (1–10), <code className="bg-muted px-1 rounded">personName</code>.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">
          Action Payload (JSON){actionType && ` — template: ${payloadPlaceholder}`}
        </Label>
        <Textarea
          placeholder={payloadPlaceholder}
          value={payloadJson}
          onChange={e => setPayloadJson(e.target.value)}
          className="text-xs font-mono h-20 resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Use <code className="bg-muted px-1 rounded">{"{{memoryContent}}"}</code>, <code className="bg-muted px-1 rounded">{"{{mood}}"}</code>, <code className="bg-muted px-1 rounded">{"{{personName}}"}</code> as template variables.
        </p>
      </div>

      <Button
        size="sm"
        onClick={() => createMutation.mutate()}
        disabled={!valid || createMutation.isPending}
        className="w-full"
      >
        {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
        Create Rule
      </Button>
    </div>
  );
}

// ─── RulesTab ─────────────────────────────────────────────────────────────────

function RulesTab() {
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: rules = [], isLoading } = useQuery<AutomationRule[]>({
    queryKey: ["/api/automation/rules"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/automation/rules");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Automation Rules</p>
          <p className="text-xs text-muted-foreground">{rules.length} rule{rules.length !== 1 ? "s" : ""} configured</p>
        </div>
        <Button
          size="sm"
          variant={showForm ? "outline" : "default"}
          onClick={() => setShowForm(!showForm)}
          className="text-xs h-8 gap-1.5"
        >
          {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? "Cancel" : "New Rule"}
        </Button>
      </div>

      {showForm && (
        <CreateRuleForm onCreated={() => setShowForm(false)} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse rounded-lg border border-border p-3 h-20 bg-muted/20" />
          ))}
        </div>
      ) : rules.length === 0 ? (
        <Card className="glass-card border-white/10">
          <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
            <div className="p-3 rounded-full bg-violet-500/10">
              <Workflow className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <p className="font-medium text-sm">No automation rules yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create If-This-Then-That rules to automate your Keryx experience.
              </p>
            </div>
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create your first rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ["/api/automation/rules"] })}
            />
          ))}
        </div>
      )}

      {/* Info card */}
      {rules.length === 0 && !showForm && (
        <Card className="glass-card border-violet-500/20 bg-violet-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-violet-500" />
              How Automation Rules Work
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p>Automation rules let you build IFTTT-style workflows that trigger automatically when events happen in Keryx.</p>
            <ul className="space-y-1 list-disc list-inside">
              <li><span className="text-amber-400">Triggers</span> — memory logged, mood drops, person mentioned, daily schedule…</li>
              <li><span className="text-sky-400">Actions</span> — send notification, create reminder, queue an AI action…</li>
              <li><span className="text-violet-400">Conditions</span> — optional filters: only fire when mood below 4, or keyword "stressed" appears</li>
            </ul>
            <p className="pt-1">Rules respect a daily run limit to prevent runaway automation.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

// ─── Main Page ────────────────────────────────────────────────────────────────

interface ActionsResponse {
  status: string;
  data: AiAction[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export default function AgentPage() {
  const [mainTab, setMainTab] = useState<"actions" | "rules">("actions");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [timeFilter, setTimeFilter] = useState<string>("all");
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<AiAction[]>([]);
  const filtersRef = useRef({ statusFilter, timeFilter });

  // Reset on filter change
  useEffect(() => {
    const prev = filtersRef.current;
    if (prev.statusFilter !== statusFilter || prev.timeFilter !== timeFilter) {
      filtersRef.current = { statusFilter, timeFilter };
      setOffset(0);
      setAccumulated([]);
    }
  }, [statusFilter, timeFilter]);

  const { data: statsData } = useQuery<{ status: string; data: ActionStats }>({
    queryKey: ["/api/actions/stats"],
    refetchInterval: 30000,
  });

  const { data: actionsData, isLoading, isFetching } = useQuery<ActionsResponse>({
    queryKey: ["/api/actions", statusFilter, timeFilter, offset],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (timeFilter !== "all") params.set("range", timeFilter);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await apiRequest("GET", `/api/actions?${params.toString()}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Merge newly fetched page into accumulated list
  useEffect(() => {
    if (!actionsData?.data) return;
    setAccumulated(prev => {
      const ids = new Set(prev.map(a => a.id));
      const fresh = actionsData.data.filter(a => !ids.has(a.id));
      return offset === 0 ? actionsData.data : [...prev, ...fresh];
    });
  }, [actionsData, offset]);

  const stats = statsData?.data;
  const filteredActions = categoryFilter === "all"
    ? accumulated
    : accumulated.filter(a => a.actionCategory === categoryFilter);

  const categories = Array.from(new Set(accumulated.map(a => a.actionCategory))).sort();
  const hasMore = actionsData?.hasMore ?? false;
  const total = actionsData?.total ?? 0;

  // After any approve/reject/rollback, reload from page 0 for consistency
  const handleMutated = () => {
    setOffset(0);
    setAccumulated([]);
  };

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">

        {/* Page header */}
        <div className="glass-card p-5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-indigo-500 flex items-center justify-center flex-shrink-0">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-foreground">Agent Activity</h1>
            <p className="text-xs text-muted-foreground">Full history of every AI action proposed or taken</p>
          </div>
          {stats && stats.pendingCount > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 flex-shrink-0">
              {stats.pendingCount} pending
            </Badge>
          )}
        </div>

        {/* Stats row */}
        {stats && mainTab === "actions" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="glass-card border-white/10">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-xl font-bold">{stats.pendingCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-white/10">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Done Today</p>
                  <p className="text-xl font-bold">{stats.completedToday}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.completedTotal} total</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-white/10">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <XCircle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed Today</p>
                  <p className="text-xl font-bold">{stats.failedToday}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.failedTotal} total</p>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card border-white/10">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted/20">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Rejected Today</p>
                  <p className="text-xl font-bold">{stats.rejectedToday}</p>
                  <p className="text-[10px] text-muted-foreground">{stats.rejectedTotal} total</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main tabs: Actions vs Rules */}
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as "actions" | "rules")}>
          <TabsList className="w-full bg-muted/30 p-1 h-auto">
            <TabsTrigger value="actions" className="flex-1 text-xs data-[state=active]:bg-background gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Actions
              {stats && stats.pendingCount > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {stats.pendingCount > 9 ? "9+" : stats.pendingCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="rules" className="flex-1 text-xs data-[state=active]:bg-background gap-1.5">
              <Workflow className="w-3.5 h-3.5" />
              Automations
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── Actions Tab ── */}
        {mainTab === "actions" && (
          <>
            {/* Status + time filters */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <Tabs value={statusFilter} onValueChange={setStatusFilter} className="flex-1">
                <TabsList className="w-full justify-start gap-1 bg-muted/30 p-1 h-auto flex-wrap">
                  {[
                    { value: "all", label: "All" },
                    { value: "pending", label: "Pending" },
                    { value: "completed", label: "Done" },
                    { value: "rejected", label: "Rejected" },
                    { value: "failed", label: "Failed" },
                  ].map(tab => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="text-xs px-3 py-1.5 data-[state=active]:bg-background"
                      data-testid={`filter-status-${tab.value}`}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Time range selector */}
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger
                  className="h-8 text-xs w-28 border-white/20 bg-transparent flex-shrink-0"
                  data-testid="filter-time"
                >
                  <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today" className="text-xs">Today</SelectItem>
                  <SelectItem value="7d" className="text-xs">7 days</SelectItem>
                  <SelectItem value="30d" className="text-xs">30 days</SelectItem>
                  <SelectItem value="all" className="text-xs">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category filter */}
            {categories.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <Button
                  size="sm"
                  variant={categoryFilter === "all" ? "default" : "outline"}
                  className="text-xs h-7 flex-shrink-0"
                  onClick={() => setCategoryFilter("all")}
                >
                  All categories
                </Button>
                {categories.map(cat => {
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <Button
                      key={cat}
                      size="sm"
                      variant={categoryFilter === cat ? "default" : "outline"}
                      className="text-xs h-7 flex-shrink-0 flex items-center gap-1.5"
                      onClick={() => setCategoryFilter(cat)}
                    >
                      {cfg && (() => { const Icon = cfg.icon; return <Icon className={`w-3 h-3 ${cfg.color}`} />; })()}
                      {cfg?.label || cat}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Actions list */}
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse rounded-lg border border-border p-3">
                    <div className="flex gap-3">
                      <div className="w-4 h-4 bg-muted rounded mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredActions.length === 0 ? (
              <Card className="glass-card border-white/10">
                <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
                  <div className="p-3 rounded-full bg-violet-500/10">
                    <Eye className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">No actions here yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {statusFilter === "pending"
                        ? "All clear — Keryx has no pending proposals for you right now."
                        : "Actions will appear as Keryx detects opportunities to help."}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/voice">Log a memory to trigger detection</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {total > 0
                    ? `Showing ${filteredActions.length} of ${total} action${total !== 1 ? "s" : ""}`
                    : `${filteredActions.length} action${filteredActions.length !== 1 ? "s" : ""}`}
                  {categoryFilter !== "all" ? ` in ${CATEGORY_CONFIG[categoryFilter]?.label || categoryFilter}` : ""}
                </p>
                {/* Build nested tree: root actions first, descendants indented recursively */}
                {(() => {
                  const childrenByParent = new Map<string, AiAction[]>();
                  const rootActions: AiAction[] = [];
                  const allIds = new Set(filteredActions.map(a => a.id));

                  for (const a of filteredActions) {
                    const parentId = a.parentActionId;
                    // Treat as root if no parent, or parent not in the current page (orphan)
                    if (!parentId || !allIds.has(parentId)) {
                      rootActions.push(a);
                    } else {
                      const arr = childrenByParent.get(parentId) || [];
                      arr.push(a);
                      childrenByParent.set(parentId, arr);
                    }
                  }

                  // Recursive render: renders a node + all its descendants
                  function renderNode(action: AiAction, depth: number): JSX.Element[] {
                    const children = childrenByParent.get(action.id) || [];
                    const isChild = depth > 0 || !!action.parentActionId;
                    const indentStyle = depth > 0 ? 'pl-4 border-l border-violet-500/20 ml-2' : '';
                    return [
                      <div key={action.id} className={indentStyle}>
                        <ActionCard action={action} onMutated={handleMutated} isChild={isChild} />
                      </div>,
                      ...children.flatMap(child => renderNode(child, depth + 1)),
                    ];
                  }

                  return rootActions.flatMap(action => renderNode(action, 0));
                })()}
                {hasMore && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    disabled={isFetching}
                    onClick={() => setOffset(o => o + PAGE_SIZE)}
                  >
                    {isFetching ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Loading...</>
                    ) : (
                      "Load more"
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Info card for empty state */}
            {!isLoading && accumulated.length === 0 && (
              <Card className="glass-card border-violet-500/20 bg-violet-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-500" />
                    How Agent Activity Works
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <p>Keryx continuously scans your memories, patterns, and data to propose actions on your behalf.</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li><span className="text-amber-400">Calendar</span> — detects events you mention logging</li>
                    <li><span className="text-sky-400">People</span> — notices when relationships need attention</li>
                    <li><span className="text-emerald-400">Goals</span> — suggests progress updates from memory evidence</li>
                    <li><span className="text-violet-400">System</span> — surfaces proactive insights and pattern alerts</li>
                  </ul>
                  <p className="pt-1">All actions require your approval before executing — you stay in control.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── Rules Tab ── */}
        {mainTab === "rules" && <RulesTab />}
      </div>
    </AppLayout>
  );
}
