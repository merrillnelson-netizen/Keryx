import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Clock, Edit2, Trash2, ArrowRight } from "lucide-react";

async function apiRequest(method: string, url: string, body?: any): Promise<any> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`API error: ${response.statusText} - ${errorData.message}`);
  }
  return response.json();
}

export default function RecentActivity() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [editedCommand, setEditedCommand] = useState("");
  const [editedData, setEditedData] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/logs", { limit: 5 }],
    queryFn: async () => {
      const response = await fetch("/api/logs?limit=5");
      const result = await response.json();
      return result.data || [];
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const logEntries = (data || []) as LogEntry[];

  const updateMutation = useMutation({
    mutationFn: async (updatedEntry: Partial<LogEntry>) => {
      await apiRequest("PUT", `/api/logs/${updatedEntry.id}`, updatedEntry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Success",
        description: "Log entry updated successfully.",
      });
      setEditingEntry(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update log entry: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast({
        title: "Success",
        description: "Log entry deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete log entry: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (entry: LogEntry) => {
    setEditingEntry(entry);
    setEditedCommand(entry.memoryText || "");
    setEditedData(entry.metadataJson ? JSON.stringify(entry.metadataJson, null, 2) : "");
  };

  const handleSave = () => {
    if (editingEntry) {
      try {
        const metadataJson = editedData ? JSON.parse(editedData) : {};
        updateMutation.mutate({
          id: editingEntry.id,
          memoryText: editedCommand,
          metadataJson: metadataJson,
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: `Invalid JSON format: ${error.message}`,
          variant: "destructive",
        });
      }
    }
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 rounded-2xl">
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass-card p-3 rounded-lg">
                  <div className="h-4 bg-muted-foreground/20 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted-foreground/20 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-2xl border-white/20">
      <CardContent>
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Recent Activity
          </h4>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-white/10">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {logEntries.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h5 className="font-medium text-foreground mb-2">No recent activity</h5>
            <p className="text-muted-foreground text-sm">Your voice commands will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logEntries.map((entry) => (
              <div key={entry.id} className="glass-card p-4 rounded-xl border-white/10 hover:border-white/20 transition-all" data-testid={`log-entry-${entry.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full font-medium" data-testid={`topic-tag-${entry.id}`}>
                        {entry.topicTag}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1" data-testid={`memory-text-${entry.id}`}>
                      {entry.memoryText}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid={`timestamp-${entry.id}`}>
                      {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(entry)}
                          className="h-8 w-8 p-0 hover:bg-white/10"
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px] glass-card-strong border-white/20">
                        <DialogHeader>
                          <DialogTitle>Edit Log Entry</DialogTitle>
                          <DialogDescription>
                            Make changes to your memory entry
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="command">Memory Text</Label>
                            <Input
                              id="command"
                              value={editedCommand}
                              onChange={(e) => setEditedCommand(e.target.value)}
                              placeholder="Enter memory text..."
                              data-testid="input-memory-text"
                              className="glass-card border-white/20"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="data">Metadata (JSON)</Label>
                            <Textarea
                              id="data"
                              value={editedData}
                              onChange={(e) => setEditedData(e.target.value)}
                              placeholder="Enter JSON metadata..."
                              className="min-h-[120px] font-mono text-sm glass-card border-white/20"
                              data-testid="input-metadata-json"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setEditingEntry(null)}
                            disabled={updateMutation.isPending}
                            className="border-white/20"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                            className="bg-gradient-to-r from-primary to-secondary hover:opacity-90"
                          >
                            {updateMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleteMutation.isPending}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      data-testid={`button-delete-${entry.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </div>
  );
}
