import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { cn } from "@/lib/utils";
import { Mic, MicOff, Square, Plus, Search, Volume2, Tag } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Category } from "@shared/schema";

export default function VoiceActivation() {
  const [selectedCategory, setSelectedCategory] = useState<string>('Auto (AI)');
  const [showNewCategoryDialog, setShowNewCategoryDialog] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { 
    isListening, 
    isSupported, 
    startListening, 
    stopListening,
    mode,
    setMode,
    lastResponse,
    setManualCategory
  } = useSpeechRecognition();

  const { speak } = useSpeechSynthesis();

  // Fetch user's categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/categories", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category created successfully" });
      setShowNewCategoryDialog(false);
      setNewCategoryName("");
    },
    onError: () => {
      toast({ 
        title: "Failed to create category",
        variant: "destructive"
      });
    }
  });

  // Update the hook whenever category changes
  const handleCategoryChange = (value: string) => {
    if (value === "__add_new__") {
      setShowNewCategoryDialog(true);
      return;
    }
    
    setSelectedCategory(value);
    // Pass null for Auto (AI), or the actual category name
    setManualCategory(value === 'Auto (AI)' ? null : value);
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      toast({ 
        title: "Category name cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    createCategoryMutation.mutate(newCategoryName.trim());
    setSelectedCategory(newCategoryName.trim());
    setManualCategory(newCategoryName.trim());
  };

  const handleLogMode = () => {
    setMode("log");
    startListening();
  };

  const handleQueryMode = () => {
    setMode("query");
    startListening();
  };

  if (!isSupported) {
    return (
      <div className="glass-card p-12 rounded-2xl mb-6 text-center">
        <CardContent>
          <div className="w-32 h-32 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-6">
            <MicOff className="text-destructive w-16 h-16" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3">Speech Recognition Not Supported</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Your browser doesn't support speech recognition. Please use a modern browser like Chrome.
          </p>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="glass-card-strong p-6 lg:p-8 rounded-2xl mb-6 shadow-2xl">
      <CardContent className="text-center">
        <div className="mb-6 lg:mb-8">
          <div 
            className={cn(
              "w-32 h-32 lg:w-40 lg:h-40 rounded-2xl flex items-center justify-center mx-auto mb-4 lg:mb-6 transition-all duration-300 relative overflow-hidden",
              isListening 
                ? "bg-gradient-to-br from-secondary to-accent listening-pulse shadow-2xl" 
                : "bg-gradient-to-br from-primary via-secondary to-accent hover:scale-105 shadow-xl"
            )}
          >
            {isListening ? (
              <Mic className="text-white w-16 h-16 lg:w-20 lg:h-20 animate-pulse" />
            ) : (
              <Mic className="text-white w-16 h-16 lg:w-20 lg:h-20" />
            )}
            {isListening && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer"></div>
            )}
          </div>
          <h3 className="text-xl lg:text-3xl font-bold text-foreground mb-3">
            {isListening ? (
              <span className="text-gradient">
                {mode === "log" ? "Logging" : "Query"} Mode Active
              </span>
            ) : (
              "Voice Command Ready"
            )}
          </h3>
          <p className="text-sm lg:text-base text-muted-foreground max-w-md mx-auto px-2">
            {isListening 
              ? `Listening for ${mode} commands...`
              : 'Press a button below to start logging or querying'
            }
          </p>
        </div>

        {/* Category Selector */}
        {!isListening && (
          <div className="mb-6 max-w-xs mx-auto">
            <Label htmlFor="category-select" className="flex items-center gap-2 mb-2 text-foreground">
              <Tag className="w-4 h-4 text-primary" />
              <span>Memory Category</span>
            </Label>
            <Select value={selectedCategory} onValueChange={handleCategoryChange}>
              <SelectTrigger 
                id="category-select"
                className="w-full bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-colors"
                data-testid="select-category"
              >
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="glass-card border-primary/20">
                <SelectItem value="Auto (AI)" data-testid="option-category-auto-ai">
                  Auto (AI)
                </SelectItem>
                {categories.map((category) => (
                  <SelectItem 
                    key={category.id} 
                    value={category.name}
                    data-testid={`option-category-${category.name.toLowerCase().replace(/[^a-z]/g, '-')}`}
                  >
                    {category.name}
                  </SelectItem>
                ))}
                <SelectItem value="__add_new__" className="text-primary font-semibold" data-testid="option-add-new-category">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>Add New Category...</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {selectedCategory === 'Auto (AI)' ? 'AI will detect the category automatically' : `All memories will be saved as ${selectedCategory}`}
            </p>
          </div>
        )}

        {/* Manual Activation Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 lg:gap-4">
          {isListening ? (
            <Button 
              onClick={stopListening}
              variant="destructive"
              className="px-6 lg:px-8 py-4 lg:py-6 w-full sm:w-auto text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all"
              size="lg"
              data-testid="button-stop-listening"
            >
              <Square className="mr-2 w-5 h-5" />
              <span>Stop Listening</span>
            </Button>
          ) : (
            <>
              <Button 
                onClick={handleLogMode}
                className="bg-gradient-to-r from-secondary to-secondary/80 hover:from-secondary/90 hover:to-secondary/70 text-white px-6 lg:px-8 py-4 lg:py-6 w-full sm:w-auto text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
                size="lg"
                data-testid="button-log-mode"
              >
                <Plus className="mr-2 w-5 h-5" />
                <span>Log Mode</span>
              </Button>

              <Button 
                onClick={handleQueryMode}
                className="bg-gradient-to-r from-accent to-accent/80 hover:from-accent/90 hover:to-accent/70 text-white px-6 lg:px-8 py-4 lg:py-6 w-full sm:w-auto text-base lg:text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105"
                size="lg"
                data-testid="button-query-mode"
              >
                <Search className="mr-2 w-5 h-5" />
                <span>Query Mode</span>
              </Button>
            </>
          )}
        </div>

        {/* Response Display */}
        {lastResponse && (
          <div className="mt-6 lg:mt-8 glass-card p-4 lg:p-6 rounded-xl border border-primary/30 animate-slide-in">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Volume2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-primary mb-1">Response</p>
                <p className="text-sm lg:text-base text-foreground" data-testid="text-response">
                  {lastResponse}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* New Category Dialog */}
      <Dialog open={showNewCategoryDialog} onOpenChange={setShowNewCategoryDialog}>
        <DialogContent className="glass-card border-primary/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Tag className="w-5 h-5 text-primary" />
              Add New Category
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-category-name" className="text-foreground">Category Name</Label>
              <Input
                id="new-category-name"
                placeholder="e.g., Health, Financial, Travel..."
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
                className="bg-card/50 backdrop-blur-sm border-primary/20 focus:border-primary/40"
                data-testid="input-new-category-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewCategoryDialog(false);
                setNewCategoryName("");
              }}
              className="border-primary/20 hover:bg-primary/10"
              data-testid="button-cancel-new-category"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateCategory}
              disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-white"
              data-testid="button-create-category"
            >
              {createCategoryMutation.isPending ? "Creating..." : "Create Category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
