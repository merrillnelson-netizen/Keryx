import { Switch, Route, Redirect } from "wouter";
import { queryClient, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { initGA } from "./lib/analytics";
import { useAnalytics } from "./hooks/use-analytics";
import { useAppBadge } from "./hooks/useAppBadge";

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
import Locations from "@/pages/locations";
import Goals from "@/pages/goals";
import Reminders from "@/pages/reminders";
import ShowcasePage from "@/pages/showcase";
import Messages from "@/pages/messages";
import ShareImport from "@/pages/share-import";
import Billing from "@/pages/billing";
import FounderDashboard from "@/pages/founder";

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

function useTimezoneSync() {
  const { user } = useAuth();
  
  useEffect(() => {
    if (!user) return;
    
    const manualOverride = sessionStorage.getItem('keryx_tz_manual');
    if (manualOverride === 'true') return;
    
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!browserTimezone) return;
    
    const lastSynced = sessionStorage.getItem('keryx_tz_synced');
    if (lastSynced === browserTimezone) return;
    
    apiRequest("PUT", "/api/settings", { userTimezone: browserTimezone })
      .then(() => {
        sessionStorage.setItem('keryx_tz_synced', browserTimezone);
      })
      .catch(() => {});
  }, [user]);
}

function useBadgeSync() {
  const { user } = useAuth();
  const { setBadge, clearBadge } = useAppBadge();

  const { data: reminders = [] } = useQuery<{ id: string; status: string; triggerTime: string | null }[]>({
    queryKey: ['/api/reminders'],
    enabled: !!user,
    staleTime: 60000,
    select: (data) => data.filter((r) => r.status === 'triggered' || r.status === 'pending'),
  });

  useEffect(() => {
    if (!user) {
      clearBadge();
      return;
    }
    const overdueCount = reminders.filter((r) => {
      if (r.status === 'triggered') return true;
      if (r.triggerTime && new Date(r.triggerTime) <= new Date()) return true;
      return false;
    }).length;
    setBadge(overdueCount);
  }, [reminders, user, setBadge, clearBadge]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'SYNC_COMPLETE') {
        queryClient.invalidateQueries({ queryKey: ['/api/log-entries'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);
}

function Router() {
  useAnalytics();
  useTimezoneSync();
  useBadgeSync();
  
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/showcase" component={ShowcasePage} />
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
      <Route path="/goals">
        {() => <ProtectedRoute component={Goals} />}
      </Route>
      <Route path="/reminders">
        {() => <ProtectedRoute component={Reminders} />}
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
      <Route path="/locations">
        {() => <ProtectedRoute component={Locations} />}
      </Route>
      <Route path="/messages">
        {() => <ProtectedRoute component={Messages} />}
      </Route>
      <Route path="/messages/:conversationId">
        {() => <ProtectedRoute component={Messages} />}
      </Route>
      <Route path="/share-import">
        {() => <ProtectedRoute component={ShareImport} />}
      </Route>
      <Route path="/billing">
        {() => <ProtectedRoute component={Billing} />}
      </Route>
      <Route path="/founder">
        {() => <ProtectedRoute component={FounderDashboard} />}
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
                <PwaInstallPrompt variant="banner" />
              </div>
            </TooltipProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
