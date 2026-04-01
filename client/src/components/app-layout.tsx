import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, X, Mic, History, Settings as SettingsIcon, Activity, LogOut, User, Moon, Sun, Brain, Users, Calendar, Sparkles, Lightbulb, MapPin, Target, Bell, MessageCircle, ShieldCheck, ShieldOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/components/theme-provider";
import { KeryxLogoIcon } from "@/components/keryx-logo";
import { KeryxCapabilitiesModal } from "@/components/keryx-capabilities-modal";
import { KeryxStoryModal } from "@/components/keryx-story-modal";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Settings } from "@shared/schema";

interface AppLayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Voice Log", href: "/voice", icon: Mic },
  { name: "History", href: "/history", icon: History },
  { name: "Insights", href: "/insights", icon: Brain },
  { name: "Synthesis", href: "/synthesis", icon: Sparkles },
  { name: "Ideas", href: "/ideas", icon: Lightbulb },
  { name: "Goals", href: "/goals", icon: Target },
  { name: "Reminders", href: "/reminders", icon: Bell },
  { name: "People", href: "/people", icon: Users },
  { name: "Timeline", href: "/timeline", icon: Calendar },
  { name: "Messages", href: "/messages", icon: MessageCircle },
  { name: "Locations", href: "/locations", icon: MapPin },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

function ProfessionalModeToggle({ compact = false }: { compact?: boolean }) {
  const { data: settings } = useQuery<Settings>({
    queryKey: ["/api/settings"],
  });

  const isProfessional = settings?.professionalMode ?? false;

  const toggleMutation = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/settings", { professionalMode: !isProfessional }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  if (compact) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              data-testid="button-promode-toggle"
              variant="ghost"
              size="sm"
              className={cn(
                "p-2 hover:bg-white/10 transition-colors",
                isProfessional && "text-orange-400 hover:text-orange-300"
              )}
              onClick={() => toggleMutation.mutate()}
              disabled={toggleMutation.isPending}
              aria-label={isProfessional ? "Disable Professional Mode" : "Enable Professional Mode"}
            >
              {isProfessional ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <ShieldOff className="w-5 h-5 opacity-50" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {isProfessional ? "Keryx is muted — tap to restore personality" : "Tap to mute Keryx"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            data-testid="button-promode-toggle-sidebar"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            variant="ghost"
            className={cn(
              "flex-1 justify-start gap-2 hover:bg-white/5 transition-colors",
              isProfessional
                ? "text-orange-400 hover:text-orange-300"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isProfessional ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <ShieldOff className="w-4 h-4" />
            )}
            {isProfessional ? "Pro Mode On" : "Mute Keryx"}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {isProfessional ? "Keryx is muted — click to restore personality" : "Click to mute Keryx's personality"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const currentPage = navigation.find(item => item.href === location);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar - Glassmorphic Floating */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0 lg:z-50 m-4 rounded-2xl">
        <div className="flex flex-col flex-1 glass-card-strong overflow-hidden">
          {/* Logo & Branding */}
          <div className="p-6 border-b border-white/10">
            <KeryxStoryModal>
              <div className="flex items-center space-x-3">
                <KeryxLogoIcon size="md" />
                <div className="text-left">
                  <h1 className="text-xl font-bold text-foreground">Keryx</h1>
                  <p className="text-[10px] text-muted-foreground leading-tight">Kinetic Enterprise &<br/>Resource Yielding X-system</p>
                </div>
              </div>
            </KeryxStoryModal>
          </div>
          
          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <button 
                    data-testid={`nav-${item.href.slice(1) || 'home'}`}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 group relative overflow-hidden",
                      isActive
                        ? "bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 text-foreground font-semibold shadow-lg"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {isActive && (
                      <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-10" />
                    )}
                    <Icon className={cn(
                      "w-5 h-5 transition-transform duration-200",
                      isActive ? "scale-110" : "group-hover:scale-110"
                    )} />
                    <span className="relative z-10">{item.name}</span>
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    )}
                  </button>
                </Link>
              );
            })}
          </nav>
          
          {/* Help & User Info */}
          <div className="p-4 border-t border-white/10 space-y-3">
            <KeryxCapabilitiesModal />
            <div className="glass-card p-3 rounded-xl">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground block truncate">
                    {user?.username || 'User'}
                  </span>
                  <p className="text-xs text-muted-foreground">Logged in</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <ProfessionalModeToggle />
              <Button
                data-testid="button-theme-toggle"
                onClick={toggleTheme}
                variant="ghost"
                className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                {theme === "light" ? "Dark" : "Light"}
              </Button>
            </div>
            <Button
              data-testid="button-logout"
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-[100] m-2">
        <div className="glass-card-strong px-4 py-3 rounded-2xl shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                {isOpen ? (
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2 hover:bg-white/10"
                      aria-label="Close menu"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                  </SheetClose>
                ) : (
                  <SheetTrigger asChild>
                    <Button 
                      data-testid="button-menu"
                      variant="ghost" 
                      size="sm" 
                      className="p-2 hover:bg-white/10"
                    >
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                )}
                <SheetContent side="left" className="w-80 p-0 glass-card-strong border-white/20">
                  <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                  <div className="flex flex-col h-full">
                    {/* Mobile Menu Header — pt-20 clears the fixed header bar */}
                    <div className="pt-20 pb-6 px-6 border-b border-white/10">
                      <KeryxStoryModal>
                        <div className="flex items-center space-x-3">
                          <KeryxLogoIcon size="md" />
                          <div className="text-left">
                            <h1 className="text-xl font-bold text-foreground">Keryx</h1>
                            <p className="text-xs text-muted-foreground">AI Memory Assistant</p>
                          </div>
                        </div>
                      </KeryxStoryModal>
                    </div>
                    
                    {/* Mobile Navigation */}
                    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                      {navigation.map((item) => {
                        const isActive = location === item.href;
                        const Icon = item.icon;
                        return (
                          <Link key={item.href} href={item.href}>
                            <button 
                              data-testid={`nav-mobile-${item.href.slice(1) || 'home'}`}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200",
                                isActive
                                  ? "bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 text-foreground font-semibold"
                                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                              )}
                              onClick={() => setIsOpen(false)}
                            >
                              <Icon className="w-5 h-5" />
                              <span>{item.name}</span>
                            </button>
                          </Link>
                        );
                      })}
                    </nav>
                    
                    {/* Mobile Help & User Info */}
                    <div className="p-4 border-t border-white/10 space-y-3">
                      <KeryxCapabilitiesModal />
                      <div className="glass-card p-3 rounded-xl">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                            <User className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground block truncate">
                              {user?.username || 'User'}
                            </span>
                            <p className="text-xs text-muted-foreground">Logged in</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <ProfessionalModeToggle />
                        <Button
                          data-testid="button-theme-toggle-mobile"
                          onClick={toggleTheme}
                          variant="ghost"
                          className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
                        >
                          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                          {theme === "light" ? "Dark" : "Light"}
                        </Button>
                      </div>
                      <Button
                        data-testid="button-logout-mobile"
                        onClick={handleLogout}
                        variant="ghost"
                        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
              
              <Link href="/dashboard">
                <div className="flex items-center gap-2 cursor-pointer">
                  <KeryxLogoIcon size="sm" />
                  <h2 className="text-base font-semibold text-foreground">
                    {currentPage?.name || "Keryx"}
                  </h2>
                </div>
              </Link>
            </div>

            {/* Mobile top bar right side: Pro Mode toggle */}
            <ProfessionalModeToggle compact />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:ml-80 overflow-hidden">
        <div className="h-full overflow-y-auto pt-20 lg:pt-0 p-4 lg:p-6">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
