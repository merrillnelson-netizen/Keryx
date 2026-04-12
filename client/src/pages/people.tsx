import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, User, MessageSquare, Edit2, Trash2, LayoutGrid, Table as TableIcon, Merge, X, Sparkles, Search, Loader2, Brain, MessagesSquare, Phone, Mic, MicOff, ScanSearch, Shield, ShieldAlert, ShieldQuestion, BookOpen, MessageCircle, Activity } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogEntry, Person } from "@shared/schema";
import { getPriorityInfo, DEFAULT_PRIORITY_VALUE } from "@shared/priority-utils";
import { useVoiceInput } from "@/hooks/use-voice-input";

const RELATIONSHIP_OPTIONS = [
  "friend",
  "family",
  "colleague",
  "client",
  "acquaintance",
  "partner",
  "mentor",
  "other",
];

export default function People() {
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [deletingPerson, setDeletingPerson] = useState<Person | null>(null);
  const [editName, setEditName] = useState("");
  const [editRelationship, setEditRelationship] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editPriority, setEditPriority] = useState(DEFAULT_PRIORITY_VALUE);
  const [editAliases, setEditAliases] = useState<string[]>([]);
  const [editAliasInput, setEditAliasInput] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<{
    sortFields: Array<{ field: string; direction: 'asc' | 'desc' }>;
    filterIds: string[] | null;
    message: string;
  } | null>(null);
  const [duplicateGroups, setDuplicateGroups] = useState<Array<{
    ids: string[];
    reason: string;
    suggestedTargetId: string;
    confidence: 'high' | 'medium' | 'low';
  }>>([]);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [dismissedGroups, setDismissedGroups] = useState<Set<number>>(new Set());
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isListening: isVoiceListening, isSupported: isVoiceSupported, startListening: startVoiceInput, stopListening: stopVoiceInput } = useVoiceInput(
    useCallback((text: string) => setAiQuery(text), [])
  );

  const { data: people = [], isLoading } = useQuery<Person[]>({
    queryKey: ["/api/people"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const [personDialogTab, setPersonDialogTab] = useState<"memories" | "messages">("memories");

  const { data: mentions = [], isLoading: mentionsLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/people", selectedPerson?.name, "mentions"],
    queryFn: async () => {
      if (!selectedPerson?.name) throw new Error("No person selected");
      const response = await fetch(`/api/people/${encodeURIComponent(selectedPerson.name)}/mentions`, {
        credentials: "include",
      });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      const json = await response.json();
      return json.data || [];
    },
    enabled: !!selectedPerson,
    staleTime: 1000 * 60 * 5,
  });

  interface PersonMessage {
    id: string;
    body: string | null;
    senderName: string | null;
    direction: string;
    timestamp: string;
    conversationId: string;
    mood: string | null;
  }
  interface PersonConversationResult {
    conversation: { id: string; contactName: string | null; contactAddress: string; platform: string };
    messages: PersonMessage[];
  }

  const { data: personMessages, isLoading: personMessagesLoading } = useQuery<{ status: string; data: PersonConversationResult[] }>({
    queryKey: ["/api/people", selectedPerson?.id, "messages"],
    queryFn: async () => {
      if (!selectedPerson?.id) throw new Error("No person selected");
      const response = await fetch(`/api/people/${selectedPerson.id}/messages`, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    enabled: !!selectedPerson && personDialogTab === "messages",
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const allPersonMessages: PersonMessage[] = (personMessages?.data ?? []).flatMap(r => r.messages)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalPersonMessageCount = allPersonMessages.length;

  const updatePersonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; relationship?: string; notes?: string; priority?: number } }) => {
      const response = await apiRequest("PATCH", `/api/people/${id}`, data);
      if (!response.ok) throw new Error("Failed to update person");
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: data?.merged ? "Records merged" : "Person updated",
        description: data?.message || "Details have been saved successfully",
      });
      setEditingPerson(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update person. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deletePersonMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/people/${id}`, {});
      if (!response.ok) throw new Error("Failed to delete person");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: "Person deleted",
        description: "Entry has been removed successfully",
      });
      setDeletingPerson(null);
      if (selectedPerson?.id === deletingPerson?.id) {
        setSelectedPerson(null);
      }
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete person. Please try again.",
        variant: "destructive",
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ targetId, sourceIds }: { targetId: string; sourceIds: string[] }) => {
      const response = await apiRequest("POST", "/api/people/merge", { targetId, sourceIds });
      if (!response.ok) throw new Error("Failed to merge people");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: "People merged",
        description: data.message || "Successfully consolidated records",
      });
      setMergeMode(false);
      setSelectedForMerge(new Set());
      setMergeTarget(null);
      setSelectedPerson(null);
    },
    onError: () => {
      toast({
        title: "Merge failed",
        description: "Failed to merge people. Please try again.",
        variant: "destructive",
      });
    },
  });

  const aiSearchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest("POST", "/api/people/ai-search", { query: searchQuery });
      if (!response.ok) throw new Error("AI search failed");
      return response.json();
    },
    onSuccess: (data) => {
      setAiResult(data.data);
    },
    onError: () => {
      toast({
        title: "AI search failed",
        description: "Could not process your search. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAiSearch = () => {
    if (aiQuery.trim()) {
      aiSearchMutation.mutate(aiQuery.trim());
    }
  };

  const handleClearAiSearch = () => {
    setAiQuery("");
    setAiResult(null);
  };


  const findDuplicatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/people/find-duplicates", {});
      if (!response.ok) throw new Error("Failed to find duplicates");
      return response.json();
    },
    onSuccess: (data) => {
      const groups = data.data?.groups || [];
      setDuplicateGroups(groups);
      setShowDuplicates(true);
      setDismissedGroups(new Set());
      if (groups.length === 0) {
        toast({ title: "No duplicates found", description: data.data?.message || "All records look unique!" });
      } else {
        toast({ title: "Duplicates found", description: `Found ${groups.length} potential duplicate group(s)` });
      }
    },
    onError: () => {
      toast({ title: "Detection failed", description: "Could not scan for duplicates. Please try again.", variant: "destructive" });
    },
  });

  const duplicateMergeMutation = useMutation({
    mutationFn: async ({ targetId, sourceIds }: { targetId: string; sourceIds: string[] }) => {
      const response = await apiRequest("POST", "/api/people/merge", { targetId, sourceIds });
      if (!response.ok) throw new Error("Failed to merge people");
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({ title: "People merged", description: data.message || "Successfully consolidated records" });
      setDuplicateGroups(prev => prev.filter(g => !g.ids.includes(variables.targetId)));
    },
    onError: () => {
      toast({ title: "Merge failed", description: "Failed to merge people. Please try again.", variant: "destructive" });
    },
  });

  const handleDuplicateMerge = (group: typeof duplicateGroups[0], targetId: string) => {
    const sourceIds = group.ids.filter(id => id !== targetId);
    duplicateMergeMutation.mutate({ targetId, sourceIds });
  };

  const handleDismissGroup = (index: number) => {
    setDismissedGroups(prev => { const next = new Set(prev); next.add(index); return next; });
  };

  const displayPeople = useMemo(() => {
    let result = [...people];
    
    if (aiResult) {
      if (aiResult.filterIds) {
        const idSet = new Set(aiResult.filterIds);
        result = result.filter(p => idSet.has(p.id));
      }
      
      if (aiResult.sortFields && aiResult.sortFields.length > 0) {
        const getSortValue = (person: Person, field: string): any => {
          switch (field) {
            case 'name': return person.name.toLowerCase();
            case 'relationship': return (person.relationship || '').toLowerCase();
            case 'priority': return person.priority || 0;
            case 'mentionCount': return person.mentionCount || 0;
            case 'source': return person.source || 'memory';
            case 'lastMentioned': return person.lastMentioned ? new Date(person.lastMentioned).getTime() : 0;
            case 'firstMentioned': return person.firstMentioned ? new Date(person.firstMentioned).getTime() : 0;
            default: return 0;
          }
        };

        result.sort((a, b) => {
          for (const { field, direction } of aiResult.sortFields) {
            const valA = getSortValue(a, field);
            const valB = getSortValue(b, field);
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }
    }
    
    return result;
  }, [people, aiResult]);

  const handleToggleMergeSelection = (personId: string) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
        if (mergeTarget === personId) {
          setMergeTarget(null);
        }
      } else {
        next.add(personId);
      }
      return next;
    });
  };

  const handleSetMergeTarget = (personId: string) => {
    if (selectedForMerge.has(personId)) {
      setMergeTarget(personId);
    }
  };

  const handleExecuteMerge = () => {
    if (!mergeTarget || selectedForMerge.size < 2) {
      toast({
        title: "Cannot merge",
        description: "Select at least 2 people and choose one as the target",
        variant: "destructive",
      });
      return;
    }
    setShowMergeConfirm(true);
  };

  const handleConfirmMerge = () => {
    if (!mergeTarget) return;
    const sourceIds = Array.from(selectedForMerge).filter(id => id !== mergeTarget);
    mergeMutation.mutate({ targetId: mergeTarget, sourceIds });
    setShowMergeConfirm(false);
  };

  const handleCancelMerge = () => {
    setMergeMode(false);
    setSelectedForMerge(new Set());
    setMergeTarget(null);
  };

  const handleEdit = (person: Person) => {
    setEditingPerson(person);
    setEditName(person.name);
    setEditRelationship(person.relationship || "");
    setEditNotes(person.notes || "");
    setEditPriority(person.priority || DEFAULT_PRIORITY_VALUE);
    setEditAliases(person.aliases || []);
    setEditAliasInput("");
  };

  const handleAddAlias = () => {
    const trimmed = editAliasInput.trim();
    if (trimmed && !editAliases.includes(trimmed)) {
      setEditAliases(prev => [...prev, trimmed]);
      setEditAliasInput("");
    }
  };

  const handleRemoveAlias = (alias: string) => {
    setEditAliases(prev => prev.filter(a => a !== alias));
  };

  const handleSaveEdit = () => {
    if (editingPerson) {
      const data: Record<string, any> = { priority: editPriority, aliases: editAliases };
      if (editName && editName !== editingPerson.name) data.name = editName;
      if (editRelationship) data.relationship = editRelationship;
      if (editNotes) data.notes = editNotes;
      updatePersonMutation.mutate({ id: editingPerson.id, data });
    }
  };

  const getSourceInfo = (source: string) => {
    switch (source) {
      case 'memory': return { label: 'Memory', icon: Brain, color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' };
      case 'messages': return { label: 'Messages', icon: MessagesSquare, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
      case 'both': return { label: 'Both', icon: Users, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
      case 'manual': return { label: 'Manual', icon: Edit2, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
      default: return { label: 'Unknown', icon: User, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30' };
    }
  };

  const getPriorityLabelInfo = (priority: number) => {
    const info = getPriorityInfo(priority);
    return { label: info.label, color: info.bgClass };
  };

  const getVelocityTierInfo = (tier: string | null | undefined) => {
    switch (tier) {
      case "high":
        return {
          label: "High",
          className: "bg-green-500/15 text-green-400 border-green-500/30",
          tooltip: "Active — 5+ mentions in the last 30 days",
          dotClass: "bg-green-400 animate-pulse",
        };
      case "medium":
        return {
          label: "Medium",
          className: "bg-amber-500/15 text-amber-400 border-amber-500/30",
          tooltip: "Moderate — 1–4 mentions in the last 30 days",
          dotClass: "bg-amber-400",
        };
      default:
        return {
          label: "Acquaintance",
          className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
          tooltip: "Acquaintance — no mentions in the last 30 days",
          dotClass: "bg-slate-400",
        };
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading people...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className={cn("space-y-6 animate-fade-in", mergeMode && selectedForMerge.size >= 2 && "pb-24")}>
        {/* Header Section */}
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-500 flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">People in Your Memories</h2>
                <p className="text-sm text-muted-foreground">
                  {people.length} people mentioned across your memories
                </p>
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
              {people.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (mergeMode) {
                      handleCancelMerge();
                    } else {
                      setMergeMode(true);
                    }
                  }}
                  className={cn(
                    "h-9 w-9 p-0 transition-all",
                    mergeMode
                      ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                  )}
                  title={mergeMode ? "Exit merge mode" : "Merge people"}
                  data-testid="button-merge-mode"
                >
                  <Merge className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
          
          {mergeMode && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-300 font-medium">Merge Mode Active</p>
              <p className="text-xs text-muted-foreground mt-1">
                Tap people to select them, then use the bar at the bottom to merge. You can also use AI to find duplicates.
              </p>
            </div>
          )}
        </div>

        {people.length > 0 && (
          <div className="glass-card p-4 rounded-2xl">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                  placeholder={mergeMode ? "Search or say 'find duplicates'..." : "Ask AI: sort by closeness, show family, find duplicates..."}
                  className="pl-9 pr-9 bg-white/5 border-white/20 focus:border-primary/50"
                  data-testid="ai-search-input"
                />
                {aiQuery && (
                  <button
                    type="button"
                    onClick={() => setAiQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Clear text"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {isVoiceSupported && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={isVoiceListening ? stopVoiceInput : startVoiceInput}
                  className={cn(
                    "shrink-0 h-10 w-10 transition-all",
                    isVoiceListening
                      ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/10"
                  )}
                  title={isVoiceListening ? "Stop listening" : "Voice input"}
                  data-testid="voice-input-button"
                >
                  {isVoiceListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
              <Button
                onClick={handleAiSearch}
                disabled={!aiQuery.trim() || aiSearchMutation.isPending}
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 gap-2 shrink-0"
                data-testid="ai-search-button"
              >
                {aiSearchMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">AI Search</span>
              </Button>
              <Button
                onClick={() => findDuplicatesMutation.mutate()}
                disabled={findDuplicatesMutation.isPending}
                className="bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-90 gap-2 shrink-0"
                title="AI finds potential duplicate records"
                data-testid="find-duplicates-button"
              >
                {findDuplicatesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ScanSearch className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Find Duplicates</span>
              </Button>
              {aiResult && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearAiSearch}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  data-testid="ai-search-clear"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
            {aiResult && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-purple-300">{aiResult.message}</span>
                <Badge variant="outline" className="text-xs ml-auto bg-purple-500/10 text-purple-400 border-purple-500/30">
                  {displayPeople.length} of {people.length}
                </Badge>
              </div>
            )}
          </div>
        )}

        {showDuplicates && duplicateGroups.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <ScanSearch className="w-5 h-5 text-amber-400" />
                Potential Duplicates
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowDuplicates(false); setDuplicateGroups([]); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 mr-1" />
                Dismiss All
              </Button>
            </div>
            {duplicateGroups.map((group, index) => {
              if (dismissedGroups.has(index)) return null;
              const groupPeople = group.ids.map(id => people.find(p => p.id === id)).filter(Boolean) as Person[];
              if (groupPeople.length < 2) return null;
              const ConfidenceIcon = group.confidence === 'high' ? ShieldAlert : group.confidence === 'medium' ? Shield : ShieldQuestion;
              const confidenceColor = group.confidence === 'high' ? 'text-red-400' : group.confidence === 'medium' ? 'text-amber-400' : 'text-blue-400';
              const confidenceBg = group.confidence === 'high' ? 'bg-red-500/10 border-red-500/30' : group.confidence === 'medium' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-blue-500/10 border-blue-500/30';
              return (
                <div key={index} className={cn("glass-card p-4 rounded-xl border", confidenceBg)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ConfidenceIcon className={cn("w-4 h-4", confidenceColor)} />
                      <Badge variant="outline" className={cn("text-xs capitalize", confidenceBg, confidenceColor)}>
                        {group.confidence} confidence
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismissGroup(index)}
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{group.reason}</p>
                  <div className="grid gap-2">
                    {groupPeople.map(person => {
                      const isTarget = group.suggestedTargetId === person.id;
                      return (
                        <div
                          key={person.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg border transition-all",
                            isTarget
                              ? "bg-primary/10 border-primary/30"
                              : "bg-white/5 border-white/10"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground truncate">{person.name}</span>
                                {isTarget && (
                                  <Badge className="bg-primary/20 text-primary border-primary/30 text-xs shrink-0">
                                    Keep
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                {person.phoneNumber && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {person.phoneNumber}
                                  </span>
                                )}
                                {person.relationship && <span>{person.relationship}</span>}
                                <span>{person.mentionCount} mentions</span>
                              </div>
                            </div>
                          </div>
                          {!isTarget && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDuplicateGroups(prev => prev.map((g, i) =>
                                  i === index ? { ...g, suggestedTargetId: person.id } : g
                                ));
                              }}
                              className="text-xs h-7 px-2 border-white/20 hover:bg-white/10 shrink-0 ml-2"
                            >
                              Set as Keep
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mt-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDismissGroup(index)}
                      className="border-white/20 hover:bg-white/10"
                    >
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDuplicateMerge(group, group.suggestedTargetId)}
                      disabled={duplicateMergeMutation.isPending}
                      className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-1"
                    >
                      <Merge className="w-3.5 h-3.5" />
                      {duplicateMergeMutation.isPending ? "Merging..." : "Merge"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {people.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No people tracked yet</h3>
            <p className="text-muted-foreground">
              When you mention people in your memories, they'll appear here
            </p>
          </div>
        ) : displayPeople.length === 0 && aiResult ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No matches found</h3>
            <p className="text-muted-foreground mb-4">{aiResult.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAiSearch}
              className="border-white/20 hover:bg-white/10"
            >
              Clear Search
            </Button>
          </div>
        ) : viewMode === "table" ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    {mergeMode && <TableHead className="w-[50px] text-foreground font-semibold">Select</TableHead>}
                    <TableHead className="w-[200px] text-foreground font-semibold">Name</TableHead>
                    <TableHead className="w-[80px] text-foreground font-semibold">Priority</TableHead>
                    <TableHead className="w-[90px] text-foreground font-semibold">Activity</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold">Relationship</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Mentions</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Source</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold">Last Mentioned</TableHead>
                    <TableHead className="min-w-[200px] text-foreground font-semibold">Notes</TableHead>
                    <TableHead className="w-[90px] text-right text-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayPeople.map((person) => (
                    <TableRow 
                      key={person.id} 
                      data-testid={`person-row-${person.id}`}
                      className={cn(
                        "border-white/10 hover:bg-white/5 transition-colors cursor-pointer",
                        !mergeMode && selectedPerson?.id === person.id && "bg-primary/10",
                        mergeMode && selectedForMerge.has(person.id) && "bg-primary/10",
                        mergeMode && mergeTarget === person.id && "bg-amber-500/10"
                      )}
                      onClick={() => {
                        if (mergeMode) {
                          handleToggleMergeSelection(person.id);
                        } else {
                          setSelectedPerson(person);
                        }
                      }}
                    >
                      {mergeMode && (
                        <TableCell className="w-[50px]">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              checked={selectedForMerge.has(person.id)}
                              onCheckedChange={() => handleToggleMergeSelection(person.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5"
                            />
                            {mergeTarget === person.id && (
                              <span className="text-amber-500 text-sm">★</span>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="font-medium" data-testid={`name-cell-${person.id}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              {person.name}
                              {mergeMode && mergeTarget === person.id && (
                                <Badge className="ml-1 bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                                  Target
                                </Badge>
                              )}
                            </div>
                            {person.phoneNumber && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
                                {person.phoneNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell data-testid={`priority-cell-${person.id}`}>
                        <Badge variant="outline" className={cn("text-xs", getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).color)}>
                          {getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).label}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`velocity-cell-${person.id}`}>
                        {(() => {
                          const vt = getVelocityTierInfo(person.velocityTier);
                          return (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={cn("text-xs gap-1 cursor-default", vt.className)}>
                                    <span className={cn("w-1.5 h-1.5 rounded-full inline-block", vt.dotClass)} />
                                    {vt.label}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs">
                                  <p><strong>Activity tier:</strong> {vt.tooltip}</p>
                                  <p className="text-muted-foreground mt-1">Advisory only — does not change priority.</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                      </TableCell>
                      <TableCell data-testid={`relationship-cell-${person.id}`}>
                        {person.relationship ? (
                          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
                            {person.relationship}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell data-testid={`mentions-cell-${person.id}`}>
                        <Badge variant="secondary" className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                          {person.mentionCount}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`source-cell-${person.id}`}>
                        {(() => {
                          const src = getSourceInfo(person.source || 'memory');
                          const Icon = src.icon;
                          return (
                            <Badge variant="outline" className={cn("text-xs gap-1", src.color)}>
                              <Icon className="w-3 h-3" />
                              {src.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`last-mentioned-cell-${person.id}`}>
                        {new Date(person.lastMentioned).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" data-testid={`notes-cell-${person.id}`}>
                        {person.notes || "-"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {mergeMode ? (
                          selectedForMerge.has(person.id) && mergeTarget !== person.id ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetMergeTarget(person.id);
                              }}
                              className="text-xs h-7 px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                            >
                              Set as Target
                            </Button>
                          ) : null
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(person);
                              }}
                              className="h-8 w-8 p-0 hover:bg-white/10"
                              data-testid={`edit-button-${person.id}`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingPerson(person);
                              }}
                              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                              data-testid={`delete-button-${person.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayPeople.map((person) => (
              <Card 
                key={person.id} 
                data-testid={`person-card-${person.id}`}
                className={cn(
                  "glass-card border-white/20 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]",
                  mergeMode && selectedForMerge.has(person.id) && "ring-2 ring-primary",
                  mergeMode && mergeTarget === person.id && "ring-2 ring-amber-500"
                )}
                onClick={() => {
                  if (mergeMode) {
                    handleToggleMergeSelection(person.id);
                  } else {
                    setSelectedPerson(person);
                  }
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {mergeMode ? (
                        <div className="relative">
                          <Checkbox 
                            checked={selectedForMerge.has(person.id)}
                            onCheckedChange={() => handleToggleMergeSelection(person.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5"
                          />
                          {mergeTarget === person.id && (
                            <span className="absolute -top-1 -right-1 text-amber-500 text-xs">★</span>
                          )}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {person.name}
                          {mergeMode && mergeTarget === person.id && (
                            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                              Target
                            </Badge>
                          )}
                        </CardTitle>
                        {person.phoneNumber && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {person.phoneNumber}
                          </p>
                        )}
                        {person.relationship && (
                          <Badge variant="outline" className="mt-1 text-xs border-primary/30 text-primary">
                            {person.relationship}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {!mergeMode && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(person);
                          }}
                          className="h-8 w-8 p-0 hover:bg-white/10"
                          data-testid={`edit-person-${person.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingPerson(person);
                          }}
                          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                          data-testid={`delete-person-${person.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {mergeMode && selectedForMerge.has(person.id) && mergeTarget !== person.id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetMergeTarget(person.id);
                        }}
                        className="text-xs h-7 px-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                      >
                        Set as Target
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-4 h-4" />
                      <span>{person.mentionCount} mentions</span>
                    </div>
                    <Badge variant="outline" className={cn("text-xs", getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).color)}>
                      {getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).label}
                    </Badge>
                    {(() => {
                      const vt = getVelocityTierInfo(person.velocityTier);
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className={cn("text-xs gap-1 cursor-default", vt.className)}>
                                <span className={cn("w-1.5 h-1.5 rounded-full inline-block", vt.dotClass)} />
                                {vt.label}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs max-w-xs">
                              <p><strong>Activity tier:</strong> {vt.tooltip}</p>
                              <p className="text-muted-foreground mt-1">This shows recent contact frequency — it doesn't change your priority setting.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                    {(() => {
                      const src = getSourceInfo(person.source || 'memory');
                      const Icon = src.icon;
                      return (
                        <Badge variant="outline" className={cn("text-xs gap-1", src.color)}>
                          <Icon className="w-3 h-3" />
                          {src.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  {person.notes && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {person.notes}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Last mentioned: {new Date(person.lastMentioned).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      </div>

      {mergeMode && selectedForMerge.size >= 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-md border-t border-white/10 shadow-2xl" data-testid="floating-merge-bar">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <Badge className="bg-primary/20 text-primary border-primary/30 text-sm px-3 py-1">
                  {selectedForMerge.size} selected
                </Badge>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin pb-1">
                  {Array.from(selectedForMerge).map(id => {
                    const person = people.find(p => p.id === id);
                    if (!person) return null;
                    return (
                      <Badge
                        key={id}
                        variant="outline"
                        className={cn(
                          "cursor-pointer whitespace-nowrap shrink-0 transition-all",
                          mergeTarget === id
                            ? "bg-amber-500/20 border-amber-500 text-amber-400"
                            : "bg-white/10 border-white/20 hover:bg-white/20"
                        )}
                        onClick={() => handleSetMergeTarget(id)}
                      >
                        {mergeTarget === id && "★ "}
                        {person.name}
                      </Badge>
                    );
                  })}
                </div>
                {!mergeTarget && selectedForMerge.size >= 2 && (
                  <p className="text-xs text-amber-400 mt-1">Tap a name above to set it as the target (record to keep)</p>
                )}
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedForMerge(new Set());
                    setMergeTarget(null);
                  }}
                  className="border-white/20 hover:bg-white/10 gap-1"
                  data-testid="floating-clear-button"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear
                </Button>
                <Button
                  size="sm"
                  onClick={handleExecuteMerge}
                  disabled={selectedForMerge.size < 2 || !mergeTarget || mergeMutation.isPending}
                  className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-1"
                  data-testid="floating-merge-button"
                >
                  <Merge className="w-3.5 h-3.5" />
                  {mergeMutation.isPending ? "Merging..." : "Merge"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Person Detail Dialog — Memories + Messages tabs */}
      <Dialog open={!!selectedPerson} onOpenChange={(open) => { if (!open) { setSelectedPerson(null); setPersonDialogTab("memories"); } }}>
        <DialogContent className="glass-card-strong border-white/20 max-w-lg max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-4 pb-3 border-b border-white/10 flex-shrink-0">
            <DialogTitle className="flex items-center gap-3 pr-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg truncate">{selectedPerson?.name}</span>
                  {selectedPerson?.relationship && (
                    <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30 text-xs flex-shrink-0">
                      {selectedPerson.relationship}
                    </Badge>
                  )}
                </div>
              </div>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Memories and messages for {selectedPerson?.name}
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-white/10 flex-shrink-0">
            <button
              onClick={() => setPersonDialogTab("memories")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                personDialogTab === "memories"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BookOpen className="w-4 h-4" />
              Memories
              {mentions.length > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{mentions.length}</Badge>
              )}
            </button>
            <button
              onClick={() => setPersonDialogTab("messages")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
                personDialogTab === "messages"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageCircle className="w-4 h-4" />
              Messages
              {personDialogTab === "messages" && totalPersonMessageCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{totalPersonMessageCount}</Badge>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Memories Tab */}
            {personDialogTab === "memories" && (
              <>
                {mentionsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : !mentions.length ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No memories found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mentions.map((entry: LogEntry) => (
                      <div
                        key={entry.id}
                        className="glass-card p-3 rounded-lg border border-white/10"
                        data-testid={`mention-${entry.id}`}
                      >
                        <p className="text-foreground text-sm">{entry.memoryText}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs border-white/20">
                            {new Date(entry.timestamp!).toLocaleDateString()}
                          </Badge>
                          <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30">
                            {entry.topicTag}
                          </Badge>
                          {entry.mood && (
                            <Badge variant="outline" className="text-xs border-white/20">
                              {entry.mood}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Messages Tab */}
            {personDialogTab === "messages" && (
              <>
                {personMessagesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : allPersonMessages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No messages found</p>
                    <p className="text-xs mt-1">Messages are matched by name or phone number</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {allPersonMessages.map((msg) => (
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
                            <p className="text-[10px] font-medium mb-0.5 text-muted-foreground">
                              {msg.senderName}
                            </p>
                          )}
                          <p className="text-sm">{msg.body || "(no content)"}</p>
                          <p className={cn(
                            "text-[10px] mt-1",
                            msg.direction === "sent" ? "text-primary-foreground/60" : "text-muted-foreground"
                          )}>
                            {new Date(msg.timestamp).toLocaleString([], {
                              month: "short", day: "numeric",
                              hour: "2-digit", minute: "2-digit"
                            })}
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

      {/* Edit Person Dialog */}
      <Dialog open={!!editingPerson} onOpenChange={() => setEditingPerson(null)}>
        <DialogContent className="glass-card-strong border-white/20">
          <DialogHeader>
            <DialogTitle>Edit Person Details</DialogTitle>
            <DialogDescription>
              Update details for {editingPerson?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Person's name"
                className="glass-card border-white/20"
                data-testid="input-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship</Label>
              <Select value={editRelationship} onValueChange={setEditRelationship}>
                <SelectTrigger className="glass-card border-white/20" data-testid="select-relationship">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent className="glass-card border-primary/20">
                  {RELATIONSHIP_OPTIONS.map((rel) => (
                    <SelectItem key={rel} value={rel}>
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="priority">Priority (Closeness Score)</Label>
              <Select value={editPriority.toString()} onValueChange={(v) => setEditPriority(parseInt(v))}>
                <SelectTrigger className="glass-card border-white/20" data-testid="select-priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="glass-card border-primary/20">
                  <SelectItem value="10">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      10 - VIP (spouse, partner)
                    </span>
                  </SelectItem>
                  <SelectItem value="9">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                      9 - Critical (close family, business partners)
                    </span>
                  </SelectItem>
                  <SelectItem value="8">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      8 - High (close friends, key colleagues)
                    </span>
                  </SelectItem>
                  <SelectItem value="7">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      7 - Important (good friends, team members)
                    </span>
                  </SelectItem>
                  <SelectItem value="6">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-lime-500" />
                      6 - Moderate (regular contacts)
                    </span>
                  </SelectItem>
                  <SelectItem value="5">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      5 - Standard (default)
                    </span>
                  </SelectItem>
                  <SelectItem value="4">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-teal-500" />
                      4 - Low (infrequent contacts)
                    </span>
                  </SelectItem>
                  <SelectItem value="3">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      3 - Minimal (rare contacts)
                    </span>
                  </SelectItem>
                  <SelectItem value="2">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      2 - Background (historical)
                    </span>
                  </SelectItem>
                  <SelectItem value="1">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      1 - Archive (inactive)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                People with priority 8+ will trigger High-Signal Alerts when mentioned in discoveries.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Also known as (aliases)</Label>
              <p className="text-xs text-muted-foreground">
                Aliases let past memories under old names still count toward this person's mentions.
              </p>
              {editAliases.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editAliases.map(alias => (
                    <Badge
                      key={alias}
                      variant="secondary"
                      className="bg-primary/20 text-primary border-primary/30 pr-1 gap-1"
                    >
                      {alias}
                      <button
                        type="button"
                        onClick={() => handleRemoveAlias(alias)}
                        className="ml-0.5 rounded-full hover:bg-primary/30 p-0.5"
                        aria-label={`Remove alias ${alias}`}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={editAliasInput}
                  onChange={(e) => setEditAliasInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddAlias(); } }}
                  placeholder="Add an alias..."
                  className="glass-card border-white/20 flex-1"
                  data-testid="input-alias"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddAlias}
                  disabled={!editAliasInput.trim()}
                  className="border-white/20"
                >
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add notes about this person..."
                className="min-h-[100px] glass-card border-white/20"
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingPerson(null)}
              className="border-white/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updatePersonMutation.isPending || !editName.trim()}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              {updatePersonMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingPerson} onOpenChange={() => setDeletingPerson(null)}>
        <AlertDialogContent className="glass-card-strong border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Person Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deletingPerson?.name}" from your people list. 
              This action cannot be undone. The person may reappear if mentioned in future memories.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPerson && deletePersonMutation.mutate(deletingPerson.id)}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="confirm-delete-person"
            >
              {deletePersonMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── People merge confirmation dialog ──────────────────────── */}
      <AlertDialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <AlertDialogContent className="glass-card-strong border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Merge className="w-5 h-5 text-primary" />
              Confirm Merge
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  The following records will be merged into{" "}
                  <span className="font-semibold text-foreground">
                    {people.find(p => p.id === mergeTarget)?.name || "Primary"}
                  </span>
                  :
                </p>
                <div className="space-y-1.5">
                  {Array.from(selectedForMerge)
                    .filter(id => id !== mergeTarget)
                    .map(id => {
                      const person = people.find(p => p.id === id);
                      if (!person) return null;
                      return (
                        <div key={id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                          <div className="min-w-0">
                            <span className="font-medium text-foreground truncate block">{person.name}</span>
                            {person.relationship && (
                              <span className="text-xs text-muted-foreground capitalize">{person.relationship}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 ml-2 shrink-0">
                            <Badge variant="secondary" className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-xs">
                              {person.mentionCount ?? 0} {(person.mentionCount ?? 0) === 1 ? "memory" : "memories"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
                <p className="text-xs text-destructive/80">
                  All memories and references will be re-attributed to <span className="font-medium">{people.find(p => p.id === mergeTarget)?.name || "the primary record"}</span>. Source records will be permanently deleted. This cannot be undone.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/20" onClick={() => setShowMergeConfirm(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmMerge}
              disabled={mergeMutation.isPending}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
              data-testid="confirm-merge-people"
            >
              {mergeMutation.isPending ? "Merging..." : "Merge People"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
