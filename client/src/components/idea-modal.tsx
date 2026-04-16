import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
const ReactMarkdown = lazy(() => import('react-markdown'));
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Trash2,
  Plus,
  Wand2,
  StickyNote,
  CheckSquare,
  FileEdit,
  Save,
  X,
  Search,
  Pencil,
  Eye,
  PenLine,
} from "lucide-react";

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

interface IdeaModalProps {
  ideaId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void;
}

export function IdeaModal({ ideaId, open, onOpenChange, onDelete }: IdeaModalProps) {
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
  const [activeTab, setActiveTab] = useState<'main' | 'chat'>('main');
  const [pendingContentEdit, setPendingContentEdit] = useState<string | null>(null);
  const [pendingListEdit, setPendingListEdit] = useState<Array<{text: string; isChecked: boolean}> | null>(null);
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSearchVisible, setContentSearchVisible] = useState(false);
  const [documentPreviewMode, setDocumentPreviewMode] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoSaveRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const autoTriggeredChatRef = useRef(false);

  const { data: idea, isLoading } = useQuery<Idea>({
    queryKey: ['/api/ideas', ideaId],
    enabled: !!ideaId && open,
  });

  useEffect(() => {
    if (idea && editingContent === null && (idea.type === 'note' || idea.type === 'document')) {
      setEditingContent(idea.content || '');
    }
  }, [idea]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [idea?.chatHistory]);

  // Auto-trigger AI suggestions when switching to chat tab on a fresh list
  useEffect(() => {
    if (
      activeTab === 'chat' &&
      idea &&
      idea.type === 'list' &&
      !autoTriggeredChatRef.current &&
      !chatMutation.isPending &&
      (!idea.chatHistory || (idea.chatHistory as any[]).length === 0)
    ) {
      autoTriggeredChatRef.current = true;
      const listItems = (idea.listItems as Array<{text: string; isChecked: boolean}>) || [];
      const prompt = listItems.length === 0
        ? `I just created a list called "${idea.title}". What items do you suggest I add to it?`
        : `Here's my list "${idea.title}" with ${listItems.length} item${listItems.length !== 1 ? 's' : ''}. What else might I be missing or should consider adding?`;
      chatMutation.mutate(prompt);
    }
  }, [activeTab, idea?.type, idea?.id]);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setNewTaskTitle("");
      setIsAddingTask(false);
      setNewListItem("");
      setListSearchQuery("");
      setListSortMode('manual');
      setEditingItemId(null);
      setEditingItemText("");
      setEditingContent(null);
      setHasUnsavedContent(false);
      setActiveTab('main');
      setPendingContentEdit(null);
      setPendingListEdit(null);
      setContentSearchQuery("");
      setContentSearchVisible(false);
      setDocumentPreviewMode(false);
      autoTriggeredChatRef.current = false;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    }
  }, [open]);

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      const response = await apiRequest("PATCH", `/api/ideas/${ideaId}`, { stage });
      if (!response.ok) throw new Error("Failed to update stage");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
    },
  });

  const updateListItemsMutation = useMutation({
    mutationFn: async (listItems: ListItem[]) => {
      const response = await apiRequest("PATCH", `/api/ideas/${ideaId}`, { listItems });
      if (!response.ok) throw new Error("Failed to update list");
      return response.json();
    },
    onMutate: async (newListItems: ListItem[]) => {
      await queryClient.cancelQueries({ queryKey: ['/api/ideas', ideaId] });
      const previousIdea = queryClient.getQueryData<Idea>(['/api/ideas', ideaId]);
      if (previousIdea) {
        queryClient.setQueryData<Idea>(['/api/ideas', ideaId], {
          ...previousIdea,
          listItems: newListItems,
        });
      }
      return { previousIdea };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousIdea) {
        queryClient.setQueryData(['/api/ideas', ideaId], context.previousIdea);
      }
      toast({
        title: "Failed to update list",
        description: "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
    },
  });

  const updateContentMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("PATCH", `/api/ideas/${ideaId}`, { content });
      if (!response.ok) throw new Error("Failed to save content");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
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

  const chatMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const response = await apiRequest("POST", `/api/ideas/${ideaId}/chat`, { message: messageText });
      if (!response.ok) throw new Error("Failed to send message");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
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
      const response = await apiRequest("POST", `/api/ideas/${ideaId}/generate-tasks`);
      if (!response.ok) throw new Error("Failed to generate tasks");
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
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
      const response = await apiRequest("POST", `/api/ideas/${ideaId}/tasks`, { title });
      if (!response.ok) throw new Error("Failed to create task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
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
      const response = await apiRequest("PATCH", `/api/ideas/${ideaId}/tasks/${taskId}`, updates);
      if (!response.ok) throw new Error("Failed to update task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
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
      const response = await apiRequest("DELETE", `/api/ideas/${ideaId}/tasks/${taskId}`);
      if (!response.ok) throw new Error("Failed to delete task");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
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
      const response = await apiRequest("DELETE", `/api/ideas/${ideaId}`);
      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
      onOpenChange(false);
      onDelete?.();
      toast({
        title: "Deleted",
        description: "The item has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete",
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

  const saveContent = () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (editingContent !== null) {
      updateContentMutation.mutate(editingContent);
    }
  };

  const getWordCount = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  };

  const getSearchMatchCount = (text: string, query: string) => {
    if (!query.trim() || !text) return 0;
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return (text.match(regex) || []).length;
  };


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

  if (!ideaId) return null;

  const ideaType = idea?.type || 'idea';
  const typeConfig = TYPE_CONFIG[ideaType as keyof typeof TYPE_CONFIG] || TYPE_CONFIG.idea;
  const TypeIcon = typeConfig.icon;
  const tasks = idea?.tasks || [];
  const completedTasks = tasks.filter(t => t.isCompleted).length;
  const listItems = idea?.listItems || [];
  const checkedCount = listItems.filter(item => item.isChecked).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] h-[calc(100vh-120px)] max-h-[calc(100vh-120px)] flex flex-col p-0 gap-0 overflow-hidden top-[calc(50%+40px)] rounded-xl">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !idea ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <XCircle className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Not found</h3>
            <p className="text-muted-foreground">This item may have been deleted</p>
          </div>
        ) : (
          <>
            <DialogHeader className="flex-shrink-0 p-4 pb-2 border-b">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={cn("p-2 rounded-lg flex-shrink-0", typeConfig.color)}>
                    <TypeIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <DialogTitle className="text-lg font-semibold truncate">
                      {idea.title}
                    </DialogTitle>
                    {ideaType === 'list' && listItems.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {checkedCount} of {listItems.length} completed
                      </p>
                    )}
                    {ideaType === 'idea' && (
                      <div className="flex items-center gap-2 mt-1">
                        <Select 
                          value={idea.stage} 
                          onValueChange={(value) => updateStageMutation.mutate(value)}
                          disabled={updateStageMutation.isPending}
                        >
                          <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STAGE_CONFIG).map(([key, config]) => {
                              const Icon = config.icon;
                              return (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    <Icon className="w-3 h-3" />
                                    {config.label}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 mr-6">
                  {(ideaType === 'note' || ideaType === 'document') && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setContentSearchVisible(!contentSearchVisible)}
                      title="Search in content"
                    >
                      <Search className="w-4 h-4" />
                    </Button>
                  )}
                  {(ideaType === 'note' || ideaType === 'document') && hasUnsavedContent && (
                    <Button 
                      onClick={saveContent}
                      disabled={updateContentMutation.isPending}
                      size="sm"
                      className="gap-1"
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
              </div>
            </DialogHeader>

            {(ideaType === 'idea' || ideaType === 'note' || ideaType === 'document') && (
              <div className="flex border-b flex-shrink-0">
                <button
                  onClick={() => setActiveTab('main')}
                  className={cn(
                    "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                    activeTab === 'main' 
                      ? "border-b-2 border-primary text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center justify-center gap-2">
                    {ideaType === 'idea' ? (
                      <>
                        <ListTodo className="w-4 h-4" />
                        Tasks
                        {tasks.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {completedTasks}/{tasks.length}
                          </Badge>
                        )}
                      </>
                    ) : ideaType === 'note' ? (
                      <>
                        <StickyNote className="w-4 h-4" />
                        Note
                      </>
                    ) : (
                      <>
                        <FileEdit className="w-4 h-4" />
                        Document
                      </>
                    )}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "flex-1 px-4 py-2 text-sm font-medium transition-colors",
                    activeTab === 'chat' 
                      ? "border-b-2 border-primary text-primary" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="flex items-center justify-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    {ideaType === 'idea' ? 'Brainstorm' : 'AI Help'}
                  </span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-hidden flex flex-col">
              {ideaType === 'list' && activeTab === 'main' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex gap-2 sticky top-0 bg-background pb-2 z-10">
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
                      size="icon"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {listItems.length >= 3 && (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={listSearchQuery}
                          onChange={(e) => setListSearchQuery(e.target.value)}
                          placeholder="Search items..."
                          className="h-8 pl-8 text-sm"
                        />
                        {listSearchQuery && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
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
                        <SelectTrigger className="w-[130px] h-8 text-xs">
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
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No items yet</p>
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
                                "flex-1 text-sm cursor-pointer",
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
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => startEditingItem(item)}
                              >
                                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => deleteListItem(item.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(ideaType === 'note' || ideaType === 'document') && activeTab === 'main' && (
                <div className="flex-1 overflow-hidden flex flex-col p-4">
                  {contentSearchVisible && (
                    <div className="relative mb-2">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={contentSearchQuery}
                        onChange={(e) => setContentSearchQuery(e.target.value)}
                        placeholder="Search in content..."
                        className="h-8 pl-8 pr-16 text-sm"
                        autoFocus
                      />
                      <span className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {contentSearchQuery ? `${getSearchMatchCount(editingContent || '', contentSearchQuery)} found` : ''}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                        onClick={() => { setContentSearchVisible(false); setContentSearchQuery(""); }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                  {ideaType === 'document' && (
                    <div className="flex items-center gap-1 mb-2 pb-2 border-b">
                      <Button
                        variant={documentPreviewMode ? "ghost" : "secondary"}
                        size="sm"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => setDocumentPreviewMode(false)}
                      >
                        <PenLine className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant={documentPreviewMode ? "secondary" : "ghost"}
                        size="sm"
                        className="gap-1.5 h-7 text-xs"
                        onClick={() => setDocumentPreviewMode(true)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </Button>
                      <span className="text-xs text-muted-foreground ml-auto">
                        Supports markdown formatting
                      </span>
                    </div>
                  )}
                  {ideaType === 'document' && documentPreviewMode ? (
                    <div className="flex-1 min-h-0 overflow-y-auto rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none">
                      {(editingContent || '').trim() ? (
                        <Suspense fallback={<Loader2 className="w-4 h-4 animate-spin" />}>
                          <ReactMarkdown>{editingContent || ''}</ReactMarkdown>
                        </Suspense>
                      ) : (
                        <p className="text-muted-foreground italic">Nothing to preview yet</p>
                      )}
                    </div>
                  ) : (
                    <Textarea
                      ref={contentRef}
                      value={editingContent || ''}
                      onChange={(e) => handleContentChange(e.target.value)}
                      placeholder={ideaType === 'note' 
                        ? "Write your note here..."
                        : "Write using markdown: **bold**, *italic*, # heading, - list..."
                      }
                      className={cn("flex-1 min-h-0 resize-none", ideaType === 'document' && "font-mono text-sm")}
                    />
                  )}
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {getWordCount(editingContent || '')} words · {(editingContent || '').length} chars
                    </span>
                    <span className="flex items-center gap-1">
                      {updateContentMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </>
                      ) : hasUnsavedContent ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                          Auto-saves in 2s
                        </>
                      ) : editingContent !== null && editingContent !== (idea?.content || '') ? null : (
                        editingContent !== null ? 'Saved' : null
                      )}
                    </span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-dashed flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                    <span className="text-xs text-muted-foreground flex-1">Ask AI to help with formatting or content</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => setActiveTab('chat')}
                    >
                      <MessageCircle className="w-3 h-3" />
                      Get AI Help
                    </Button>
                  </div>
                </div>
              )}

              {ideaType === 'idea' && activeTab === 'main' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Break down your idea into steps</h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generateTasksMutation.mutate()}
                      disabled={generateTasksMutation.isPending}
                      className="gap-1"
                    >
                      {generateTasksMutation.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Wand2 className="w-3 h-3" />
                      )}
                      AI Generate
                    </Button>
                  </div>

                  {tasks.length === 0 && !isAddingTask ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ListTodo className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No tasks yet</p>
                      <p className="text-sm mt-1">Add tasks manually or let AI generate them</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.map((task) => (
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
                      ))}
                    </div>
                  )}

                  {isAddingTask && (
                    <div className="flex items-center gap-2 p-2 border rounded-lg">
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

                  {!isAddingTask && (
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => setIsAddingTask(true)}
                    >
                      <Plus className="w-4 h-4" />
                      Add Task
                    </Button>
                  )}
                </div>
              )}

              {((ideaType === 'idea' && activeTab === 'chat') || 
                (ideaType === 'list' && activeTab === 'chat') ||
                ((ideaType === 'note' || ideaType === 'document') && activeTab === 'chat')) && (
                <div className="flex-1 flex flex-col min-h-0 p-4 pt-0">
                  <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                    {(!idea.chatHistory || idea.chatHistory.length === 0) ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">
                          {ideaType === 'idea' 
                            ? "Start a conversation to explore your idea"
                            : "Ask AI for assistance"}
                        </p>
                        <p className="text-sm mt-1">
                          {ideaType === 'idea' && "Ask questions, get feedback, or brainstorm together"}
                          {ideaType === 'list' && "e.g., \"What else might I need?\""}
                          {ideaType === 'note' && "e.g., \"Can you summarize the key points?\""}
                          {ideaType === 'document' && "e.g., \"How can I make this clearer?\""}
                        </p>
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
                              "max-w-[85%] rounded-lg px-3 py-2",
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
                        <div className="bg-muted rounded-lg px-3 py-2">
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
                        {pendingListEdit !== null && (() => {
                          const existingTexts = new Set(
                            ((idea.listItems as Array<{text: string}>) || []).map(i => i.text.trim().toLowerCase())
                          );
                          const newItems = pendingListEdit.filter(i => !existingTexts.has(i.text.trim().toLowerCase()));
                          const keptItems = pendingListEdit.filter(i => existingTexts.has(i.text.trim().toLowerCase()));
                          return (
                            <div className="space-y-1.5">
                              {newItems.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-emerald-500 mb-1 flex items-center gap-1">
                                    <Plus className="w-3 h-3" />
                                    {newItems.length} new item{newItems.length !== 1 ? 's' : ''} to add
                                  </p>
                                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2 space-y-1">
                                    {newItems.map((item, idx) => (
                                      <div key={idx} className="flex items-center gap-2 text-sm py-0.5">
                                        <Plus className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                                        <span className="text-emerald-700 dark:text-emerald-300">{item.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {keptItems.length > 0 && (
                                <p className="text-xs text-muted-foreground">{keptItems.length} existing item{keptItems.length !== 1 ? 's' : ''} preserved</p>
                              )}
                            </div>
                          );
                        })()}
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
                  
                  {(ideaType === 'note' || ideaType === 'document' || ideaType === 'list') && (
                    <div className="flex-shrink-0 flex flex-wrap gap-1.5 mb-2">
                      {ideaType === 'note' && [
                        "Fix grammar & spelling",
                        "Summarize key points",
                        "Expand this note",
                        "Add bullet points",
                        "Make it clearer",
                      ].map(chip => (
                        <button
                          key={chip}
                          onClick={() => { chatMutation.mutate(chip); }}
                          disabled={chatMutation.isPending}
                          className="text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {chip}
                        </button>
                      ))}
                      {ideaType === 'document' && [
                        "Improve structure",
                        "Improve formatting",
                        "Add an introduction",
                        "Add a conclusion",
                        "Fix grammar",
                        "Make it clearer",
                      ].map(chip => (
                        <button
                          key={chip}
                          onClick={() => { chatMutation.mutate(chip); }}
                          disabled={chatMutation.isPending}
                          className="text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {chip}
                        </button>
                      ))}
                      {ideaType === 'list' && [
                        "What else should I add?",
                        "Group these by category",
                        "Sort by priority",
                        "Remove duplicates",
                      ].map(chip => (
                        <button
                          key={chip}
                          onClick={() => { chatMutation.mutate(chip); }}
                          disabled={chatMutation.isPending}
                          className="text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex-shrink-0 flex gap-2 items-end">
                    <Textarea
                      ref={inputRef}
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={ideaType === 'idea' ? "Type a message..." : "Ask AI for help..."}
                      className="min-h-[44px] max-h-[120px] resize-none"
                      rows={1}
                    />
                    <Button 
                      onClick={handleSendMessage} 
                      disabled={!message.trim() || chatMutation.isPending}
                      size="icon"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}

              {ideaType === 'list' && (
                <div className="flex-shrink-0 border-t p-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setActiveTab(activeTab === 'chat' ? 'main' : 'chat')}
                  >
                    <MessageCircle className="w-4 h-4" />
                    {activeTab === 'chat' ? 'Back to List' : 'AI Suggestions'}
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 border-t border-dashed p-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 gap-2">
                    <Trash2 className="w-4 h-4" />
                    Delete {typeConfig.label}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this {typeConfig.label.toLowerCase()}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{idea.title}". This action cannot be undone.
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
