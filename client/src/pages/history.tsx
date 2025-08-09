import MobileLayout from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function History() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
  const [editedCommand, setEditedCommand] = useState("");
  const [editedData, setEditedData] = useState("");

  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
    queryFn: () => fetch("/api/logs").then(res => res.json()),
  });

  // Mutation for updating log entries
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<LogEntry> }) => {
      try {
        const response = await apiRequest("PUT", `/api/logs/${id}`, data);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Update mutation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
        setEditingEntry(null);
        setEditedCommand("");
        setEditedData("");
        toast({
          title: "Success",
          description: "Log entry updated successfully",
        });
      } catch (error) {
        console.error("Error in update success handler:", error);
      }
    },
    onError: (error) => {
      try {
        console.error("Failed to update log entry:", error);
        toast({
          title: "Error",
          description: "Failed to update log entry. Please try again.",
          variant: "destructive",
        });
      } catch (handlerError) {
        console.error("Error in update error handler:", handlerError);
      }
    },
  });

  // Mutation for deleting log entries
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        const response = await apiRequest("DELETE", `/api/logs/${id}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        console.error("Delete mutation error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/logs"] });
        toast({
          title: "Success",
          description: "Log entry deleted successfully",
        });
      } catch (error) {
        console.error("Error in delete success handler:", error);
      }
    },
    onError: (error) => {
      try {
        console.error("Failed to delete log entry:", error);
        toast({
          title: "Error",
          description: "Failed to delete log entry. Please try again.",
          variant: "destructive",
        });
      } catch (handlerError) {
        console.error("Error in delete error handler:", handlerError);
      }
    },
  });

  /**
   * Handle edit button click with proper error handling
   * @param entry Log entry to edit
   */
  const handleEdit = (entry: LogEntry) => {
    try {
      setEditingEntry(entry);
      setEditedCommand(entry.rawCommand);
      setEditedData(JSON.stringify(entry.parsedData, null, 2));
    } catch (error) {
      console.error("Error setting up edit:", error);
      toast({
        title: "Error",
        description: "Failed to open edit dialog",
        variant: "destructive",
      });
    }
  };

  /**
   * Handle save edited entry with validation and error handling
   */
  const handleSave = async () => {
    try {
      if (!editingEntry) return;

      // Validate edited data is valid JSON
      let parsedData;
      try {
        parsedData = JSON.parse(editedData);
      } catch (parseError) {
        toast({
          title: "Invalid JSON",
          description: "Please check your parsed data format",
          variant: "destructive",
        });
        return;
      }

      // Validate required fields
      if (!editedCommand.trim()) {
        toast({
          title: "Missing Command",
          description: "Raw command cannot be empty",
          variant: "destructive",
        });
        return;
      }

      await updateMutation.mutateAsync({
        id: editingEntry.id,
        data: {
          rawCommand: editedCommand.trim(),
          parsedData: parsedData,
        },
      });
    } catch (error) {
      console.error("Error saving log entry:", error);
      // Error handling is done in the mutation's onError callback
    }
  };

  /**
   * Handle delete button click with confirmation
   * @param id Log entry ID to delete
   * @param command Command text for confirmation
   */
  const handleDelete = async (id: string, command: string) => {
    try {
      const confirmed = window.confirm(`Are you sure you want to delete this log entry?\n\nCommand: ${command}`);
      if (confirmed) {
        await deleteMutation.mutateAsync(id);
      }
    } catch (error) {
      console.error("Error deleting log entry:", error);
      // Error handling is done in the mutation's onError callback
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
      {/* Desktop Header - Hidden on mobile */}
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Log History</h2>
          <p className="text-sm text-muted-foreground">View all logged commands and data</p>
        </div>
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
        <p className="text-sm text-muted-foreground">View all logged commands and data</p>
      </div>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
          {logEntries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
                <h3 className="text-lg font-medium text-foreground mb-2">No log entries yet</h3>
                <p className="text-muted-foreground">Start using voice commands to see your activity here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {logEntries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{entry.rawCommand}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {new Date(entry.timestamp!).toLocaleDateString()}
                        </Badge>
                        <div className="flex gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleEdit(entry)}
                                className="h-8 w-8 p-0"
                              >
                                <span className="material-icons text-sm">edit</span>
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
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(entry.id, entry.rawCommand)}
                            disabled={deleteMutation.isPending}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <span className="material-icons text-sm">delete</span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded text-sm font-mono">
                      {JSON.stringify(entry.parsedData, null, 2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
    </MobileLayout>
  );
}
