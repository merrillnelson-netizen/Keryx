import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function Query() {
  const [queryText, setQueryText] = useState("");
  const [results, setResults] = useState<any[]>([]);

  const queryMutation = useMutation({
    mutationFn: (query: { templateId: string; query: string }) =>
      apiRequest("POST", "/api/logs/query", query),
    onSuccess: (response) => {
      response.json().then(setResults);
    },
  });

  const handleQuery = () => {
    if (!queryText.trim()) return;
    
    // For now, use a placeholder templateId
    queryMutation.mutate({
      templateId: "placeholder",
      query: queryText
    });
  };

  return (
    <div className="flex h-screen">
      <Sidebar />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-surface border-b border-outline px-6 py-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Query Data</h2>
            <p className="text-sm text-muted-foreground">Search and analyze your logged data</p>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center">
                <span className="material-icons mr-2">search</span>
                Query Interface
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4">
                <Input
                  placeholder="Enter your query (e.g., Who racked in Round 1?)"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleQuery()}
                  className="flex-1"
                />
                <Button 
                  onClick={handleQuery}
                  disabled={queryMutation.isPending}
                >
                  {queryMutation.isPending ? "Searching..." : "Search"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Query Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <div key={index} className="bg-muted p-3 rounded">
                      <p className="font-medium">{result.rawCommand}</p>
                      <pre className="text-sm text-muted-foreground mt-1">
                        {JSON.stringify(result.parsedData, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
