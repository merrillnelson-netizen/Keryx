import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { KeryxLogo } from "@/components/keryx-logo";

export default function Sidebar() {
  const [location] = useLocation();

  const navigation = [
    { name: "Voice Control", href: "/", icon: "mic" },
    { name: "Memory History", href: "/history", icon: "history" },
    { name: "Location History", href: "/locations", icon: "location_on" },
    { name: "Settings", href: "/settings", icon: "settings" },
  ];

  return (
    <div className="w-64 bg-surface shadow-lg border-r border-outline">
      <div className="p-6 border-b border-outline">
        <KeryxLogo size="md" />
        <p className="text-xs text-muted-foreground mt-2">Kinetic Enterprise & Resource Yielding X-system</p>
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
  );
}
