import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEffect } from "react";
import { apiRequest } from "./lib/queryClient";

import VoiceControl from "@/pages/voice-control";
import History from "@/pages/history";
import Query from "@/pages/query";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={VoiceControl} />
      <Route path="/history" component={History} />
      <Route path="/query" component={Query} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Initialize the application on first load
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
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="font-roboto bg-muted min-h-screen">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
