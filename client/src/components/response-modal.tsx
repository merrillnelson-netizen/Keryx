import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { X, MessageSquare, Clock, Tag, Smile, DollarSign } from "lucide-react";
import { AIResponseData, SearchResultMemory } from "@/hooks/use-speech-recognition";
import { formatDistanceToNow } from "date-fns";

interface ResponseModalProps {
  open: boolean;
  onClose: () => void;
  responseData: AIResponseData | null;
}

function getMoodColor(mood?: string): string {
  const moodColors: Record<string, string> = {
    happy: "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400",
    excited: "bg-orange-500/20 text-orange-600 dark:text-orange-400",
    grateful: "bg-green-500/20 text-green-600 dark:text-green-400",
    peaceful: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
    hopeful: "bg-cyan-500/20 text-cyan-600 dark:text-cyan-400",
    proud: "bg-purple-500/20 text-purple-600 dark:text-purple-400",
    motivated: "bg-pink-500/20 text-pink-600 dark:text-pink-400",
    neutral: "bg-gray-500/20 text-gray-600 dark:text-gray-400",
    sad: "bg-blue-700/20 text-blue-700 dark:text-blue-300",
    anxious: "bg-amber-600/20 text-amber-600 dark:text-amber-400",
    stressed: "bg-red-500/20 text-red-600 dark:text-red-400",
    frustrated: "bg-red-600/20 text-red-600 dark:text-red-400",
    angry: "bg-red-700/20 text-red-700 dark:text-red-300",
    confused: "bg-purple-600/20 text-purple-600 dark:text-purple-400",
    nostalgic: "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400",
  };
  return moodColors[mood || "neutral"] || moodColors.neutral;
}

function MemoryCard({ memory, index }: { memory: SearchResultMemory; index: number }) {
  const timeAgo = memory.timestamp 
    ? formatDistanceToNow(new Date(memory.timestamp), { addSuffix: true })
    : "Unknown time";

  return (
    <div className="p-4 rounded-lg bg-card/50 border border-border/50 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">
            #{index + 1}
          </span>
          {memory.similarity && (
            <span className="text-xs text-muted-foreground">
              {Math.round(memory.similarity * 100)}% match
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {timeAgo}
        </div>
      </div>
      
      <p className="text-sm text-foreground mb-3 line-clamp-3">
        {memory.memoryText}
      </p>
      
      <div className="flex flex-wrap gap-2">
        {memory.topicTag && (
          <Badge variant="outline" className="text-xs flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {memory.topicTag}
          </Badge>
        )}
        {memory.mood && (
          <Badge className={`text-xs flex items-center gap-1 ${getMoodColor(memory.mood)}`}>
            <Smile className="w-3 h-3" />
            {memory.mood}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ResponseModal({ open, onClose, responseData }: ResponseModalProps) {
  if (!responseData) return null;

  const isFinancial = responseData.type === "financial";
  const hasSourceMemories = responseData.sourceMemories && responseData.sourceMemories.length > 0;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-lg md:max-w-2xl max-h-[85vh] p-0 gap-0">
        <DialogHeader className="p-4 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {isFinancial ? (
                <>
                  <DollarSign className="w-5 h-5 text-green-500" />
                  Financial Insights
                </>
              ) : (
                <>
                  <MessageSquare className="w-5 h-5 text-primary" />
                  Search Results
                </>
              )}
            </DialogTitle>
          </div>
          <DialogDescription className="sr-only">
            {isFinancial 
              ? "AI-generated financial analysis based on your query" 
              : "Search results and source memories for your query"}
          </DialogDescription>
          {responseData.query && (
            <p className="text-sm text-muted-foreground mt-1">
              Query: "{responseData.query}"
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[calc(85vh-120px)]">
          <div className="p-4 space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border border-primary/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-primary mb-1">
                    {isFinancial ? "Financial Analysis" : "AI Response"}
                  </p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">
                    {responseData.message}
                  </p>
                  {isFinancial && responseData.financialSummary && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {responseData.financialSummary}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {hasSourceMemories && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Source Memories ({responseData.sourceMemories!.length})
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Sorted by relevance
                  </span>
                </div>
                
                <div className="space-y-3">
                  {responseData.sourceMemories!.map((memory, index) => (
                    <MemoryCard key={memory.id} memory={memory} index={index} />
                  ))}
                </div>
              </div>
            )}

            {!hasSourceMemories && responseData.type === "query" && (
              <div className="text-center py-6 text-muted-foreground">
                <p className="text-sm">No source memories found for this query.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="p-4 border-t border-border/50">
          <Button 
            onClick={onClose}
            className="w-full bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
