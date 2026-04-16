import AppLayout from "@/components/app-layout";
import { TierGate } from "@/components/tier-gate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { IdeaModal } from "@/components/idea-modal";
import { 
  Lightbulb, 
  Plus, 
  Loader2, 
  Sparkles,
  Target,
  CheckCircle2,
  XCircle,
  MessageCircle,
  ListTodo,
  Clock,
  ArrowRight,
  Search,
  FileText,
  CheckSquare,
  FileEdit,
  StickyNote
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { insertIdeaSchema } from "@shared/schema";

interface ListItem {
  id: string;
  text: string;
  isChecked: boolean;
  order: number;
}

interface Idea {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  type: 'idea' | 'note' | 'list' | 'document';
  stage: string;
  content: string | null;
  listItems: ListItem[];
  chatHistory: { role: string; content: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

const TYPE_CONFIG = {
  idea: { label: 'Idea', icon: Lightbulb, color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', description: 'Brainstorm and develop with AI' },
  note: { label: 'Note', icon: StickyNote, color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', description: 'Quick notes and thoughts' },
  list: { label: 'List', icon: CheckSquare, color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', description: 'Checklists and to-do items' },
  document: { label: 'Document', icon: FileEdit, color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', description: 'Longer form content' },
} as const;

const STAGE_CONFIG = {
  spark: { label: 'Spark', icon: Lightbulb, color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400', description: 'Just an idea' },
  exploring: { label: 'Exploring', icon: MessageCircle, color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400', description: 'Brainstorming' },
  planning: { label: 'Planning', icon: ListTodo, color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400', description: 'Breaking it down' },
  in_progress: { label: 'In Progress', icon: Target, color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400', description: 'Making it real' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-green-500/20 text-green-600 dark:text-green-400', description: 'Done!' },
  dropped: { label: 'Dropped', icon: XCircle, color: 'bg-gray-500/20 text-gray-600 dark:text-gray-400', description: 'Not pursuing' },
} as const;

const createIdeaFormSchema = insertIdeaSchema.extend({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  type: z.enum(['idea', 'note', 'list', 'document']).default('idea'),
});

type CreateIdeaForm = z.infer<typeof createIdeaFormSchema>;

export default function IdeasPage() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<'idea' | 'note' | 'list' | 'document'>('idea');
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  const [isIdeaModalOpen, setIsIdeaModalOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateIdeaForm>({
    resolver: zodResolver(createIdeaFormSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "idea",
    },
  });

  const { data: ideas = [], isLoading } = useQuery<Idea[]>({
    queryKey: ['/api/ideas'],
    staleTime: 1000 * 60 * 2, // 2 minutes - ideas list
  });

  const createIdeaMutation = useMutation({
    mutationFn: async (data: CreateIdeaForm) => {
      const response = await apiRequest("POST", "/api/ideas", data);
      if (!response.ok) throw new Error("Failed to create idea");
      return response.json();
    },
    onSuccess: (newIdea) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      setIsCreateDialogOpen(false);
      form.reset();
      setSelectedIdeaId(newIdea.id);
      setIsIdeaModalOpen(true);
    },
    onError: () => {
      toast({
        title: "Failed to create idea",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const filteredIdeas = ideas.filter((idea) => {
    const matchesType = typeFilter === "all" || idea.type === typeFilter;
    const matchesStage = stageFilter === "all" || idea.stage === stageFilter;
    const matchesSearch = !searchQuery || 
      idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (idea.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesStage && matchesSearch;
  });

  const getTypeCount = (type: string) => ideas.filter(i => i.type === type).length;
  const getStageCount = (stage: string) => ideas.filter(i => i.stage === stage).length;

  const onSubmit = (data: CreateIdeaForm) => {
    createIdeaMutation.mutate(data);
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <AppLayout>
      <TierGate required={"pro"} feature={"Ideas Workspace"} description={"Brainstorm with AI, develop ideas, and turn thoughts into action plans."}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Lightbulb className="w-7 h-7 text-yellow-500" />
              Ideas
            </h1>
            <p className="text-muted-foreground mt-1">
              Brainstorm, develop, and bring your ideas to life
            </p>
          </div>
          
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) {
              form.reset();
              setSelectedType('idea');
            }
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  Create New
                </DialogTitle>
                <DialogDescription>
                  What would you like to create?
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-3 py-4">
                {Object.entries(TYPE_CONFIG).map(([key, config]) => {
                  const TypeIcon = config.icon;
                  const isSelected = selectedType === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedType(key as typeof selectedType);
                        form.setValue('type', key as any);
                      }}
                      className={cn(
                        "flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all text-left",
                        isSelected 
                          ? "border-primary bg-primary/5" 
                          : "border-border hover:border-primary/50 hover:bg-muted/50"
                      )}
                    >
                      <div className={cn("p-2 rounded-md", config.color)}>
                        <TypeIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-medium">{config.label}</div>
                        <div className="text-xs text-muted-foreground">{config.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {selectedType === 'idea' ? "What's your idea?" : 
                           selectedType === 'list' ? "List name" :
                           selectedType === 'note' ? "Note title" : "Document title"}
                        </FormLabel>
                        <FormControl>
                          <Input 
                            placeholder={
                              selectedType === 'idea' ? "e.g., Start a podcast about cooking" :
                              selectedType === 'list' ? "e.g., Grocery list, Packing list" :
                              selectedType === 'note' ? "e.g., Meeting notes, Quick thoughts" :
                              "e.g., Project proposal, Research notes"
                            }
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(selectedType === 'idea' || selectedType === 'document') && (
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {selectedType === 'idea' ? "Initial thoughts (optional)" : "Summary (optional)"}
                          </FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder={selectedType === 'idea' 
                                ? "Any initial thoughts or context..."
                                : "Brief summary of this document..."
                              }
                              className="min-h-[80px]"
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <DialogFooter>
                    <Button 
                      type="submit" 
                      disabled={createIdeaMutation.isPending}
                      className="gap-2"
                    >
                      {createIdeaMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      {selectedType === 'idea' ? "Create & Start Brainstorming" :
                       selectedType === 'list' ? "Create List" :
                       selectedType === 'note' ? "Create Note" : "Create Document"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types ({ideas.length})</SelectItem>
              {Object.entries(TYPE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label} ({getTypeCount(key)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {typeFilter === 'idea' && (
            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter by stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    {config.label} ({getStageCount(key)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredIdeas.length === 0 ? (
          <Card className="glass-card border-white/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground mb-4" />
              {ideas.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">Nothing here yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create your first idea, note, list, or document
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Your First Item
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">No matching items</h3>
                  <p className="text-muted-foreground">
                    Try adjusting your search or filter
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredIdeas.map((idea) => {
              const ideaType = idea.type || 'idea';
              const typeConfig = TYPE_CONFIG[ideaType as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.idea;
              const TypeIcon = typeConfig.icon;
              const stageConfig = STAGE_CONFIG[idea.stage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.spark;
              const StageIcon = stageConfig.icon;
              const chatCount = idea.chatHistory?.length || 0;
              const listItems = idea.listItems || [];
              const checkedCount = listItems.filter(item => item.isChecked).length;

              return (
                <div 
                  key={idea.id} 
                  onClick={() => {
                    setSelectedIdeaId(idea.id);
                    setIsIdeaModalOpen(true);
                  }}
                >
                  <Card className="glass-card border-white/20 hover:border-primary/30 transition-all cursor-pointer group h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1.5 rounded-md flex-shrink-0", typeConfig.color)}>
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                            {idea.title}
                          </CardTitle>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {ideaType === 'idea' && (
                          <Badge className={cn("w-fit gap-1", stageConfig.color)}>
                            <StageIcon className="w-3 h-3" />
                            {stageConfig.label}
                          </Badge>
                        )}
                        {ideaType === 'list' && listItems.length > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <CheckSquare className="w-3 h-3" />
                            {checkedCount}/{listItems.length}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {idea.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {idea.description}
                        </p>
                      )}
                      {ideaType === 'list' && listItems.length > 0 && (
                        <div className="text-sm text-muted-foreground mb-3 space-y-1">
                          {listItems.slice(0, 3).map(item => (
                            <div key={item.id} className="flex items-center gap-2">
                              <div className={cn(
                                "w-3 h-3 rounded border flex-shrink-0",
                                item.isChecked ? "bg-primary border-primary" : "border-muted-foreground/50"
                              )} />
                              <span className={cn("line-clamp-1", item.isChecked && "line-through opacity-60")}>
                                {item.text}
                              </span>
                            </div>
                          ))}
                          {listItems.length > 3 && (
                            <div className="text-xs text-muted-foreground">+{listItems.length - 3} more</div>
                          )}
                        </div>
                      )}
                      {(ideaType === 'note' || ideaType === 'document') && idea.content && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {idea.content}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(idea.updatedAt)}
                        </span>
                        {ideaType === 'idea' && chatCount > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {chatCount} messages
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}

        <Card className="glass-card border-white/20 bg-gradient-to-br from-yellow-500/5 to-orange-500/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-yellow-500" />
              How Ideas Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Capture</h4>
                  <p className="text-xs text-muted-foreground">Start with a spark - any thought or idea</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Explore</h4>
                  <p className="text-xs text-muted-foreground">Chat with AI to refine and develop</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">Realize</h4>
                  <p className="text-xs text-muted-foreground">Break into tasks and make it happen</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <IdeaModal
        ideaId={selectedIdeaId}
        open={isIdeaModalOpen}
        onOpenChange={setIsIdeaModalOpen}
      />
    </TierGate>
    </AppLayout>
  );
}
