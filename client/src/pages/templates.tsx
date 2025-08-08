import MobileLayout from "@/components/mobile-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Template } from "@shared/schema";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Templates() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    logFormat: "",
    queryFormat: "",
    fields: []
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const activateTemplateMutation = useMutation({
    mutationFn: (templateId: string) => 
      apiRequest("POST", `/api/templates/${templateId}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({ title: "Template activated successfully" });
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: (template: any) => 
      apiRequest("POST", "/api/templates", template),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setShowCreateDialog(false);
      setNewTemplate({ name: "", description: "", logFormat: "", queryFormat: "", fields: [] });
      toast({ title: "Template created successfully" });
    },
  });

  const handleCreateTemplate = () => {
    createTemplateMutation.mutate(newTemplate);
  };

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading templates...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <>
      <MobileLayout>
        {/* Desktop Header - Hidden on mobile */}
        <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-foreground">Templates</h2>
              <p className="text-sm text-muted-foreground">Manage logging and query templates</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <span className="material-icons mr-2">add</span>
              New Template
            </Button>
          </div>
        </header>

        {/* Mobile Header with Create Button */}
        <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Manage logging and query templates</p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} size="sm">
              <span className="material-icons mr-1 text-sm">add</span>
              New
            </Button>
          </div>
        </div>

        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
            {templates.map((template) => (
                <Card key={template.id} className="relative">
                  {template.isActive && (
                    <Badge className="absolute top-4 right-4 bg-secondary">Active</Badge>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <span className="material-icons mr-2">content_copy</span>
                      {template.name}
                    </CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Log Format</Label>
                        <p className="text-sm font-mono bg-muted p-2 rounded">{template.logFormat}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Query Format</Label>
                        <p className="text-sm font-mono bg-muted p-2 rounded">{template.queryFormat}</p>
                      </div>
                      {!template.isActive && (
                        <Button 
                          className="w-full" 
                          variant="outline"
                          onClick={() => activateTemplateMutation.mutate(template.id)}
                          disabled={activateTemplateMutation.isPending}
                        >
                          Activate Template
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </main>
        </MobileLayout>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={newTemplate.description}
                  onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="logFormat">Log Format</Label>
                <Textarea
                  id="logFormat"
                  value={newTemplate.logFormat}
                  onChange={(e) => setNewTemplate({ ...newTemplate, logFormat: e.target.value })}
                  placeholder="e.g., Round [#] / Table [#] / Game [#] - [Player] [Action]"
                />
              </div>
              <div>
                <Label htmlFor="queryFormat">Query Format</Label>
                <Textarea
                  id="queryFormat"
                  value={newTemplate.queryFormat}
                  onChange={(e) => setNewTemplate({ ...newTemplate, queryFormat: e.target.value })}
                  placeholder="e.g., Who [Action] on Round [#] / Table [#] / Game [#]"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateTemplate}
                  disabled={createTemplateMutation.isPending}
                >
                  Create Template
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
    </>
  );
}
