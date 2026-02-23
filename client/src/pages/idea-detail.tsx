import AppLayout from "@/components/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Lightbulb, 
  Loader2, 
  Sparkles,
  Target,
  CheckCircle2,
  XCircle,
  MessageCircle,
  ListTodo,
  Send,
  ArrowLeft,
  Trash2,
  Plus,
  Wand2,
  GripVertical,
  ChevronDown,
  StickyNote,
  CheckSquare,
  FileEdit,
  Save,
  X,
  Search,
  Pencil,
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

interface IdeaChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface IdeaTask {
  id: string;
  ideaId: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  order: number;
  createdAt: string;
}

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
  chatHistory: IdeaChatMessage[];
  createdAt: string;
  updatedAt: string;
  tasks?: IdeaTask[];
}

const TYPE_CONFIG = {
  idea: { label: 'Idea', icon: Lightbulb, color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  note: { label: 'Note', icon: StickyNote, color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
  list: { label: 'List', icon: CheckSquare, color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  document: { label: 'Document', icon: FileEdit, color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
} as const;

const STAGE_CONFIG = {
  spark: { label: 'Spark', icon: Lightbulb, color: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' },
  exploring: { label: 'Exploring', icon: MessageCircle, color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  planning: { label: 'Planning', icon: ListTodo, color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
  in_progress: { label: 'In Progress', icon: Target, color: 'bg-orange-500/20 text-orange-600 dark:text-orange-400' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'bg-green-500/20 text-green-600 dark:text-green-400' },
  dropped: { label: 'Dropped', icon: XCircle, color: 'bg-gray-500/20 text-gray-600 dark:text-gray-400' },
} as const;

export default function IdeaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newListItem, setNewListItem] = useState("");
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [listSortMode, setListSortMode] = useState<'manual' | 'az' | 'za' | 'checked-last' | 'checked-first'>('manual');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [hasUnsavedContent, setHasUnsavedContent] = useState(false);
  const [pendingContentEdit, setPendingContentEdit] = useState<string | null>(null);
  const [pendingListEdit, setPendingListEdit] = useState<Array<{text: string; isChecked: boolean}> | null>(null);
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSearchVisible, setContentSearchVisible] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const { data: idea, isLoading } = useQuery<Idea>({
    queryKey: ['/api/ideas', id],
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (idea && editingContent === null && (idea.type === 'note' || idea.type === 'document')) {
      setEditingContent(idea.content || '');
    }
  }, [idea]);

  useEffect(() => {
    setPendingContentEdit(null);
    setPendingListEdit(null);
    setMessage("");
    setEditingContent(null);
    setHasUnsavedContent(false);
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [idea?.chatHistory]);

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      const response = await apiRequest("PATCH", `/api/ideas/${id}`, { stage });
      if (!response.ok) throw new Error("Failed to update stage");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
    },
  });

  const updateListItemsMutation = useMutation({
    mutationFn: async (listItems: ListItem[]) => {
      const response = await apiRequest("PATCH", `/api/ideas/${id}`, { listItems });
      if (!response.ok) throw new Error("Failed to update list");
      return response.json();
    },
    onMutate: async (newListItems: ListItem[]) => {
      await queryClient.cancelQueries({ queryKey: ['/api/ideas', id] });
      const previousIdea = queryClient.getQueryData<Idea>(['/api/ideas', id]);
      if (previousIdea) {
        queryClient.setQueryData<Idea>(['/api/ideas', id], {
          ...previousIdea,
          listItems: newListItems,
        });
      }
      return { previousIdea };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousIdea) {
        queryClient.setQueryData(['/api/ideas', id], context.previousIdea);
      }
      toast({
        title: "Failed to update list",
        description: "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
    },
  });

  const isAutoSaveRef = useRef(false);

  const updateContentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("PATCH", `/api/ideas/${id}`, { content });
      if (!response.ok) throw new Error("Failed to save content");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      setHasUnsavedContent(false);
      if (!isAutoSaveRef.current) {
        toast({
          title: "Saved",
          description: "Your content has been saved",
        });
      }
      isAutoSaveRef.current = false;
    },
    onError: () => {
      isAutoSaveRef.current = false;
      toast({
        title: "Failed to save",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const addListItem = () => {
    if (!newListItem.trim() || !idea) return;
    const currentItems = idea.listItems || [];
    const newItem: ListItem = {
      id: crypto.randomUUID(),
      text: newListItem.trim(),
      isChecked: false,
      order: currentItems.length,
    };
    updateListItemsMutation.mutate([...currentItems, newItem]);
    setNewListItem("");
  };

  const toggleListItem = (itemId: string) => {
    if (!idea) return;
    const updatedItems = (idea.listItems || []).map(item =>
      item.id === itemId ? { ...item, isChecked: !item.isChecked } : item
    );
    updateListItemsMutation.mutate(updatedItems);
  };

  const deleteListItem = (itemId: string) => {
    if (!idea) return;
    const updatedItems = (idea.listItems || []).filter(item => item.id !== itemId);
    updateListItemsMutation.mutate(updatedItems);
  };

  const startEditingItem = (item: ListItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const saveEditingItem = () => {
    if (!idea || !editingItemId || !editingItemText.trim()) {
      setEditingItemId(null);
      return;
    }
    const updatedItems = (idea.listItems || []).map(item =>
      item.id === editingItemId ? { ...item, text: editingItemText.trim() } : item
    );
    updateListItemsMutation.mutate(updatedItems);
    setEditingItemId(null);
    setEditingItemText("");
  };

  const cancelEditingItem = () => {
    setEditingItemId(null);
    setEditingItemText("");
  };

  const filteredAndSortedItems = useMemo(() => {
    const items = idea?.listItems || [];
    let filtered = items;
    if (listSearchQuery.trim()) {
      const q = listSearchQuery.toLowerCase();
      filtered = items.filter(item => item.text.toLowerCase().includes(q));
    }
    const sorted = [...filtered];
    switch (listSortMode) {
      case 'az':
        sorted.sort((a, b) => a.text.localeCompare(b.text));
        break;
      case 'za':
        sorted.sort((a, b) => b.text.localeCompare(a.text));
        break;
      case 'checked-last':
        sorted.sort((a, b) => {
          if (a.isChecked === b.isChecked) return a.order - b.order;
          return a.isChecked ? 1 : -1;
        });
        break;
      case 'checked-first':
        sorted.sort((a, b) => {
          if (a.isChecked === b.isChecked) return a.order - b.order;
          return a.isChecked ? -1 : 1;
        });
        break;
      default:
        sorted.sort((a, b) => a.order - b.order);
    }
    return sorted;
  }, [idea?.listItems, listSearchQuery, listSortMode]);

  const handleContentChange = useCallback((value: string) => {
    setEditingContent(value);
    setHasUnsavedContent(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      isAutoSaveRef.current = true;
      updateContentMutation.mutate(value);
    }, 2000);
  }, [updateContentMutation]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const saveContent = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (editingContent !== null) {
      updateContentMutation.mutate(editingContent);
    }
  };

  const insertMarkdown = (prefix: string, suffix: string = '') => {
    const textarea = contentRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editingContent || '';
    const selected = text.substring(start, end);
    const before = text.substring(0, start);
    const after = text.substring(end);

    let newText: string;
    let newCursorPos: number;

    if (selected) {
      newText = before + prefix + selected + suffix + after;
      newCursorPos = start + prefix.length + selected.length + suffix.length;
    } else {
      newText = before + prefix + suffix + after;
      newCursorPos = start + prefix.length;
    }

    handleContentChange(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const getWordCount = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return { words: 0, chars: 0 };
    return {
      words: trimmed.split(/\s+/).length,
      chars: trimmed.length,
    };
  };

  const getSearchMatchCount = (text: string, query: string) => {
    if (!query.trim()) return 0;
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (text.match(regex) || []).length;
  };

  const chatMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const response = await apiRequest("POST", `/api/ideas/${id}/chat`, { message: messageText });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      setMessage("");
      if (data.updatedContent !== undefined) {
        setPendingContentEdit(data.updatedContent);
      }
      if (data.updatedListItems !== undefined) {
        setPendingListEdit(data.updatedListItems);
      }
    },
    onError: () => {
      toast({
        title: "Failed to send message",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const generateTasksMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/ideas/${id}/generate-tasks`);
      if (!response.ok) throw new Error("Failed to generate tasks");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      toast({
        title: "Tasks generated",
        description: `Created ${data.tasks.length} tasks to help make this idea a reality`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to generate tasks",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest("POST", `/api/ideas/${id}/tasks`, { title });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
      setNewTaskTitle("");
      setIsAddingTask(false);
    },
    onError: () => {
      toast({
        title: "Failed to add task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, updates }: { taskId: string; updates: Partial<IdeaTask> }) => {
      const response = await apiRequest("PATCH", `/api/ideas/${id}/tasks/${taskId}`, updates);
      if (!response.ok) throw new Error("Failed to update task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
    },
    onError: () => {
      toast({
        title: "Failed to update task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await apiRequest("DELETE", `/api/ideas/${id}/tasks/${taskId}`);
      if (!response.ok) throw new Error("Failed to delete task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', id] });
    },
    onError: () => {
      toast({
        title: "Failed to delete task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteIdeaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", `/api/ideas/${id}`);
      if (!response.ok) throw new Error("Failed to delete idea");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      navigate("/ideas");
      toast({
        title: "Idea deleted",
        description: "The idea has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete idea",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim() || chatMutation.isPending) return;
    chatMutation.mutate(message.trim());
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;
    createTaskMutation.mutate(newTaskTitle.trim());
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!idea) {
    return (
      <AppLayout>
        <Card className="glass-card border-white/20">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <XCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Idea not found</h3>
            <p className="text-muted-foreground mb-4">
              This idea may have been deleted
            </p>
            <Link href="/ideas">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Back to Ideas
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  const ideaType = idea.type || 'idea';
  const typeConfig = TYPE_CONFIG[ideaType as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.idea;
  const TypeIcon = typeConfig.icon;
  const stageConfig = STAGE_CONFIG[idea.stage as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.spark;
  const StageIcon = stageConfig.icon;
  const tasks = idea.tasks || [];
  const completedTasks = tasks.filter(t => t.isCompleted).length;
  const listItems = idea.listItems || [];
  const checkedCount = listItems.filter(item => item.isChecked).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <Link href="/ideas">
              <Button variant="ghost" size="icon" className="flex-shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-start gap-3">
              <div className={cn("p-2 rounded-lg flex-shrink-0", typeConfig.color)}>
                <TypeIcon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{idea.title}</h1>
                {idea.description && (
                  <p className="text-muted-foreground mt-1">{idea.description}</p>
                )}
                {ideaType === 'list' && listItems.length > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {checkedCount} of {listItems.length} completed
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 ml-12 sm:ml-0">
            {ideaType === 'idea' && (
              <Select 
                value={idea.stage} 
                onValueChange={(value) => updateStageMutation.mutate(value)}
                disabled={updateStageMutation.isPending}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STAGE_CONFIG).map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {config.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
            
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-5 h-5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this idea?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{idea.title}" and all its tasks. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => deleteIdeaMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* LIST TYPE VIEW */}
        {ideaType === 'list' && (
          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CheckSquare className="w-5 h-5 text-blue-500" />
                Items
                {listItems.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-auto">
                    {listItems.filter(i => i.isChecked).length}/{listItems.length} done
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={newListItem}
                  onChange={(e) => setNewListItem(e.target.value)}
                  placeholder="Add new item..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newListItem.trim()) {
                      addListItem();
                    }
                  }}
                />
                <Button 
                  onClick={addListItem}
                  disabled={!newListItem.trim() || updateListItemsMutation.isPending}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {listItems.length > 3 && (
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={listSearchQuery}
                      onChange={(e) => setListSearchQuery(e.target.value)}
                      placeholder="Search items..."
                      className="pl-9 h-9"
                    />
                    {listSearchQuery && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                        onClick={() => setListSearchQuery("")}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Select
                    value={listSortMode}
                    onValueChange={(v) => setListSortMode(v as typeof listSortMode)}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Original order</SelectItem>
                      <SelectItem value="az">A → Z</SelectItem>
                      <SelectItem value="za">Z → A</SelectItem>
                      <SelectItem value="checked-last">Checked last</SelectItem>
                      <SelectItem value="checked-first">Checked first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {listSearchQuery && (
                <p className="text-xs text-muted-foreground">
                  {filteredAndSortedItems.length} of {listItems.length} items match
                </p>
              )}
              
              {listItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No items yet</p>
                  <p className="text-sm mt-1">Add your first item above</p>
                </div>
              ) : filteredAndSortedItems.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Search className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items match "{listSearchQuery}"</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAndSortedItems.map((item) => (
                    <div 
                      key={item.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                    >
                      <Checkbox
                        checked={item.isChecked}
                        onCheckedChange={() => toggleListItem(item.id)}
                      />
                      {editingItemId === item.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            ref={editInputRef}
                            value={editingItemText}
                            onChange={(e) => setEditingItemText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEditingItem();
                              if (e.key === 'Escape') cancelEditingItem();
                            }}
                            onBlur={saveEditingItem}
                            className="h-8 flex-1"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <span 
                          className={cn(
                            "flex-1 cursor-pointer",
                            item.isChecked && "line-through text-muted-foreground"
                          )}
                          onClick={() => startEditingItem(item)}
                          title="Tap to edit"
                        >
                          {item.text}
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        {editingItemId !== item.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                            onClick={() => startEditingItem(item)}
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                          onClick={() => deleteListItem(item.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* NOTE/DOCUMENT TYPE VIEW */}
        {(ideaType === 'note' || ideaType === 'document') && (
          <Card className="glass-card border-white/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                {ideaType === 'note' ? (
                  <>
                    <StickyNote className="w-5 h-5 text-emerald-500" />
                    Note
                  </>
                ) : (
                  <>
                    <FileEdit className="w-5 h-5 text-purple-500" />
                    Document
                  </>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setContentSearchVisible(!contentSearchVisible)}
                    title="Search in content"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                  {hasUnsavedContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={saveContent}
                      disabled={updateContentMutation.isPending}
                      className="h-8 gap-1 text-xs"
                    >
                      {updateContentMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      Save
                    </Button>
                  )}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {contentSearchVisible && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={contentSearchQuery}
                    onChange={(e) => setContentSearchQuery(e.target.value)}
                    placeholder="Find in text..."
                    className="pl-9 h-9 pr-20"
                    autoFocus
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {contentSearchQuery && (
                      <span className="text-xs text-muted-foreground">
                        {getSearchMatchCount(editingContent || '', contentSearchQuery)} found
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => { setContentSearchQuery(""); setContentSearchVisible(false); }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}

              {ideaType === 'document' && (
                <div className="flex flex-wrap gap-1 p-2 rounded-lg border bg-muted/30">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('**', '**')} title="Bold">
                    <Bold className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('*', '*')} title="Italic">
                    <Italic className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-6 bg-border self-center mx-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('# ')} title="Heading 1">
                    <Heading1 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('## ')} title="Heading 2">
                    <Heading2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('### ')} title="Heading 3">
                    <Heading3 className="w-4 h-4" />
                  </Button>
                  <div className="w-px h-6 bg-border self-center mx-1" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('- ')} title="Bullet list">
                    <List className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('1. ')} title="Numbered list">
                    <ListOrdered className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => insertMarkdown('\n---\n')} title="Horizontal rule">
                    <Minus className="w-4 h-4" />
                  </Button>
                </div>
              )}

              <Textarea
                ref={contentRef}
                value={editingContent || ''}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder={ideaType === 'note' 
                  ? "Write your note here..."
                  : "Write your document content here. Use the toolbar above for formatting..."
                }
                className={cn(
                  "resize-y font-mono",
                  ideaType === 'document' ? "min-h-[500px]" : "min-h-[300px]"
                )}
              />

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  {(() => {
                    const counts = getWordCount(editingContent || '');
                    return (
                      <>
                        <span>{counts.words} {counts.words === 1 ? 'word' : 'words'}</span>
                        <span>{counts.chars} {counts.chars === 1 ? 'character' : 'characters'}</span>
                      </>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-1">
                  {updateContentMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : hasUnsavedContent ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span>Auto-saves in 2s</span>
                    </>
                  ) : editingContent !== null ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span>Saved</span>
                    </>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI ASSISTANCE CARD FOR NON-IDEA TYPES */}
        {(ideaType === 'list' || ideaType === 'note' || ideaType === 'document') && (
          <Card className="glass-card border-white/20 flex flex-col h-[400px]">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                AI Assistant
              </CardTitle>
              <CardDescription>
                {ideaType === 'list' 
                  ? "Get suggestions for items, organization, or alternatives"
                  : ideaType === 'note'
                  ? "Ask questions about your note or get help organizing"
                  : "Get writing feedback, suggestions, or help expanding content"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                {(!idea.chatHistory || idea.chatHistory.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Ask AI for assistance</p>
                    {ideaType === 'list' && (
                      <p className="text-sm mt-1">e.g., "What else might I need for a camping trip?"</p>
                    )}
                    {ideaType === 'note' && (
                      <p className="text-sm mt-1">e.g., "Can you summarize the key points?"</p>
                    )}
                    {ideaType === 'document' && (
                      <p className="text-sm mt-1">e.g., "How can I make this clearer?"</p>
                    )}
                  </div>
                ) : (
                  idea.chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg px-4 py-2",
                          msg.role === 'user'
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          msg.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {chatMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
                {(pendingContentEdit !== null || pendingListEdit !== null) && (
                  <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Wand2 className="w-4 h-4" />
                      AI has suggested changes
                    </div>
                    {pendingContentEdit !== null && (
                      <div className="bg-background rounded border p-3 max-h-[200px] overflow-y-auto">
                        <p className="text-sm whitespace-pre-wrap">{pendingContentEdit}</p>
                      </div>
                    )}
                    {pendingListEdit !== null && (
                      <div className="bg-background rounded border p-2 max-h-[200px] overflow-y-auto space-y-1">
                        {pendingListEdit.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-sm py-1 px-2">
                            <span className={cn(
                              "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                              item.isChecked ? "bg-primary border-primary" : "border-muted-foreground/30"
                            )}>
                              {item.isChecked && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                            </span>
                            <span className={item.isChecked ? "line-through text-muted-foreground" : ""}>{item.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1"
                        onClick={() => {
                          if (pendingContentEdit !== null) {
                            updateContentMutation.mutate(pendingContentEdit);
                            setEditingContent(pendingContentEdit);
                            setPendingContentEdit(null);
                          }
                          if (pendingListEdit !== null) {
                            const newItems = pendingListEdit.map((item, idx) => ({
                              id: crypto.randomUUID(),
                              text: item.text,
                              isChecked: item.isChecked,
                              order: idx,
                            }));
                            updateListItemsMutation.mutate(newItems);
                            setPendingListEdit(null);
                          }
                          toast({
                            title: "Changes applied",
                            description: "AI edits have been saved",
                          });
                        }}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Apply Changes
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setPendingContentEdit(null);
                          setPendingListEdit(null);
                          toast({
                            title: "Changes rejected",
                            description: "Ask AI to try again if you'd like",
                          });
                        }}
                      >
                        <X className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              <div className="flex-shrink-0 flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask AI for help..."
                  className="min-h-[60px] max-h-[150px] resize-none"
                  rows={2}
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!message.trim() || chatMutation.isPending}
                  size="icon"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* IDEA TYPE VIEW - AI Chat and Tasks */}
        {ideaType === 'idea' && (
          <div className="grid gap-6 lg:grid-cols-2">
          <Card className="glass-card border-white/20 flex flex-col h-[500px]">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                Brainstorm with AI
              </CardTitle>
              <CardDescription>
                Explore and refine your idea through conversation
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                {(!idea.chatHistory || idea.chatHistory.length === 0) ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Start a conversation to explore your idea</p>
                    <p className="text-sm mt-1">Ask questions, get feedback, or brainstorm together</p>
                  </div>
                ) : (
                  idea.chatHistory.map((msg, index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[85%] rounded-lg px-4 py-2",
                          msg.role === 'user'
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <p className={cn(
                          "text-xs mt-1",
                          msg.role === 'user' ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {chatMutation.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              <div className="flex-shrink-0 flex gap-2 items-end">
                <Textarea
                  ref={inputRef}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className="min-h-[100px] max-h-[200px] resize-none"
                  rows={4}
                />
                <Button 
                  onClick={handleSendMessage} 
                  disabled={!message.trim() || chatMutation.isPending}
                  size="icon"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-white/20 flex flex-col h-[500px]">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ListTodo className="w-5 h-5 text-purple-500" />
                    Tasks
                    {tasks.length > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {completedTasks}/{tasks.length}
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Break down your idea into actionable steps
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateTasksMutation.mutate()}
                  disabled={generateTasksMutation.isPending}
                  className="gap-2"
                >
                  {generateTasksMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wand2 className="w-4 h-4" />
                  )}
                  AI Generate
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 pr-2">
                {tasks.length === 0 && !isAddingTask ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No tasks yet</p>
                    <p className="text-sm mt-1">Add tasks manually or let AI generate them</p>
                  </div>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                        task.isCompleted 
                          ? "bg-muted/50 border-transparent" 
                          : "bg-card border-border hover:border-primary/30"
                      )}
                    >
                      <Checkbox
                        checked={task.isCompleted}
                        onCheckedChange={(checked) => 
                          updateTaskMutation.mutate({ 
                            taskId: task.id, 
                            updates: { isCompleted: !!checked } 
                          })
                        }
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm",
                          task.isCompleted && "line-through text-muted-foreground"
                        )}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {task.description}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTaskMutation.mutate(task.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))
                )}
                
                {isAddingTask && (
                  <div className="flex items-center gap-2 p-2">
                    <Input
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="Task title..."
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddTask();
                        if (e.key === 'Escape') {
                          setIsAddingTask(false);
                          setNewTaskTitle("");
                        }
                      }}
                    />
                    <Button size="sm" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
                      Add
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => {
                        setIsAddingTask(false);
                        setNewTaskTitle("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
              
              {!isAddingTask && (
                <Button
                  variant="outline"
                  className="w-full gap-2 flex-shrink-0"
                  onClick={() => setIsAddingTask(true)}
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </div>
    </AppLayout>
  );
}
