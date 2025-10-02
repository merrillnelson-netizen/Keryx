import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface MobileLayoutProps {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navigation = [
    { name: "Voice Control", href: "/", icon: "mic" },
    { name: "Memory History", href: "/history", icon: "history" },
    { name: "Search Memories", href: "/query", icon: "search" },
    { name: "Settings", href: "/settings", icon: "settings" },
  ];

  const currentPage = navigation.find(item => item.href === location);

  return (
    <div className="flex flex-col h-screen bg-muted">
      {/* Mobile Top Bar */}
      <header className="bg-surface border-b border-outline px-4 py-3 shadow-sm flex items-center justify-between lg:hidden">
        <div className="flex items-center space-x-3">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="p-2">
                <span className="material-icons">menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <div className="bg-surface h-full">
                <div className="p-6 border-b border-outline">
                  <h1 className="text-xl font-medium text-foreground">MyDigitalMemory</h1>
                  <p className="text-sm text-muted-foreground mt-1">MDM - Voice Memory System</p>
                </div>
                
                <nav className="mt-6">
                  <div className="px-3">
                    {navigation.map((item) => {
                      const isActive = location === item.href;
                      return (
                        <Link key={item.href} href={item.href}>
                          <button 
                            className={cn(
                              "w-full flex items-center px-3 py-3 text-left rounded-lg mb-2 transition-colors",
                              isActive
                                ? "text-primary bg-blue-50 font-medium"
                                : "text-muted-foreground hover:bg-surface-variant"
                            )}
                            onClick={() => setIsOpen(false)}
                          >
                            <span className="material-icons mr-3 text-xl">{item.icon}</span>
                            <span className="text-base">{item.name}</span>
                          </button>
                        </Link>
                      );
                    })}
                  </div>
                </nav>
                
                {/* Status Indicator */}
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-secondary rounded-full mr-2 animate-pulse"></div>
                      <span className="text-sm text-green-800 font-medium">System Active</span>
                    </div>
                    <p className="text-xs text-green-600 mt-1">Voice AI Ready</p>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          
          <div>
            <h2 className="text-lg font-medium text-foreground">{currentPage?.name || "MyDigitalMemory"}</h2>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1">
            <span className="material-icons text-secondary text-sm">volume_up</span>
            <span className="text-xs text-muted-foreground hidden sm:block">Ready</span>
          </div>
        </div>
      </header>

      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden lg:flex h-screen">
        <div className="w-64 bg-surface shadow-lg border-r border-outline">
          <div className="p-6 border-b border-outline">
            <h1 className="text-xl font-medium text-foreground">MyDigitalMemory</h1>
            <p className="text-sm text-muted-foreground mt-1">MDM - Voice Memory System</p>
          </div>
          
          <nav className="mt-6">
            <div className="px-3">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <button 
                      className={cn(
                        "w-full flex items-center px-3 py-2 text-left rounded-lg mb-2 transition-colors",
                        isActive
                          ? "text-primary bg-blue-50 font-medium"
                          : "text-muted-foreground hover:bg-surface-variant"
                      )}
                    >
                      <span className="material-icons mr-3">{item.icon}</span>
                      <span>{item.name}</span>
                    </button>
                  </Link>
                );
              })}
            </div>
          </nav>
          
          {/* Status Indicator */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-secondary rounded-full mr-2 animate-pulse"></div>
                <span className="text-sm text-green-800 font-medium">System Active</span>
              </div>
              <p className="text-xs text-green-600 mt-1">Voice AI Ready</p>
            </div>
          </div>
        </div>

        {/* Desktop Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>

      {/* Mobile Content */}
      <main className="flex-1 overflow-auto lg:hidden">
        {children}
      </main>
    </div>
  );
}