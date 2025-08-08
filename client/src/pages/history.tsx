import MobileLayout from "@/components/mobile-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";

export default function History() {
  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs"],
  });

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
      {/* Desktop Header - Hidden on mobile */}
      <header className="hidden lg:block bg-surface border-b border-outline px-6 py-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Log History</h2>
          <p className="text-sm text-muted-foreground">View all logged commands and data</p>
        </div>
      </header>

      {/* Mobile Header */}
      <div className="lg:hidden bg-surface border-b border-outline px-4 py-3 sticky top-0 z-10">
        <p className="text-sm text-muted-foreground">View all logged commands and data</p>
      </div>

      <main className="flex-1 overflow-auto p-4 lg:p-6">
          {logEntries.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
                <h3 className="text-lg font-medium text-foreground mb-2">No log entries yet</h3>
                <p className="text-muted-foreground">Start using voice commands to see your activity here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {logEntries.map((entry) => (
                <Card key={entry.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{entry.rawCommand}</CardTitle>
                      <Badge variant="secondary">
                        {new Date(entry.timestamp!).toLocaleDateString()}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-3 rounded text-sm font-mono">
                      {JSON.stringify(entry.parsedData, null, 2)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(entry.timestamp!).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>
    </MobileLayout>
  );
}
