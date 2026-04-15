import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import AppLayout from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Loader2,
  Bookmark,
  BookOpen,
  Pencil,
  ChevronDown,
  Bot,
  Menu,
  X,
  Sparkles,
  Mic,
  MicOff,
} from "lucide-react";
import { KeryxLogoIcon } from "@/components/keryx-logo";
import { useVoiceInput } from "@/hooks/use-voice-input";

interface AiChatSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

interface AiChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  savedAs: "ecosystem" | "memory" | null;
  savedAt: string | null;
}

interface SummaryCandidate {
  text: string;
  type: "save" | "log";
}

interface SummaryOffer {
  candidates: SummaryCandidate[];
}

const SAVE_TRIGGERS = ["save that", "log that", "remember that", "save this", "log this"];

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function MessageBubble({
  message,
  onSaveThat,
  onLogThat,
  isSaving,
}: {
  message: AiChatMessage;
  onSaveThat: (msg: AiChatMessage) => void;
  onLogThat: (msg: AiChatMessage) => void;
  isSaving: boolean;
}) {
  const isUser = message.role === "user";
  const alreadySaved = !!message.savedAs;

  return (
    <div className={cn("flex gap-3 group", isUser ? "flex-row-reverse" : "flex-row")}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
          <KeryxLogoIcon className="w-5 h-5" />
        </div>
      )}
      <div className={cn("flex flex-col gap-1 max-w-[75%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words",
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-muted text-foreground rounded-tl-sm"
          )}
        >
          {message.content}
        </div>
        <div className={cn("flex items-center gap-2", isUser ? "flex-row-reverse" : "flex-row")}>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(message.timestamp)}
          </span>
          {!isUser && (
            <div className={cn(
              "flex items-center gap-1 transition-opacity",
              alreadySaved ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover:opacity-100"
            )}>
              {alreadySaved ? (
                <Badge variant="outline" className="text-xs h-5 gap-1 px-1.5">
                  {message.savedAs === "ecosystem" ? (
                    <><Bookmark className="w-3 h-3 text-violet-500" />Saved</>
                  ) : (
                    <><BookOpen className="w-3 h-3 text-emerald-500" />Logged</>
                  )}
                </Badge>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => onSaveThat(message)}
                    className="h-6 px-2 text-xs gap-1 text-violet-600 dark:text-violet-400 hover:bg-violet-500/10"
                    title="Save That — saves to AI context across Keryx"
                  >
                    <Bookmark className="w-3 h-3" />
                    Save That
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => onLogThat(message)}
                    className="h-6 px-2 text-xs gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                    title="Log That — logs as a memory entry in your History"
                  >
                    <BookOpen className="w-3 h-3" />
                    Log That
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionList({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  sessions: AiChatSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <Button onClick={onNew} className="w-full gap-2" size="sm">
          <Plus className="w-4 h-4" />
          New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8 px-4">
            No conversations yet. Start a new chat.
          </p>
        )}
        {sessions.map((session) => (
          <div
            key={session.id}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors",
              activeId === session.id
                ? "bg-primary/10 text-foreground"
                : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onSelect(session.id)}
          >
            <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.title}</p>
              <p className="text-xs opacity-60">{formatRelativeTime(session.lastMessageAt)}</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{session.title}" and all its messages will be permanently deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(session.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { toast } = useToast();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [savingMsgId, setSavingMsgId] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [summaryOffer, setSummaryOffer] = useState<SummaryOffer | null>(null);
  const [savingCandidateIdx, setSavingCandidateIdx] = useState<number | null>(null);
  const [savedCandidates, setSavedCandidates] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Voice-to-text: replaces the "voice portion" so interim + final don't double up
  const voiceBaseRef = useRef<string>("");
  const { isListening, isSupported: isVoiceSupported, startListening: _startListening, stopListening } = useVoiceInput(
    useCallback((transcript: string) => {
      if (transcript) {
        const base = voiceBaseRef.current;
        setInput(base ? `${base} ${transcript}` : transcript);
      }
    }, [])
  );
  const startListening = useCallback(() => {
    voiceBaseRef.current = input.trimEnd();
    _startListening();
  }, [input, _startListening]);

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [input]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery<AiChatSession[]>({
    queryKey: ["/api/chat/sessions"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<AiChatMessage[]>({
    queryKey: ["/api/chat/sessions", activeSessionId, "messages"],
    enabled: !!activeSessionId,
  });

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // Auto-select first session or create new
  useEffect(() => {
    if (!sessionsLoading && sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, sessionsLoading, activeSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const createSessionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/chat/sessions", {});
      if (!res.ok) throw new Error("Failed to create session");
      return res.json() as Promise<AiChatSession>;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setActiveSessionId(session.id);
      setMobileSheetOpen(false);
    },
    onError: () => toast({ title: "Failed to create chat", variant: "destructive" }),
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/chat/sessions/${id}`, undefined);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : null);
      }
    },
    onError: () => toast({ title: "Failed to delete conversation", variant: "destructive" }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ sessionId, content }: { sessionId: string; content: string }) => {
      const res = await apiRequest("POST", `/api/chat/sessions/${sessionId}/messages`, { content });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json() as Promise<{ userMessage: AiChatMessage; aiMessage: AiChatMessage; summaryOffer: SummaryOffer | null; intentCandidates: SummaryCandidate[] | null }>;
    },
    onSuccess: (data, variables) => {
      // Use the sessionId from mutation variables (not ambient state) to avoid stale-closure race
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", variables.sessionId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      // Intent candidates take priority (typed "save that" / "log that")
      if (data.intentCandidates && data.intentCandidates.length > 0) {
        setSummaryOffer({ candidates: data.intentCandidates });
        setSavedCandidates(new Set());
      } else if (data.summaryOffer && data.summaryOffer.candidates.length > 0) {
        setSummaryOffer(data.summaryOffer);
        setSavedCandidates(new Set());
      }
    },
    onError: () => toast({ title: "Failed to send message", variant: "destructive" }),
  });

  const saveMessageMutation = useMutation({
    mutationFn: async ({ msgId, savedAs }: { msgId: string; savedAs: "ecosystem" | "memory" }) => {
      const res = await apiRequest("POST", `/api/chat/messages/${msgId}/save`, { savedAs });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: (_, { savedAs }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions", activeSessionId, "messages"] });
      setSavingMsgId(null);
      toast({
        title: savedAs === "ecosystem" ? "Saved to AI context" : "Logged to your memories",
        description:
          savedAs === "ecosystem"
            ? "Keryx will use this across briefings, chat, and insights."
            : "Added to your History with full AI processing.",
      });
    },
    onError: () => {
      setSavingMsgId(null);
      toast({ title: "Failed to save", variant: "destructive" });
    },
  });

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sendMessageMutation.isPending) return;

    let sessionId = activeSessionId;

    // Create session if none exists
    if (!sessionId) {
      const res = await apiRequest("POST", "/api/chat/sessions", {});
      if (!res.ok) { toast({ title: "Failed to start chat", variant: "destructive" }); return; }
      const session = await res.json() as AiChatSession;
      queryClient.invalidateQueries({ queryKey: ["/api/chat/sessions"] });
      setActiveSessionId(session.id);
      sessionId = session.id;
    }

    setInput("");
    sendMessageMutation.mutate({ sessionId, content: trimmed });
  }, [input, activeSessionId, sendMessageMutation, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveThat = (msg: AiChatMessage) => {
    setSavingMsgId(msg.id);
    saveMessageMutation.mutate({ msgId: msg.id, savedAs: "ecosystem" });
  };

  const handleLogThat = (msg: AiChatMessage) => {
    setSavingMsgId(msg.id);
    saveMessageMutation.mutate({ msgId: msg.id, savedAs: "memory" });
  };

  const handleSelect = (id: string) => {
    setActiveSessionId(id);
    setSummaryOffer(null);
    setSavedCandidates(new Set());
    setMobileSheetOpen(false);
  };

  const handleSaveCandidate = async (candidate: SummaryCandidate, idx: number) => {
    setSavingCandidateIdx(idx);
    try {
      const savedAs = candidate.type === "save" ? "ecosystem" : "memory";
      if (savedAs === "ecosystem") {
        await apiRequest("POST", "/api/profile/observations", {
          observation: candidate.text,
          category: "patterns",
          evidenceSummary: "Saved from Keryx Chat session summary",
          status: "confirmed",
        });
        toast({ title: "Saved to AI context", description: "Keryx will use this across briefings, chat, and insights." });
      } else {
        await apiRequest("POST", "/api/memories", { memoryText: candidate.text });
        toast({ title: "Logged to memories", description: "Added to your History with full AI processing." });
      }
      setSavedCandidates((prev) => new Set([...Array.from(prev), idx]));
    } catch {
      toast({ title: "Failed to save", variant: "destructive" });
    } finally {
      setSavingCandidateIdx(null);
    }
  };

  const isEmpty = !messagesLoading && messages.length === 0;

  return (
    <AppLayout>
      <div className="flex h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)] -mx-4 -mt-4 md:-mx-6 md:-mt-6">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r bg-background/50 backdrop-blur-sm flex-shrink-0">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Bot className="w-4 h-4 text-primary" />
              Conversations
            </h2>
          </div>
          <SessionList
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={handleSelect}
            onNew={() => createSessionMutation.mutate()}
            onDelete={(id) => deleteSessionMutation.mutate(id)}
          />
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b bg-background/80 backdrop-blur-sm flex-shrink-0">
            {/* Mobile: session picker */}
            <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden flex-shrink-0">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="p-4 border-b">
                  <SheetTitle className="flex items-center gap-2 text-sm">
                    <Bot className="w-4 h-4 text-primary" />
                    Conversations
                  </SheetTitle>
                </SheetHeader>
                <SessionList
                  sessions={sessions}
                  activeId={activeSessionId}
                  onSelect={handleSelect}
                  onNew={() => createSessionMutation.mutate()}
                  onDelete={(id) => deleteSessionMutation.mutate(id)}
                />
              </SheetContent>
            </Sheet>

            <div className="flex-1 min-w-0">
              <h1 className="font-semibold truncate">
                {activeSession?.title ?? "Keryx Chat"}
              </h1>
              {activeSession && (
                <p className="text-xs text-muted-foreground">
                  {activeSession.messageCount} message{activeSession.messageCount !== 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* New chat on desktop */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => createSessionMutation.mutate()}
              disabled={createSessionMutation.isPending}
              className="hidden md:flex gap-2 flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              New
            </Button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {sessionsLoading || messagesLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : isEmpty ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <KeryxLogoIcon className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {activeSession ? "Start the conversation" : "Ready when you are"}
                  </h3>
                  <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                    Keryx knows your memories, goals, and people. Ask anything — problem-solve, brainstorm, vent, or just talk.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {[
                    "What's been on my mind lately?",
                    "Help me think through something",
                    "What should I focus on today?",
                    "I need to talk something through",
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => setInput(prompt)}
                      className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onSaveThat={handleSaveThat}
                    onLogThat={handleLogThat}
                    isSaving={savingMsgId === msg.id}
                  />
                ))}
                {sendMessageMutation.isPending && (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                      <KeryxLogoIcon className="w-5 h-5" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex gap-1 items-center h-5">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Session summary offer card — shown after ~8 messages */}
          {summaryOffer && summaryOffer.candidates.length > 0 && (
            <div className="px-4 pb-2">
              <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-3">
                <button
                  onClick={() => setSummaryOffer(null)}
                  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                  aria-label="Dismiss summary"
                >
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-xs font-medium text-foreground">Things worth saving from this conversation</p>
                </div>
                <div className="space-y-2">
                  {summaryOffer.candidates.map((candidate, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <p className="flex-1 text-xs text-muted-foreground leading-relaxed">{candidate.text}</p>
                      {savedCandidates.has(idx) ? (
                        <Badge variant="outline" className="text-xs h-5 gap-1 px-1.5 flex-shrink-0">
                          {candidate.type === "save" ? (
                            <><Bookmark className="w-3 h-3 text-violet-500" />Saved</>
                          ) : (
                            <><BookOpen className="w-3 h-3 text-emerald-500" />Logged</>
                          )}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={savingCandidateIdx === idx}
                          onClick={() => handleSaveCandidate(candidate, idx)}
                          className={cn(
                            "h-6 px-2 text-xs gap-1 flex-shrink-0",
                            candidate.type === "save"
                              ? "text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-700 hover:bg-violet-500/10"
                              : "text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-500/10"
                          )}
                        >
                          {savingCandidateIdx === idx ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : candidate.type === "save" ? (
                            <><Bookmark className="w-3 h-3" />Save That</>
                          ) : (
                            <><BookOpen className="w-3 h-3" />Log That</>
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save That / Log That hint */}
          {messages.length > 0 && !summaryOffer && (
            <div className="px-4 pb-1">
              <p className="text-xs text-muted-foreground text-center">
                Hover any Keryx message to{" "}
                <span className="text-violet-500 font-medium">Save That</span> to AI context or{" "}
                <span className="text-emerald-500 font-medium">Log That</span> to your memories
              </p>
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 border-t bg-background flex-shrink-0">
            <div className="flex gap-2 items-end">
              <Textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type to Keryx… (Enter to send, Shift+Enter for new line)"
                className="flex-1 resize-none overflow-y-auto"
                style={{ minHeight: "80px", maxHeight: "240px" }}
                rows={3}
                disabled={sendMessageMutation.isPending}
              />
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                {isVoiceSupported && (
                  <Button
                    type="button"
                    size="icon"
                    variant={isListening ? "destructive" : "outline"}
                    className="h-10 w-10"
                    onClick={isListening ? stopListening : startListening}
                    title={isListening ? "Stop listening" : "Voice input"}
                  >
                    {isListening ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMessageMutation.isPending}
                  size="icon"
                  className="h-10 w-10"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            {isListening && (
              <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Listening… speak now
              </p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
