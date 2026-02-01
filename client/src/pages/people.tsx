import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, User, MessageSquare, Edit2, Trash2, LayoutGrid, Table as TableIcon, Merge, Check, X } from "lucide-react";
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
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: people = [], isLoading } = useQuery<Person[]>({
    queryKey: ["/api/people"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

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
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const updatePersonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; relationship?: string; notes?: string; priority?: number } }) => {
      const response = await apiRequest("PATCH", `/api/people/${id}`, data);
      if (!response.ok) throw new Error("Failed to update person");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/people"] });
      toast({
        title: "Person updated",
        description: "Details have been saved successfully",
      });
      setEditingPerson(null);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update person. Please try again.",
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
    const sourceIds = Array.from(selectedForMerge).filter(id => id !== mergeTarget);
    mergeMutation.mutate({ targetId: mergeTarget, sourceIds });
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
  };

  const handleSaveEdit = () => {
    if (editingPerson) {
      updatePersonMutation.mutate({
        id: editingPerson.id,
        data: {
          name: editName !== editingPerson.name ? editName : undefined,
          relationship: editRelationship || undefined,
          notes: editNotes || undefined,
          priority: editPriority,
        },
      });
    }
  };

  const getPriorityLabelInfo = (priority: number) => {
    const info = getPriorityInfo(priority);
    return { label: info.label, color: info.bgClass };
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
      <div className="space-y-6 animate-fade-in">
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
              {!mergeMode ? (
                <>
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
                      onClick={() => setMergeMode(true)}
                      className={cn(
                        "h-9 w-9 p-0 transition-all",
                        "text-muted-foreground hover:text-foreground hover:bg-white/10"
                      )}
                      title="Consolidate people"
                      data-testid="button-merge-mode"
                    >
                      <Merge className="w-4 h-4" />
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelMerge}
                    className="border-white/20 hover:bg-white/10 gap-2"
                    data-testid="button-cancel-merge"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleExecuteMerge}
                    disabled={selectedForMerge.size < 2 || !mergeTarget || mergeMutation.isPending}
                    className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 gap-2"
                    data-testid="button-execute-merge"
                  >
                    <Check className="w-4 h-4" />
                    {mergeMutation.isPending ? "Merging..." : `Merge ${selectedForMerge.size} People`}
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {mergeMode && (
            <div className="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-300 font-medium mb-2">Consolidation Mode</p>
              <p className="text-xs text-muted-foreground">
                1. Select the people you want to merge (nicknames, variations, duplicates)<br/>
                2. Click on one to set it as the target name (shown with a star)<br/>
                3. All memories will be updated to use the target name
              </p>
              {selectedForMerge.size > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from(selectedForMerge).map(id => {
                    const person = people.find(p => p.id === id);
                    return person ? (
                      <Badge 
                        key={id} 
                        variant="outline"
                        className={cn(
                          "cursor-pointer",
                          mergeTarget === id 
                            ? "bg-primary/20 border-primary text-primary" 
                            : "bg-white/10 border-white/20"
                        )}
                        onClick={() => handleSetMergeTarget(id)}
                      >
                        {mergeTarget === id && "★ "}
                        {person.name}
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {people.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No people tracked yet</h3>
            <p className="text-muted-foreground">
              When you mention people in your memories, they'll appear here
            </p>
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
                    <TableHead className="w-[120px] text-foreground font-semibold">Relationship</TableHead>
                    <TableHead className="w-[100px] text-foreground font-semibold">Mentions</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold">Last Mentioned</TableHead>
                    <TableHead className="min-w-[200px] text-foreground font-semibold">Notes</TableHead>
                    <TableHead className="w-[90px] text-right text-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((person) => (
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
                          {person.name}
                          {mergeMode && mergeTarget === person.id && (
                            <Badge className="ml-2 bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs">
                              Target
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`priority-cell-${person.id}`}>
                        <Badge variant="outline" className={cn("text-xs", getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).color)}>
                          {getPriorityLabelInfo(person.priority || DEFAULT_PRIORITY_VALUE).label}
                        </Badge>
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
            {people.map((person) => (
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

      {/* Memories Popup Dialog */}
      <Dialog open={!!selectedPerson} onOpenChange={() => setSelectedPerson(null)}>
        <DialogContent className="glass-card-strong border-white/20 max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-lg">{selectedPerson?.name}</span>
                {selectedPerson?.relationship && (
                  <Badge variant="secondary" className="ml-2 bg-primary/20 text-primary border-primary/30 text-xs">
                    {selectedPerson.relationship}
                  </Badge>
                )}
              </div>
            </DialogTitle>
            <DialogDescription>
              {mentions.length} {mentions.length === 1 ? 'memory' : 'memories'} mentioning this person
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto mt-4 pr-2 -mr-2">
            {mentionsLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : !mentions.length ? (
              <p className="text-muted-foreground text-center py-8">No memories found</p>
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
    </AppLayout>
  );
}
