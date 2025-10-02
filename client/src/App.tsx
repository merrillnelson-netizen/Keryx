import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { apiRequest } from "./lib/queryClient";

import VoiceControl from "@/pages/voice-control";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={VoiceControl} />
      <Route path="/history" component={History} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Main App Component
 * 
 * Provides global context and error handling:
 * - QueryClient for API state management and caching
 * - TooltipProvider for UI tooltips
 * - ErrorBoundary for graceful error recovery
 * - Toast notifications for user feedback
 * 
 * Initializes the application on mount
 */
function App() {
  useEffect(() => {
    /**
     * Initialize application on first load
     * Creates default settings and prepares database
     */
    const initializeApp = async () => {
      try {
        await apiRequest("POST", "/api/initialize");
      } catch (error) {
        console.error("Failed to initialize application:", error);
      }
    };

    initializeApp();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="font-sans bg-background min-h-screen">
            <Toaster />
            <Router />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
