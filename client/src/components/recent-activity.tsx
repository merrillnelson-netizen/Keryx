import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { LogEntry } from "@shared/schema";
import { Link } from "wouter";

export default function RecentActivity() {
  const { data: logEntries = [], isLoading } = useQuery<LogEntry[]>({
    queryKey: ["/api/logs", { limit: 5 }],
    queryFn: () => fetch("/api/logs?limit=5").then(res => res.json()),
  });

  if (isLoading) {
    return (
      <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                  <div className="w-4 h-4 bg-muted-foreground rounded mt-0.5"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-muted-foreground rounded w-3/4 mb-1"></div>
                    <div className="h-3 bg-muted-foreground rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-foreground">Recent Activity</h4>
          <Link href="/history">
            <Button variant="ghost" size="sm" className="text-primary hover:text-blue-600">
              View All
            </Button>
          </Link>
        </div>
        
        {logEntries.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons text-6xl text-muted-foreground mb-4">history</span>
            <h5 className="font-medium text-foreground mb-2">No recent activity</h5>
            <p className="text-muted-foreground text-sm">Your voice commands will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logEntries.map((entry) => (
              <div key={entry.id} className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                <span className="material-icons text-muted-foreground mt-0.5">history</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{entry.rawCommand}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.timestamp!).toLocaleString()}
                  </p>
                </div>
                <span className="material-icons text-secondary text-sm">check_circle</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
