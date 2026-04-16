import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Menu, X, Mic, History, Settings as SettingsIcon, Activity, LogOut, User, Moon, Sun, Brain, Users, Calendar, Sparkles, Lightbulb, MapPin, Target, Bell, MessageCircle, ShieldCheck, ShieldOff, Bot, UserCircle, MessagesSquare, ChevronDown, Lock } from "lucide-react";
import { useBillingTier, type Tier } from "@/hooks/use-billing-tier";
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

type NavTier = Tier;

const primaryNav: { name: string; href: string; icon: React.ElementType; tier?: NavTier }[] = [
  { name: "Dashboard", href: "/", icon: Activity },
  { name: "Voice Log", href: "/voice", icon: Mic },
  { name: "Chat", href: "/chat", icon: MessagesSquare, tier: "pro" },
  { name: "History", href: "/history", icon: History },
  { name: "Agent", href: "/agent", icon: Bot, tier: "life_os" },
  { name: "Settings", href: "/settings", icon: SettingsIcon },
];

const navGroups: {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  items: { name: string; href: string; icon: React.ElementType; tier?: NavTier }[];
}[] = [
  {
    id: "intelligence",
    label: "Intelligence",
    icon: Brain,
    color: "text-purple-400",
    items: [
      { name: "Insights", href: "/insights", icon: Brain, tier: "pro" },
      { name: "Profile", href: "/profile", icon: UserCircle, tier: "pro" },
    ],
  },
  {
    id: "lifeos",
    label: "Life OS",
    icon: Target,
    color: "text-emerald-400",
    items: [
      { name: "People", href: "/people", icon: Users },
      { name: "Goals", href: "/goals", icon: Target, tier: "pro" },
      { name: "Ideas", href: "/ideas", icon: Lightbulb, tier: "pro" },
      { name: "Reminders", href: "/reminders", icon: Bell, tier: "pro" },
    ],
  },
  {
    id: "records",
    label: "Records",
    icon: Calendar,
    color: "text-blue-400",
    items: [
      { name: "Timeline", href: "/timeline", icon: Calendar },
      { name: "Messages", href: "/messages", icon: MessageCircle, tier: "life_os" },
      { name: "Locations", href: "/locations", icon: MapPin, tier: "life_os" },
    ],
  },
];

const allNavItems = [
  ...primaryNav,
  ...navGroups.flatMap(g => g.items),
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
            {isProfessional ? "Keryx is muted" : "Tap to mute Keryx"}
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
          {isProfessional ? "Keryx is muted" : "Click to mute Keryx"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NavItem({
  item,
  isActive,
  onClick,
  mobile = false,
}: {
  item: { name: string; href: string; icon: React.ElementType; tier?: NavTier };
  isActive: boolean;
  onClick?: () => void;
  mobile?: boolean;
}) {
  const Icon = item.icon;
  const { hasTier } = useBillingTier();
  const isLocked = item.tier ? !hasTier(item.tier) : false;
  const lockLabel = item.tier === "life_os" ? "Life OS" : "Pro";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link key={item.href} href={item.href}>
            <button
              data-testid={`nav${mobile ? "-mobile" : ""}-${item.href.slice(1) || "home"}`}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all duration-200 group relative overflow-hidden",
                isActive
                  ? "bg-gradient-to-r from-primary/20 via-secondary/20 to-accent/20 text-foreground font-semibold shadow-lg"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                isLocked && "opacity-60"
              )}
              onClick={onClick}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent opacity-10" />
              )}
              <Icon className={cn("w-4 h-4 transition-transform duration-200", isActive ? "scale-110" : "group-hover:scale-110")} />
              <span className="relative z-10 text-sm flex-1">{item.name}</span>
              {isLocked ? (
                <Lock className="w-3 h-3 text-muted-foreground/70 relative z-10" />
              ) : isActive ? (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              ) : null}
            </button>
          </Link>
        </TooltipTrigger>
        {isLocked && (
          <TooltipContent side="right" className="text-xs">
            {lockLabel} feature — tap to upgrade
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

function NavGroup({
  group,
  location,
  onItemClick,
  mobile = false,
}: {
  group: typeof navGroups[number];
  location: string;
  onItemClick?: () => void;
  mobile?: boolean;
}) {
  const groupIsActive = group.items.some(i => i.href === location);
  const [open, setOpen] = useState(groupIsActive);

  useEffect(() => {
    if (groupIsActive) setOpen(true);
  }, [groupIsActive]);

  const GroupIcon = group.icon;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 px-4 py-2 rounded-xl text-left transition-all duration-200 group",
          groupIsActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        )}
      >
        <GroupIcon className={cn("w-4 h-4 flex-shrink-0", group.color)} />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider">{group.label}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && (
        <div className="ml-3 pl-3 border-l border-white/10 space-y-0.5 mt-0.5">
          {group.items.map(item => (
            <NavItem
              key={item.href}
              item={item}
              isActive={location === item.href}
              onClick={onItemClick}
              mobile={mobile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NavList({
  location,
  onItemClick,
  mobile = false,
}: {
  location: string;
  onItemClick?: () => void;
  mobile?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {/* Primary nav items */}
      {primaryNav.map(item => (
        <NavItem
          key={item.href}
          item={item}
          isActive={location === item.href}
          onClick={onItemClick}
          mobile={mobile}
        />
      ))}

      {/* Divider */}
      <div className="pt-2 pb-1">
        <div className="border-t border-white/10" />
      </div>

      {/* Grouped nav sections */}
      <div className="space-y-1">
        {navGroups.map(group => (
          <NavGroup
            key={group.id}
            group={group}
            location={location}
            onItemClick={onItemClick}
            mobile={mobile}
          />
        ))}
      </div>
    </div>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const currentPage = allNavItems.find(item => item.href === location);

  const handleLogout = async () => {
    await logout();
    setIsOpen(false);
  };

  const BottomSection = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="p-4 border-t border-white/10 space-y-3">
      <KeryxCapabilitiesModal />
      <div className="glass-card p-3 rounded-xl">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-foreground block truncate">
              {user?.username || "User"}
            </span>
            <p className="text-xs text-muted-foreground">Logged in</p>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <ProfessionalModeToggle />
        <Button
          data-testid={mobile ? "button-theme-toggle-mobile" : "button-theme-toggle"}
          onClick={toggleTheme}
          variant="ghost"
          className="flex-1 justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
        >
          {theme === "light" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          {theme === "light" ? "Dark" : "Light"}
        </Button>
      </div>
      <Button
        data-testid={mobile ? "button-logout-mobile" : "button-logout"}
        onClick={handleLogout}
        variant="ghost"
        className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-white/5"
      >
        <LogOut className="w-4 h-4" />
        Logout
      </Button>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-72 lg:fixed lg:inset-y-0 lg:z-50 m-4 rounded-2xl">
        <div className="flex flex-col flex-1 glass-card-strong overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <KeryxStoryModal>
              <div className="flex items-center space-x-3">
                <KeryxLogoIcon size="md" />
                <div className="text-left">
                  <h1 className="text-xl font-bold text-foreground">Keryx</h1>
                  <p className="text-[10px] text-muted-foreground leading-tight">Kinetic Enterprise &<br />Resource Yielding X-system</p>
                </div>
              </div>
            </KeryxStoryModal>
          </div>

          <nav className="flex-1 p-4 overflow-y-auto">
            <NavList location={location} />
          </nav>

          <BottomSection />
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
                    <Button variant="ghost" size="sm" className="p-2 hover:bg-white/10" aria-label="Close menu">
                      <X className="w-5 h-5" />
                    </Button>
                  </SheetClose>
                ) : (
                  <SheetTrigger asChild>
                    <Button data-testid="button-menu" variant="ghost" size="sm" className="p-2 hover:bg-white/10">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                )}
                <SheetContent side="left" className="w-80 p-0 glass-card-strong border-white/20">
                  <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                  <div className="flex flex-col h-full">
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

                    <nav className="flex-1 p-4 overflow-y-auto">
                      <NavList
                        location={location}
                        onItemClick={() => setIsOpen(false)}
                        mobile
                      />
                    </nav>

                    <BottomSection mobile />
                  </div>
                </SheetContent>
              </Sheet>

              <Link href="/">
                <div className="flex items-center gap-2 cursor-pointer">
                  <KeryxLogoIcon size="sm" />
                  <h2 className="text-base font-semibold text-foreground">
                    {currentPage?.name || "Keryx"}
                  </h2>
                </div>
              </Link>
            </div>

            <ProfessionalModeToggle compact />
          </div>
        </div>
      </header>

      {/* Main Content */}
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
