import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { apiRequest } from "./lib/queryClient";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { initGA } from "./lib/analytics";
import { useAnalytics } from "./hooks/use-analytics";

import VoiceControl from "@/pages/voice-control";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import LoginPage from "@/pages/login";
import SignupPage from "@/pages/signup";
import NotFound from "@/pages/not-found";
import Insights from "@/pages/insights";
import People from "@/pages/people";
import Timeline from "@/pages/timeline";
import Dashboard from "@/pages/dashboard";
import LandingPage from "@/pages/landing";
import Synthesis from "@/pages/synthesis";
import Ideas from "@/pages/ideas";
import IdeaDetail from "@/pages/idea-detail";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return user ? <Dashboard /> : <LandingPage />;
}

function Router() {
  useAnalytics();
  
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/">
        {() => <HomeRoute />}
      </Route>
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/voice">
        {() => <ProtectedRoute component={VoiceControl} />}
      </Route>
      <Route path="/history">
        {() => <ProtectedRoute component={History} />}
      </Route>
      <Route path="/insights">
        {() => <ProtectedRoute component={Insights} />}
      </Route>
      <Route path="/synthesis">
        {() => <ProtectedRoute component={Synthesis} />}
      </Route>
      <Route path="/ideas">
        {() => <ProtectedRoute component={Ideas} />}
      </Route>
      <Route path="/ideas/:id">
        {() => <ProtectedRoute component={IdeaDetail} />}
      </Route>
      <Route path="/people">
        {() => <ProtectedRoute component={People} />}
      </Route>
      <Route path="/timeline">
        {() => <ProtectedRoute component={Timeline} />}
      </Route>
      <Route path="/settings">
        {() => <ProtectedRoute component={Settings} />}
      </Route>
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
 * - Google Analytics for usage tracking
 * 
 * Initializes the application on mount
 */
function App() {
  useEffect(() => {
    if (import.meta.env.VITE_GA_MEASUREMENT_ID) {
      initGA();
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TooltipProvider>
              <div className="font-sans bg-background min-h-screen">
                <Toaster />
                <Router />
              </div>
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
