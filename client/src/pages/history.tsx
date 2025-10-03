import AppLayout from "@/components/app-layout";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Edit2, Trash2, ChevronDown, ChevronUp, LayoutGrid, LayoutList, Table as TableIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export default function History() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editMetadata, setEditMetadata] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  
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
    setEditMetadata(entry.metadataJson ? JSON.stringify(entry.metadataJson, null, 2) : "");
  };

  const handleSaveEdit = () => {
    if (editingEntry) {
      try {
        const metadata = editMetadata ? JSON.parse(editMetadata) : null;
        updateMutation.mutate({
          id: editingEntry.id,
          data: {
            memoryText: editText,
            topicTag: editTopic || undefined,
            metadataJson: metadata,
          },
        });
      } catch (error: any) {
        toast({
          title: "Invalid JSON",
          description: `Please check your metadata format: ${error.message}`,
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading memories...</p>
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
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Memory History</h2>
                <p className="text-sm text-muted-foreground">All your saved memories</p>
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

        {/* Memories List - Scrollable Container */}
        {!logEntries || logEntries.length === 0 ? (
          <div className="glass-card p-12 rounded-2xl text-center">
            <BookOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
            <p className="text-muted-foreground">Start logging memories to see your activity here</p>
          </div>
        ) : viewMode === "table" ? (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="max-h-[calc(100vh-250px)] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
              <Table>
                <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="w-[140px] text-foreground font-semibold">Date</TableHead>
                    <TableHead className="w-[120px] text-foreground font-semibold">Topic</TableHead>
                    <TableHead className="text-foreground font-semibold">Memory</TableHead>
                    <TableHead className="w-[100px] text-right text-foreground font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logEntries.map((entry) => (
                    <TableRow 
                      key={entry.id} 
                      data-testid={`memory-row-${entry.id}`}
                      className="border-white/10 hover:bg-white/5 transition-colors"
                    >
                      <TableCell className="text-sm text-muted-foreground" data-testid={`date-cell-${entry.id}`}>
                        {new Date(entry.timestamp!).toLocaleDateString()}
                      </TableCell>
                      <TableCell data-testid={`topic-cell-${entry.id}`}>
                        <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                          {entry.topicTag || "General"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-foreground" data-testid={`memory-cell-${entry.id}`}>
                        {entry.memoryText}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(entry)}
                            className="h-8 w-8 p-0 hover:bg-white/10"
                            data-testid={`edit-button-${entry.id}`}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingId(entry.id)}
                            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                            data-testid={`delete-button-${entry.id}`}
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
          <div className="max-h-[calc(100vh-250px)] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
            <div className="flex flex-col space-y-4">
              {logEntries.map((entry) => (
                <Card key={entry.id} data-testid={`memory-card-${entry.id}`} className="glass-card border-white/20 overflow-hidden hover:shadow-xl transition-all duration-300">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {entry.topicTag && (
                          <Badge variant="secondary" data-testid={`topic-badge-${entry.id}`} className="bg-primary/20 text-primary border-primary/30">
                            {entry.topicTag}
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`date-badge-${entry.id}`} className="border-white/20">
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
                        className="h-8 w-8 p-0 hover:bg-white/10"
                        data-testid={`edit-button-${entry.id}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingId(entry.id)}
                        className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
                        data-testid={`delete-button-${entry.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className="h-8 w-8 p-0 hover:bg-white/10"
                        data-testid={`expand-button-${entry.id}`}
                      >
                        {expandedId === entry.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {expandedId === entry.id && entry.metadataJson && typeof entry.metadataJson === 'object' ? (
                  <CardContent className="pt-0 animate-slide-in" data-testid={`metadata-details-${entry.id}`}>
                    <div className="border-t border-white/10 pt-3">
                      <h4 className="text-sm font-medium text-foreground mb-2">Extracted Details</h4>
                      <div className="glass-card p-3 rounded-lg">
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
          </div>
        )}
      </div>

      <Dialog open={!!editingEntry} onOpenChange={() => setEditingEntry(null)}>
        <DialogContent data-testid="edit-dialog" className="glass-card-strong border-white/20">
          <DialogHeader>
            <DialogTitle>Edit Memory</DialogTitle>
            <DialogDescription>
              Make changes to your memory. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label htmlFor="edit-topic">Topic Tag</Label>
              <Input
                id="edit-topic"
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                placeholder="Enter topic tag..."
                data-testid="input-edit-topic"
                className="glass-card border-white/20"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-text">Memory Text</Label>
              <Textarea
                id="edit-text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Enter memory text..."
                className="min-h-[100px] glass-card border-white/20"
                data-testid="input-edit-text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-metadata">Metadata (JSON)</Label>
              <Textarea
                id="edit-metadata"
                value={editMetadata}
                onChange={(e) => setEditMetadata(e.target.value)}
                placeholder='{"key": "value"}'
                className="min-h-[120px] font-mono text-sm glass-card border-white/20"
                data-testid="input-edit-metadata"
              />
              <p className="text-xs text-muted-foreground">Optional: Edit the AI-extracted metadata in JSON format</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingEntry(null)}
              data-testid="button-cancel-edit"
              className="border-white/20"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit"
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent data-testid="delete-dialog" className="glass-card-strong border-white/20">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Memory</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this memory? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete" className="border-white/20">Cancel</AlertDialogCancel>
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
    </AppLayout>
  );
}
