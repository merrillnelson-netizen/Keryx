import MobileLayout from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { useState } from "react";

export default function History() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: response, isLoading } = useQuery<{ data: LogEntry[] }>({
    queryKey: ["/api/logs"],
  });

  const logEntries = response?.data || [];

  if (isLoading) {
    return (
      <MobileLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading history...</p>
          </div>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Memory History</h2>
          <p className="text-sm text-muted-foreground">View all your saved memories</p>
        </div>
      </header>

      <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
        <p className="text-sm text-muted-foreground">View all your saved memories</p>
      </div>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
        {logEntries.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
              <h3 className="text-lg font-medium text-foreground mb-2">No memories yet</h3>
              <p className="text-muted-foreground">Start logging memories to see your activity here</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {logEntries.map((entry) => (
              <Card key={entry.id} data-testid={`memory-card-${entry.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {entry.topicTag && (
                          <Badge variant="secondary" data-testid={`topic-badge-${entry.id}`}>
                            <span className="material-icons text-xs mr-1">label</span>
                            {entry.topicTag}
                          </Badge>
                        )}
                        <Badge variant="outline" data-testid={`date-badge-${entry.id}`}>
                          {new Date(entry.timestamp!).toLocaleDateString()}
                        </Badge>
                      </div>
                      <CardTitle className="text-base font-normal text-foreground" data-testid={`memory-text-${entry.id}`}>
                        {entry.memoryText}
                      </CardTitle>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                      className="h-8 w-8 p-0 shrink-0"
                      data-testid={`expand-button-${entry.id}`}
                    >
                      <span className="material-icons text-sm">
                        {expandedId === entry.id ? 'expand_less' : 'expand_more'}
                      </span>
                    </Button>
                  </div>
                </CardHeader>
                
                {expandedId === entry.id && entry.metadataJson && typeof entry.metadataJson === 'object' && (
                  <CardContent className="pt-0" data-testid={`metadata-details-${entry.id}`}>
                    <div className="border-t border-outline pt-3">
                      <h4 className="text-sm font-medium text-foreground mb-2">Extracted Details</h4>
                      <div className="bg-muted p-3 rounded-lg">
                        {Object.entries(entry.metadataJson as Record<string, unknown>).map(([key, value]) => (
                          <div key={key} className="flex items-start gap-2 mb-1 last:mb-0">
                            <span className="text-xs font-medium text-muted-foreground uppercase min-w-[80px]">
                              {key.replace(/_/g, ' ')}:
                            </span>
                            <span className="text-sm text-foreground">
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Saved {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
    </MobileLayout>
  );
}
