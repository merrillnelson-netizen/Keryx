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
import { toast } from "sonner";

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
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [editedCommand, setEditedCommand] = useState("");
  const [editedData, setEditedData] = useState("");

  const { data: logEntries = [], isLoading, refetch } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs", { limit: 5 }],
    queryFn: () => fetch("/api/logs?limit=5").then(res => res.json()),
    refetchInterval: 5000, // Auto-refresh every 5 seconds
    refetchOnWindowFocus: true, // Refresh when window gets focus
  });

  const updateMutation = useMutation({
    mutationFn: async (updatedEntry: Partial<LogEntry>) => {
      await apiRequest("PUT", `/api/logs/${updatedEntry.id}`, updatedEntry);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast.("Log entry updated successfully.");
      setEditingEntry(null);
    },
    onError: (error) => {
      toast.error(`Failed to update log entry: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
      toast.("Log entry deleted successfully.");
    },
    onError: (error) => {
      toast.error(`Failed to delete log entry: ${error.message}`);
    },
  });

  const handleEdit = (entry: LogEntry) => {
    setEditingEntry(entry);
    setEditedCommand(entry.rawCommand);
    setEditedData(entry.parsedData ? JSON.stringify(entry.parsedData, null, 2) : "");
  };

  const handleSave = () => {
    if (editingEntry) {
      try {
        const parsedData = editedData ? JSON.parse(editedData) : null;
        updateMutation.mutate({
          id: editingEntry.id,
          rawCommand: editedCommand,
          parsedData: parsedData,
        });
      } catch (error: any) {
        toast.error(`Invalid JSON format: ${error.message}`);
      }
    }
  };

  const handleDelete = (id: string, rawCommand: string) => {
    toast.promise(
      deleteMutation.mutateAsync(id),
      {
        loading: `Deleting log entry: "${rawCommand}"...`,
        success: "Log entry deleted successfully.",
        error: (e) => `Failed to delete log entry: ${e.message}`,
      }
    );
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
              <div key={entry.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.rawCommand}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp!).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                    #{index + 1}
                  </span>
                  <div className="flex gap-1">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(entry)}
                          className="h-6 w-6 p-0"
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
                            <Label htmlFor="command">Raw Command</Label>
                            <Input
                              id="command"
                              value={editedCommand}
                              onChange={(e) => setEditedCommand(e.target.value)}
                              placeholder="Enter command..."
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="data">Parsed Data (JSON)</Label>
                            <Textarea
                              id="data"
                              value={editedData}
                              onChange={(e) => setEditedData(e.target.value)}
                              placeholder="Enter JSON data..."
                              className="min-h-[120px] font-mono text-sm"
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
                      onClick={() => handleDelete(entry.id, entry.rawCommand)}
                      disabled={deleteMutation.isPending}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
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