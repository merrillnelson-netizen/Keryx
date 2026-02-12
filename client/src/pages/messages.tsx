import { useState } from "react";
import AppLayout from "@/components/app-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ArrowLeft, User, Clock, ChevronDown, Smartphone } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { MessageConversation, Message } from "@shared/schema";
import { cn } from "@/lib/utils";

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

function ConversationList() {
  const [, setLocation] = useLocation();
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const { data: stats } = useQuery<{ totalConversations: number; totalMessages: number }>({
    queryKey: ["/api/messages/stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: conversationsData, isLoading, error: conversationsError } = useQuery<{
    conversations: MessageConversation[];
    total: number;
  }>({
    queryKey: ["/api/messages/conversations", { limit, offset }],
    queryFn: async () => {
      const res = await fetch(`/api/messages/conversations?limit=${limit}&offset=${offset}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const conversations = conversationsData?.conversations || [];
  const total = conversationsData?.total || 0;
  const hasMore = offset + limit < total;

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

  if (conversations.length === 0 && offset === 0) {
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
      <div className="glass-card p-6 rounded-2xl">
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
      </div>

      <div className="space-y-2">
        {conversations.map((convo) => (
          <Card
            key={convo.id}
            className="glass-card border-white/20 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
            onClick={() => setLocation(`/messages/${convo.id}`)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {convo.contactName || convo.contactAddress}
                    </h3>
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
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="border-white/20 hover:bg-white/10 gap-2"
            onClick={() => setOffset((prev) => prev + limit)}
          >
            <ChevronDown className="w-4 h-4" />
            Load More
          </Button>
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
