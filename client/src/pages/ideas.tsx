import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Search
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

interface Idea {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  stage: string;
  chatHistory: { role: string; content: string; timestamp: string }[];
  createdAt: string;
  updatedAt: string;
}

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
});

type CreateIdeaForm = z.infer<typeof createIdeaFormSchema>;

export default function IdeasPage() {
  const [, navigate] = useLocation();
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateIdeaForm>({
    resolver: zodResolver(createIdeaFormSchema),
    defaultValues: {
      title: "",
      description: "",
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
      navigate(`/ideas/${newIdea.id}`);
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
    const matchesStage = stageFilter === "all" || idea.stage === stageFilter;
    const matchesSearch = !searchQuery || 
      idea.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (idea.description?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStage && matchesSearch;
  });

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
          
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                New Idea
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-yellow-500" />
                  Capture a New Idea
                </DialogTitle>
                <DialogDescription>
                  Start with a spark - you can develop it further with AI brainstorming
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What's your idea?</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., Start a podcast about cooking" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Initial thoughts (optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any initial thoughts or context..."
                            className="min-h-[100px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button 
                      type="submit" 
                      disabled={createIdeaMutation.isPending}
                      className="gap-2"
                    >
                      {createIdeaMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create & Start Brainstorming
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
              placeholder="Search ideas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages ({ideas.length})</SelectItem>
              {Object.entries(STAGE_CONFIG).map(([key, config]) => (
                <SelectItem key={key} value={key}>
                  {config.label} ({getStageCount(key)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredIdeas.length === 0 ? (
          <Card className="glass-card border-white/20">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Lightbulb className="w-12 h-12 text-muted-foreground mb-4" />
              {ideas.length === 0 ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">No ideas yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Capture your first idea and start brainstorming with AI
                  </p>
                  <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Create Your First Idea
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">No matching ideas</h3>
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
              const stageConfig = STAGE_CONFIG[idea.stage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.spark;
              const StageIcon = stageConfig.icon;
              const chatCount = idea.chatHistory?.length || 0;

              return (
                <Link key={idea.id} href={`/ideas/${idea.id}`}>
                  <Card className="glass-card border-white/20 hover:border-primary/30 transition-all cursor-pointer group h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-lg line-clamp-2 group-hover:text-primary transition-colors">
                          {idea.title}
                        </CardTitle>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                      </div>
                      <Badge className={cn("w-fit gap-1", stageConfig.color)}>
                        <StageIcon className="w-3 h-3" />
                        {stageConfig.label}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      {idea.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {idea.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatRelativeTime(idea.updatedAt)}
                        </span>
                        {chatCount > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {chatCount} messages
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
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
    </AppLayout>
  );
}
