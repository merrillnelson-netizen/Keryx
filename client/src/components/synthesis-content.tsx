import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain,
  TrendingUp,
  Lightbulb,
  Sparkles,
  Loader2,
  Send,
  RefreshCw,
  MessageCircle,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ThematicInsight {
  summary: string;
  patterns: string[];
  recommendations: string[];
  timespan: string;
  callout?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  insight?: ThematicInsight;
  memoriesAnalyzed?: number;
}

export default function SynthesisContent() {
  const [days, setDays] = useState("30");
  const [question, setQuestion] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: initialAnalysis, isLoading: isLoadingInitial, refetch: refetchAnalysis } = useQuery({
    queryKey: ["/api/insights", "initial", days],
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/insights", { days: parseInt(days) });
      if (!response.ok) throw new Error("Failed to generate insights");
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (initialAnalysis && chatHistory.length === 0) {
      setChatHistory([{
        id: "initial",
        role: "assistant",
        content: "Full Analysis",
        timestamp: new Date(),
        insight: initialAnalysis.data,
        memoriesAnalyzed: initialAnalysis.memoriesAnalyzed,
      }]);
    }
  }, [initialAnalysis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const questionMutation = useMutation({
    mutationFn: async ({ question, days }: { question: string; days: number }) => {
      const response = await apiRequest("POST", "/api/insights", { question, days });
      if (!response.ok) throw new Error("Failed to generate insights");
      return response.json();
    },
    onSuccess: (data, variables) => {
      setChatHistory(prev => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: variables.question,
        timestamp: new Date(),
        insight: data.data,
        memoriesAnalyzed: data.memoriesAnalyzed,
      }]);
    },
  });

  const handleAskQuestion = () => {
    if (!question.trim()) return;
    setChatHistory(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: new Date(),
    }]);
    questionMutation.mutate({ question, days: parseInt(days) });
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAskQuestion();
    }
  };

  const handleRefresh = () => {
    setChatHistory([]);
    refetchAnalysis();
  };

  const handleDaysChange = (newDays: string) => {
    setDays(newDays);
    setChatHistory([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Deep analysis of patterns and themes in your memories
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Select value={days} onValueChange={handleDaysChange}>
            <SelectTrigger className="w-[140px] glass-card border-white/20">
              <SelectValue placeholder="Time period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 3 months</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoadingInitial}
            className="glass-card border-white/20"
          >
            <RefreshCw className={cn("w-4 h-4", isLoadingInitial && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Chat area — scrollable */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {isLoadingInitial && chatHistory.length === 0 ? (
          <Card className="glass-card border-white/20">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
                <p className="text-muted-foreground">Analyzing your memories…</p>
                <p className="text-xs text-muted-foreground">This may take a moment</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {chatHistory.map((message) => (
              <div key={message.id} className={cn("animate-fade-in", message.role === "user" && "flex justify-end")}>
                {message.role === "user" ? (
                  <div className="max-w-[85%] bg-purple-500/20 border border-purple-500/30 rounded-2xl rounded-tr-sm px-4 py-3">
                    <p className="text-foreground">{message.content}</p>
                  </div>
                ) : (
                  <Card className="glass-card border-white/20 w-full">
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        {message.content === "Full Analysis" ? "Full Analysis" : `Analysis: "${message.content}"`}
                      </CardTitle>
                      {message.memoriesAnalyzed && (
                        <CardDescription>Based on {message.memoriesAnalyzed} memories</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {message.insight && (
                        <>
                          <div className="glass-card p-4 rounded-xl bg-white/5">
                            <h4 className="font-medium text-foreground mb-2 flex items-center gap-2">
                              <Brain className="w-4 h-4 text-purple-500" />
                              Summary
                            </h4>
                            <p className="text-muted-foreground leading-relaxed">{message.insight.summary}</p>
                            <p className="text-xs text-muted-foreground mt-2">{message.insight.timespan}</p>
                          </div>

                          {message.insight.callout && (
                            <div className="glass-card p-4 rounded-xl border-l-4 border-orange-500 bg-orange-500/10">
                              <h4 className="font-medium text-orange-400 mb-2 flex items-center gap-2 text-sm uppercase tracking-wide">
                                <Zap className="w-4 h-4" />
                                Keryx
                              </h4>
                              <p className="text-foreground font-medium leading-relaxed">{message.insight.callout}</p>
                            </div>
                          )}

                          {message.insight.patterns.length > 0 && (
                            <div className="glass-card p-4 rounded-xl bg-white/5">
                              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-blue-500" />
                                Patterns Detected
                              </h4>
                              <ul className="space-y-2">
                                {message.insight.patterns.map((pattern, i) => (
                                  <li key={i} className="text-muted-foreground flex items-start gap-2">
                                    <span className="text-blue-500 mt-1">•</span>
                                    <span>{pattern}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {message.insight.recommendations.length > 0 && (
                            <div className="glass-card p-4 rounded-xl border-l-4 border-yellow-500 bg-yellow-500/5">
                              <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
                                <Lightbulb className="w-4 h-4 text-yellow-500" />
                                Recommendations
                              </h4>
                              <ul className="space-y-2">
                                {message.insight.recommendations.map((rec, i) => (
                                  <li key={i} className="text-muted-foreground flex items-start gap-2">
                                    <span className="text-yellow-500 mt-1">→</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            ))}

            {questionMutation.isPending && (
              <Card className="glass-card border-white/20 animate-pulse">
                <CardContent className="py-8">
                  <div className="flex items-center justify-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <p className="text-muted-foreground">Analyzing your question…</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Question input — pinned at bottom */}
      <div className="flex-shrink-0 pt-3 border-t border-white/10">
        <Card className="glass-card border-white/20">
          <CardContent className="p-3">
            <div className="flex gap-3 items-end">
              <Textarea
                ref={textareaRef}
                placeholder="Ask a follow-up question about your patterns, habits, or any insights…"
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 glass-card border-white/20 resize-none"
                style={{ minHeight: "72px", maxHeight: "160px" }}
                rows={3}
              />
              <Button
                onClick={handleAskQuestion}
                disabled={questionMutation.isPending || !question.trim()}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 px-4 self-end"
              >
                {questionMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              <MessageCircle className="w-3 h-3 inline mr-1" />
              Ask anything about your memories, patterns, mood trends, or get recommendations
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
