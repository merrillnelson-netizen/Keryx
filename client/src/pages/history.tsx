import MobileLayout from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function History() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTopic, setEditTopic] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: logEntries, isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/logs/${id}`, {});
      if (!response.ok) {
        throw new Error("Failed to delete memory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Memory deleted",
        description: "Memory has been successfully deleted",
      });
      setDeletingId(null);
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete memory. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LogEntry> }) => {
      const response = await apiRequest("PATCH", `/api/logs/${id}`, data);
      if (!response.ok) {
        throw new Error("Failed to update memory");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Memory updated",
        description: "Memory has been successfully updated",
      });
      setEditingEntry(null);
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Failed to update memory. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (entry: LogEntry) => {
    setEditingEntry(entry);
    setEditText(entry.memoryText);
    setEditTopic(entry.topicTag || "");
  };

  const handleSaveEdit = () => {
    if (editingEntry) {
      updateMutation.mutate({
        id: editingEntry.id,
        data: {
          memoryText: editText,
          topicTag: editTopic || undefined,
        },
      });
    }
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading history...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Memory History</h2>
          <p className="text-sm text-muted-foreground">View all your saved memories</p>
        </div>
      </header>

      <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
        <p className="text-sm text-muted-foreground">View all your saved memories</p>
      </div>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
        {!logEntries || logEntries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
              <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
              <p className="text-muted-foreground">Start logging memories to see your activity here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {logEntries.map((entry) => (
              <Card key={entry.id} data-testid={`memory-card-${entry.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {entry.topicTag && (
                          <Badge variant="secondary" data-testid={`topic-badge-${entry.id}`}>
                            <span className="material-icons text-xs mr-1">label</span>
                            {entry.topicTag}
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`date-badge-${entry.id}`}>
                          {new Date(entry.timestamp!).toLocaleDateString()}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-normal text-foreground" data-testid={`memory-text-${entry.id}`}>
                        {entry.memoryText}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(entry)}
                        className="h-8 w-8 p-0"
                        data-testid={`edit-button-${entry.id}`}
                      >
                        <span className="material-icons text-sm">edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(entry.id)}
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`delete-button-${entry.id}`}
                      >
                        <span className="material-icons text-sm">delete</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="h-8 w-8 p-0"
                        data-testid={`expand-button-${entry.id}`}
                      >
                        <span className="material-icons text-sm">
                          {expandedId === entry.id ? 'expand_less' : 'expand_more'}
                        </span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {expandedId === entry.id && entry.metadataJson && typeof entry.metadataJson === 'object' ? (
                  <CardContent className="pt-0" data-testid={`metadata-details-${entry.id}`}>
                    <div className="border-t border-outline pt-3">
                      <h4 className="text-sm font-medium text-foreground mb-2">Extracted Details</h4>
                      <div className="bg-muted p-3 rounded-lg">
                        {Object.entries(entry.metadataJson as Record<string, unknown>).map(([key, value]) => {
                          let displayValue: string;
                          if (Array.isArray(value)) {
                            displayValue = value.map(v => String(v)).join(', ');
                          } else if (value !== null && value !== undefined) {
                            displayValue = String(value);
                          } else {
                            displayValue = 'N/A';
                          }
                          
                          return (
                            <div key={key} className="flex items-start gap-2 mb-1 last:mb-0">
                              <span className="text-xs font-medium text-muted-foreground uppercase min-w-[80px]">
                                {key.replace(/_/g, ' ')}:
                              </span>
                              <span className="text-sm text-foreground">
                                {displayValue}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Saved {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent data-testid="edit-dialog">
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>
              Make changes to your memory. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-topic">Topic Tag</Label>
              <Input
                id="edit-topic"
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                placeholder="Enter topic tag..."
                data-testid="input-edit-topic"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-text">Memory Text</Label>
              <Textarea
                id="edit-text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Enter memory text..."
                className="min-h-[100px]"
                data-testid="input-edit-text"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEntry(null)}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent data-testid="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && deleteMutation.mutate(deletingId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobileLayout>
  );
}
