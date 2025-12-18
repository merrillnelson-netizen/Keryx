import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Link } from "wouter";
import { Clock, ArrowRight } from "lucide-react";

export default function RecentActivity() {

  const { data, isLoading } = useQuery({
    queryKey: ["/api/logs", { limit: 5 }],
    queryFn: async () => {
      const response = await fetch("/api/logs?limit=5", { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      const result = await response.json();
      return result.data || [];
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });

  const logEntries = (data || []) as LogEntry[];

  if (isLoading) {
    return (
      <div className="glass-card p-6 rounded-2xl">
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass-card p-3 rounded-lg">
                  <div className="h-4 bg-muted-foreground/20 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted-foreground/20 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 rounded-2xl border-white/20">
      <CardContent>
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Recent Activity
          </h4>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 hover:bg-white/10">
              View All
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {logEntries.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h5 className="font-medium text-foreground mb-2">No recent activity</h5>
            <p className="text-muted-foreground text-sm">Your voice commands will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logEntries.map((entry) => (
              <Link key={entry.id} href="/history">
                <div className="glass-card p-4 rounded-xl border-white/10 hover:border-white/20 transition-all cursor-pointer" data-testid={`log-entry-${entry.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full font-medium" data-testid={`topic-tag-${entry.id}`}>
                          {entry.topicTag}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1" data-testid={`memory-text-${entry.id}`}>
                        {entry.memoryText}
                      </p>
                      <p className="text-xs text-muted-foreground" data-testid={`timestamp-${entry.id}`}>
                        {new Date(entry.timestamp!).toLocaleString()}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </div>
  );
}
