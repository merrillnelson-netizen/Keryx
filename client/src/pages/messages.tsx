import { useState, useMemo } from "react";
import AppLayout from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MessageCircle, ArrowLeft, User, Clock, ChevronDown, Smartphone, Loader2, Search, X, LayoutGrid, Table as TableIcon, Sparkles, Edit2, Check } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { MessageConversation, Message } from "@shared/schema";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatTimestamp(date: string | Date | null) {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMessageTime(date: string | Date) {
  const d = new Date(date);
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface AiSearchResult {
  sortFields: Array<{ field: string; direction: 'asc' | 'desc' }>;
  filterIds: string[] | null;
  message: string;
}

function ConversationList() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [aiQuery, setAiQuery] = useState("");
  const [aiResult, setAiResult] = useState<AiSearchResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const { toast } = useToast();

  const { data: stats } = useQuery<{ totalConversations: number; totalMessages: number }>({
    queryKey: ["/api/messages/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: processingStatus } = useQuery<{ total: number; processed: number; unprocessed: number }>({
    queryKey: ["/api/messages/processing-status"],
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.unprocessed > 0 ? 5000 : false;
    },
  });

  const { data: conversationsData, isLoading, error: conversationsError } = useQuery<{
    conversations: MessageConversation[];
    total: number;
  }>({
    queryKey: ["/api/messages/conversations"],
    queryFn: async () => {
      const res = await fetch(`/api/messages/conversations?limit=1000&offset=0`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const conversations = conversationsData?.conversations || [];

  const aiSearchMutation = useMutation({
    mutationFn: async (searchQuery: string) => {
      const response = await apiRequest("POST", "/api/messages/ai-search", { query: searchQuery });
      if (!response.ok) throw new Error("AI search failed");
      return response.json();
    },
    onSuccess: (data) => {
      setAiResult(data.data);
    },
    onError: () => {
      toast({
        title: "AI search failed",
        description: "Could not process your search. Please try again.",
        variant: "destructive",
      });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, contactName }: { id: string; contactName: string }) => {
      const response = await apiRequest("PATCH", `/api/messages/conversations/${id}/name`, { contactName });
      if (!response.ok) throw new Error("Failed to update name");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
      setEditingId(null);
      setEditName("");
      toast({ title: "Name updated", description: "Contact name has been saved" });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save the name. Please try again.", variant: "destructive" });
    },
  });

  const handleStartEdit = (convo: MessageConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(convo.id);
    setEditName(convo.contactName || "");
  };

  const handleSaveEdit = (e?: React.MouseEvent | React.FormEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (editingId && editName.trim()) {
      renameMutation.mutate({ id: editingId, contactName: editName.trim() });
    }
  };

  const handleCancelEdit = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(null);
    setEditName("");
  };

  const handleAiSearch = () => {
    if (aiQuery.trim()) {
      aiSearchMutation.mutate(aiQuery.trim());
    }
  };

  const handleClearAiSearch = () => {
    setAiQuery("");
    setAiResult(null);
  };

  const displayConversations = useMemo(() => {
    let result = [...conversations];

    if (aiResult) {
      if (aiResult.filterIds) {
        const idSet = new Set(aiResult.filterIds);
        result = result.filter(c => idSet.has(c.id));
      }

      if (aiResult.sortFields && aiResult.sortFields.length > 0) {
        const getSortValue = (conv: MessageConversation, field: string): any => {
          switch (field) {
            case 'contactName': return (conv.contactName || conv.contactAddress || '').toLowerCase();
            case 'platform': return (conv.platform || '').toLowerCase();
            case 'messageCount': return conv.messageCount || 0;
            case 'lastMessageAt': return conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : 0;
            default: return 0;
          }
        };

        result.sort((a, b) => {
          for (const { field, direction } of aiResult.sortFields) {
            const valA = getSortValue(a, field);
            const valB = getSortValue(b, field);
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
          }
          return 0;
        });
      }
    }

    return result;
  }, [conversations, aiResult]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96" role="status">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" aria-hidden="true"></div>
          <p className="mt-4 text-muted-foreground">Loading conversations...</p>
        </div>
      </div>
    );
  }

  if (conversationsError) {
    return (
      <div className="glass-card p-12 rounded-2xl text-center" role="alert">
        <MessageCircle className="w-16 h-16 text-destructive mx-auto mb-4 opacity-50" aria-hidden="true" />
        <h3 className="text-lg font-medium text-foreground mb-2">Failed to load conversations</h3>
        <p className="text-muted-foreground">
          {conversationsError instanceof Error ? conversationsError.message : "An unexpected error occurred."}
        </p>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="glass-card p-6 rounded-2xl">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Messages</h2>
              <p className="text-sm text-muted-foreground">Your text message conversations</p>
            </div>
          </div>
        </div>
        <div className="glass-card p-12 rounded-2xl text-center">
          <MessageCircle className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-2">No conversations yet</h3>
          <p className="text-muted-foreground mb-4">
            Import your text messages to browse conversations here.
          </p>
          <Button
            variant="outline"
            className="border-white/20 hover:bg-white/10"
            onClick={() => setLocation("/settings")}
          >
            Go to Settings → Messages
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Section - matches People page layout */}
      <div className="glass-card p-6 rounded-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Messages</h2>
              <p className="text-sm text-muted-foreground">
                {stats
                  ? `${stats.totalConversations.toLocaleString()} conversations · ${stats.totalMessages.toLocaleString()} messages`
                  : "Your text message conversations"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("cards")}
              className={cn(
                "h-9 w-9 p-0 transition-all",
                viewMode === "cards" 
                  ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("table")}
              className={cn(
                "h-9 w-9 p-0 transition-all",
                viewMode === "table" 
                  ? "bg-gradient-to-r from-primary/20 to-secondary/20 text-foreground" 
                  : "text-muted-foreground hover:text-foreground hover:bg-white/10"
              )}
            >
              <TableIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {processingStatus && processingStatus.unprocessed > 0 && (
        <div className="glass-card p-4 rounded-2xl border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm font-medium text-foreground">
              AI Processing Messages
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {processingStatus.processed} / {processingStatus.total}
            </span>
          </div>
          <Progress
            value={processingStatus.total > 0 ? (processingStatus.processed / processingStatus.total) * 100 : 0}
            className="h-2"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {processingStatus.unprocessed} messages remaining — analyzing topics, mood, and people
          </p>
        </div>
      )}

      {/* AI Search - matches People page layout */}
      {conversations.length > 0 && (
        <div className="glass-card p-4 rounded-2xl">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiSearch()}
                placeholder="Ask AI: sort by most messages, find Michael, show recent..."
                className="pl-9 pr-9 bg-white/5 border-white/20 focus:border-primary/50"
              />
              {aiQuery && (
                <button
                  type="button"
                  onClick={() => setAiQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear text"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button
              onClick={handleAiSearch}
              disabled={!aiQuery.trim() || aiSearchMutation.isPending}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 gap-2 shrink-0"
            >
              {aiSearchMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">AI Search</span>
            </Button>
            {aiResult && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClearAiSearch}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
          {aiResult && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="text-purple-300">{aiResult.message}</span>
              <Badge variant="outline" className="text-xs ml-auto bg-purple-500/10 text-purple-400 border-purple-500/30">
                {displayConversations.length} of {conversations.length}
              </Badge>
            </div>
          )}
        </div>
      )}

      {displayConversations.length === 0 && aiResult ? (
        <div className="glass-card p-8 rounded-2xl text-center">
          <Search className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <h3 className="text-lg font-medium text-foreground mb-2">No matches found</h3>
          <p className="text-muted-foreground">Try a different search query</p>
        </div>
      ) : viewMode === "table" ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto scrollbar-thin scrollbar-thumb-primary/30 scrollbar-track-transparent">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur-sm z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="w-[250px] text-foreground font-semibold">Contact</TableHead>
                  <TableHead className="w-[100px] text-foreground font-semibold">Platform</TableHead>
                  <TableHead className="w-[100px] text-foreground font-semibold">Messages</TableHead>
                  <TableHead className="w-[140px] text-foreground font-semibold">Last Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayConversations.map((convo) => (
                  <TableRow
                    key={convo.id}
                    className="border-white/10 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setLocation(`/messages/${convo.id}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0 flex-1">
                          {editingId === convo.id ? (
                            <form onSubmit={handleSaveEdit} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                              <Input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="h-7 text-sm bg-white/5 border-white/20"
                                placeholder="Enter name..."
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Escape') handleCancelEdit(); }}
                              />
                              <Button type="submit" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-emerald-400 hover:text-emerald-300" disabled={renameMutation.isPending}>
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={handleCancelEdit}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </form>
                          ) : (
                            <div className="flex items-center gap-1 group/name">
                              <div className="min-w-0">
                                <p className="truncate font-semibold">{convo.contactName || convo.contactAddress}</p>
                                {convo.contactName && (
                                  <p className="text-xs text-muted-foreground truncate">{convo.contactAddress}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => handleStartEdit(convo, e)}
                                className="opacity-0 group-hover/name:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-1 shrink-0"
                                title="Edit contact name"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                        <Smartphone className="w-3 h-3 mr-1" />
                        {convo.platform}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-sky-500/20 text-sky-400 border-sky-500/30">
                        <MessageCircle className="w-3 h-3 mr-1" />
                        {convo.messageCount ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTimestamp(convo.lastMessageAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {displayConversations.map((convo) => (
            <Card
              key={convo.id}
              className="glass-card border-white/20 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
              onClick={() => editingId !== convo.id && setLocation(`/messages/${convo.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === convo.id ? (
                      <form onSubmit={handleSaveEdit} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="h-8 text-sm bg-white/5 border-white/20 flex-1"
                          placeholder="Enter name..."
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Escape') handleCancelEdit(); }}
                        />
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-emerald-400 hover:text-emerald-300" disabled={renameMutation.isPending}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-muted-foreground" onClick={handleCancelEdit}>
                          <X className="w-4 h-4" />
                        </Button>
                      </form>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-semibold text-foreground truncate">
                              {convo.contactName || convo.contactAddress}
                            </h3>
                            <button
                              type="button"
                              onClick={(e) => handleStartEdit(convo, e)}
                              className="text-muted-foreground hover:text-foreground transition-opacity p-0.5 shrink-0"
                              title="Edit contact name"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            {formatTimestamp(convo.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge
                            variant="outline"
                            className="text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          >
                            <Smartphone className="w-3 h-3 mr-1" />
                            {convo.platform}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            {convo.messageCount ?? 0}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}

function ThreadView() {
  const [, setLocation] = useLocation();
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const { data: conversation } = useQuery<MessageConversation>({
    queryKey: ["/api/messages/conversations", conversationId],
    queryFn: async () => {
      const res = await fetch(`/api/messages/conversations/${conversationId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversation");
      return res.json();
    },
    enabled: !!conversationId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: messagesData, isLoading, error: messagesError } = useQuery<{
    messages: Message[];
    total: number;
  }>({
    queryKey: ["/api/messages/conversations", conversationId, "messages", { limit, offset }],
    queryFn: async () => {
      const res = await fetch(
        `/api/messages/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!conversationId,
    staleTime: 2 * 60 * 1000,
  });

  const messages = messagesData?.messages || [];
  const total = messagesData?.total || 0;
  const hasMore = offset + limit < total;
  const contactDisplay = conversation?.contactName || conversation?.contactAddress || "Conversation";

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="glass-card p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="p-2 hover:bg-white/10"
            onClick={() => setLocation("/messages")}
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          </Button>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">{contactDisplay}</h2>
            {conversation && (
              <p className="text-xs text-muted-foreground">
                {conversation.messageCount ?? 0} messages · {conversation.platform}
              </p>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64" role="status">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" aria-hidden="true"></div>
            <p className="mt-4 text-muted-foreground">Loading messages...</p>
          </div>
        </div>
      ) : messagesError ? (
        <div className="glass-card p-8 rounded-2xl text-center" role="alert">
          <MessageCircle className="w-12 h-12 text-destructive mx-auto mb-3 opacity-50" aria-hidden="true" />
          <h3 className="text-lg font-medium text-foreground mb-2">Failed to load messages</h3>
          <p className="text-muted-foreground">
            {messagesError instanceof Error ? messagesError.message : "An unexpected error occurred."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {hasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="outline"
                size="sm"
                className="border-white/20 hover:bg-white/10 gap-2"
                onClick={() => setOffset((prev) => prev + limit)}
              >
                <ChevronDown className="w-4 h-4 rotate-180" />
                Load Older Messages
              </Button>
            </div>
          )}

          {messages.map((msg) => {
            const isSent = msg.direction === "sent";
            return (
              <div
                key={msg.id}
                className={cn("flex", isSent ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-2.5",
                    isSent
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "glass-card border-white/20 text-foreground rounded-bl-md"
                  )}
                >
                  {msg.body && (
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                  )}
                  <div
                    className={cn(
                      "flex items-center gap-1 mt-1",
                      isSent ? "justify-end" : "justify-start"
                    )}
                  >
                    <Clock className="w-3 h-3 opacity-60" />
                    <span className="text-[10px] opacity-60">
                      {formatMessageTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {messages.length === 0 && (
            <div className="glass-card p-8 rounded-2xl text-center">
              <MessageCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-muted-foreground">No messages in this conversation</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Messages() {
  const params = useParams<{ conversationId: string }>();

  return (
    <AppLayout>
      {params.conversationId ? <ThreadView /> : <ConversationList />}
    </AppLayout>
  );
}
