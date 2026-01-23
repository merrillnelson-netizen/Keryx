import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface Template {
  id: string;
  name: string;
  description: string;
  logFormat: string;
  queryFormat: string;
}

export default function ActiveTemplate() {
  const { data: activeTemplate, isLoading } = useQuery<Template>({
    queryKey: ["/api/templates/active"],
  });

  if (isLoading) {
    return (
      <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
        <CardContent>
          <div className="animate-pulse">
            <div className="h-4 bg-muted rounded w-1/3 mb-4"></div>
            <div className="h-6 bg-muted rounded w-2/3 mb-2"></div>
            <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
            <div className="space-y-2">
              <div className="h-16 bg-muted rounded"></div>
              <div className="h-16 bg-muted rounded"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activeTemplate) {
    return (
      <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-medium text-foreground">Active Template</h4>
            <Link href="/templates">
              <Button variant="outline" size="sm">Select Template</Button>
            </Link>
          </div>
          <div className="text-center py-8">
            <span className="material-icons text-6xl text-muted-foreground mb-4">content_copy</span>
            <h5 className="font-medium text-foreground mb-2">No Active Template</h5>
            <p className="text-muted-foreground text-sm">Select a template to start logging</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-surface rounded-xl shadow-sm border border-outline p-6">
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-foreground">Active Template</h4>
          <Link href="/templates">
            <Button variant="ghost" size="sm" className="text-primary hover:text-blue-600">
              Change
            </Button>
          </Link>
        </div>
        
        <div className="border border-green-200 bg-green-50 rounded-lg p-4">
          <div className="flex items-center space-x-3 mb-3">
            <span className="material-icons text-secondary">sports_bar</span>
            <div>
              <h5 className="font-medium text-green-900">{activeTemplate.name}</h5>
              <p className="text-sm text-green-700">{activeTemplate.description}</p>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium text-green-900">Log Format:</span>
              <p className="text-green-700 font-mono text-xs mt-1 bg-white p-2 rounded border">
                {activeTemplate.logFormat}
              </p>
            </div>
            
            <div className="text-sm">
              <span className="font-medium text-green-900">Query Format:</span>
              <p className="text-green-700 font-mono text-xs mt-1 bg-white p-2 rounded border">
                {activeTemplate.queryFormat}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
