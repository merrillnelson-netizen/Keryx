import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

// Placeholder for apiRequest function, assuming it's defined elsewhere
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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/logs", { limit: 5 }],
    queryFn: async () => {
      const response = await fetch("/api/logs?limit=5");
      const result = await response.json();
      return result.data || []; // Extract data array from API response
    },
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true, // Refresh when window gets focus
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

  const handleDelete = (id: string, rawCommand: string) => {
    deleteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                  <div className="w-4 h-4 bg-muted-foreground rounded mt-0.5"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted-foreground rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-muted-foreground rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-foreground">Recent Activity</h4>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-primary hover:text-blue-600">
              View All
            </Button>
          </Link>
        </div>

        {logEntries.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
            <h5 className="font-medium text-foreground mb-2">No recent activity</h5>
            <p className="text-muted-foreground text-sm">Your voice commands will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logEntries.map((entry, index) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-muted/50 rounded" data-testid={`log-entry-${entry.id}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full" data-testid={`topic-tag-${entry.id}`}>
                      {entry.topicTag}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground truncate" data-testid={`memory-text-${entry.id}`}>
                    {entry.memoryText}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid={`timestamp-${entry.id}`}>
                    {new Date(entry.timestamp!).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(entry)}
                          className="h-6 w-6 p-0"
                          data-testid={`button-edit-${entry.id}`}
                        >
                          <span className="material-icons text-xs">edit</span>
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Edit Log Entry</DialogTitle>
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
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="data">Metadata (JSON)</Label>
                            <Textarea
                              id="data"
                              value={editedData}
                              onChange={(e) => setEditedData(e.target.value)}
                              placeholder="Enter JSON metadata..."
                              className="min-h-[120px] font-mono text-sm"
                              data-testid="input-metadata-json"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setEditingEntry(null)}
                            disabled={updateMutation.isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={handleSave}
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id, entry.memoryText || "")}
                      disabled={deleteMutation.isPending}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      data-testid={`button-delete-${entry.id}`}
                    >
                      <span className="material-icons text-xs">delete</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}