import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, User, MessageSquare, Edit2, Trash2, LayoutGrid, Table as TableIcon } from "lucide-react";
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
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: people = [], isLoading } = useQuery<Person[]>({
    queryKey: ["/api/people"],
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
  });

  const updatePersonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; relationship?: string; notes?: string } }) => {
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

  const handleEdit = (person: Person) => {
    setEditingPerson(person);
    setEditName(person.name);
    setEditRelationship(person.relationship || "");
    setEditNotes(person.notes || "");
  };

  const handleSaveEdit = () => {
    if (editingPerson) {
      updatePersonMutation.mutate({
        id: editingPerson.id,
        data: {
          name: editName !== editingPerson.name ? editName : undefined,
          relationship: editRelationship || undefined,
          notes: editNotes || undefined,
        },
      });
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
                    <TableHead className="w-[200px] text-foreground font-semibold">Name</TableHead>
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
                        selectedPerson?.id === person.id && "bg-primary/10"
                      )}
                      onClick={() => setSelectedPerson(person)}
                    >
                      <TableCell className="font-medium" data-testid={`name-cell-${person.id}`}>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          {person.name}
                        </div>
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
                  "glass-card border-white/20 cursor-pointer transition-all hover:shadow-xl",
                  selectedPerson?.id === person.id && "ring-2 ring-primary"
                )}
                onClick={() => setSelectedPerson(person)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{person.name}</CardTitle>
                        {person.relationship && (
                          <Badge variant="outline" className="mt-1 text-xs border-primary/30 text-primary">
                            {person.relationship}
                          </Badge>
                        )}
                      </div>
                    </div>
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="w-4 h-4" />
                      <span>{person.mentionCount} mentions</span>
                    </div>
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

        {/* Mentions Panel */}
        {selectedPerson && (
          <Card className="glass-card border-white/20 mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" />
                Memories mentioning {selectedPerson.name}
              </CardTitle>
              <CardDescription>
                {mentions.length} memories found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mentionsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : !mentions.length ? (
                <p className="text-muted-foreground text-center py-8">No memories found</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {mentions.map((entry: LogEntry) => (
                    <div 
                      key={entry.id} 
                      className="glass-card p-3 rounded-lg"
                      data-testid={`mention-${entry.id}`}
                    >
                      <p className="text-foreground">{entry.memoryText}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs border-white/20">
                          {new Date(entry.timestamp!).toLocaleDateString()}
                        </Badge>
                        <Badge variant="secondary" className="text-xs bg-primary/20 text-primary border-primary/30">
                          {entry.topicTag}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

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
