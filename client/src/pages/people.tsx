import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, User, MessageSquare, Edit2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  const [editRelationship, setEditRelationship] = useState("");
  const [editNotes, setEditNotes] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: peopleData, isLoading } = useQuery<{ data: Person[]; count: number }>({
    queryKey: ["/api/people"],
  });

  const { data: mentionsData, isLoading: mentionsLoading } = useQuery<{ data: LogEntry[]; count: number }>({
    queryKey: ["/api/people", selectedPerson?.name, "mentions"],
    queryFn: async () => {
      if (!selectedPerson?.name) throw new Error("No person selected");
      const response = await fetch(`/api/people/${encodeURIComponent(selectedPerson.name)}/mentions`);
      if (!response.ok) throw new Error("Failed to fetch mentions");
      return response.json();
    },
    enabled: !!selectedPerson,
  });

  const updatePersonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { relationship?: string; notes?: string } }) => {
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

  const handleEdit = (person: Person) => {
    setEditingPerson(person);
    setEditRelationship(person.relationship || "");
    setEditNotes(person.notes || "");
  };

  const handleSaveEdit = () => {
    if (editingPerson) {
      updatePersonMutation.mutate({
        id: editingPerson.id,
        data: {
          relationship: editRelationship || undefined,
          notes: editNotes || undefined,
        },
      });
    }
  };

  const people = peopleData?.data || [];

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
        </div>

        {people.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No people tracked yet</h3>
            <p className="text-muted-foreground">
              When you mention people in your memories, they'll appear here
            </p>
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
                {mentionsData?.count || 0} memories found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mentionsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : !mentionsData?.data?.length ? (
                <p className="text-muted-foreground text-center py-8">No memories found</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {mentionsData.data.map((entry) => (
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
              Add more context about {editingPerson?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
              disabled={updatePersonMutation.isPending}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              {updatePersonMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
