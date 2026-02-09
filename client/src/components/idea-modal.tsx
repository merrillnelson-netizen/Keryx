import { useState, useEffect, useRef } from "react";
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
  const [editingContent, setEditingContent] = useState<string | null>(null);
  const [hasUnsavedContent, setHasUnsavedContent] = useState(false);
  const [activeTab, setActiveTab] = useState<'main' | 'chat'>('main');
  const [pendingContentEdit, setPendingContentEdit] = useState<string | null>(null);
  const [pendingListEdit, setPendingListEdit] = useState<Array<{text: string; isChecked: boolean}> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (!open) {
      setMessage("");
      setNewTaskTitle("");
      setIsAddingTask(false);
      setNewListItem("");
      setEditingContent(null);
      setHasUnsavedContent(false);
      setActiveTab('main');
      setPendingContentEdit(null);
      setPendingListEdit(null);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ideas', ideaId] });
      queryClient.invalidateQueries({ queryKey: ['/api/ideas'] });
    },
    onError: () => {
      toast({
        title: "Failed to update list",
        description: "Please try again",
        variant: "destructive",
      });
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
      toast({
        title: "Saved",
        description: "Your content has been saved",
      });
    },
    onError: () => {
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

  const handleContentChange = (value: string) => {
    setEditingContent(value);
    setHasUnsavedContent(true);
  };

  const saveContent = () => {
    if (editingContent !== null) {
      updateContentMutation.mutate(editingContent);
    }
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
      <DialogContent className="max-w-2xl w-[95vw] h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] flex flex-col p-0 gap-0 overflow-hidden top-[calc(50%+32px)] rounded-xl">
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
                <div className="flex items-center gap-1 flex-shrink-0">
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
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
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
                  <div className="flex gap-2 sticky top-0 bg-background pb-2">
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
                  
                  {listItems.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="font-medium">No items yet</p>
                      <p className="text-sm mt-1">Add your first item above</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {listItems
                        .sort((a, b) => a.order - b.order)
                        .map((item) => (
                        <div 
                          key={item.id}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
                        >
                          <Checkbox
                            checked={item.isChecked}
                            onCheckedChange={() => toggleListItem(item.id)}
                          />
                          <span className={cn(
                            "flex-1 text-sm",
                            item.isChecked && "line-through text-muted-foreground"
                          )}>
                            {item.text}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => deleteListItem(item.id)}
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(ideaType === 'note' || ideaType === 'document') && activeTab === 'main' && (
                <div className="flex-1 overflow-hidden flex flex-col p-4">
                  <Textarea
                    value={editingContent || ''}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder={ideaType === 'note' 
                      ? "Write your note here..."
                      : "Write your document content here..."
                    }
                    className="flex-1 min-h-0 resize-none"
                  />
                  {hasUnsavedContent && (
                    <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      Unsaved changes
                    </p>
                  )}
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
