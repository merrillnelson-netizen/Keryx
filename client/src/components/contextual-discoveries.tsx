import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Sparkles, 
  ExternalLink,
  RefreshCw,
  MapPin,
  ShoppingBag,
  Briefcase,
  Heart,
  DollarSign,
  Lightbulb,
  AlertCircle,
  Calendar,
  Mail,
  Brain,
  Navigation,
  Clock,
  Zap,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";

interface Discovery {
  id: string;
  title: string;
  content: string;
  url: string;
  source: string;
  insightContext: string;
  category: 'travel' | 'shopping' | 'local' | 'professional' | 'lifestyle' | 'financial' | 'general';
  relevanceScore: number;
  urgency?: 'immediate' | 'upcoming' | 'general';
}

interface InsightContext {
  type: 'calendar' | 'email' | 'memory' | 'financial' | 'location' | 'goal';
  summary: string;
  location?: string;
  date?: string;
  topics: string[];
  urgency?: 'immediate' | 'upcoming' | 'general';
  confidence?: number;
}

interface DiscoveriesData {
  discoveries: Discovery[];
  insights: InsightContext[];
  generatedAt: string;
}

const getCategoryIcon = (category: Discovery['category']) => {
  switch (category) {
    case 'travel': return MapPin;
    case 'shopping': return ShoppingBag;
    case 'local': return Navigation;
    case 'professional': return Briefcase;
    case 'lifestyle': return Heart;
    case 'financial': return DollarSign;
    default: return Lightbulb;
  }
};

const getCategoryColor = (category: Discovery['category']) => {
  switch (category) {
    case 'travel': return 'text-blue-400 bg-blue-500/20';
    case 'shopping': return 'text-emerald-400 bg-emerald-500/20';
    case 'local': return 'text-purple-400 bg-purple-500/20';
    case 'professional': return 'text-orange-400 bg-orange-500/20';
    case 'lifestyle': return 'text-pink-400 bg-pink-500/20';
    case 'financial': return 'text-yellow-400 bg-yellow-500/20';
    default: return 'text-gray-400 bg-gray-500/20';
  }
};

const getUrgencyBadge = (urgency?: Discovery['urgency']) => {
  switch (urgency) {
    case 'immediate':
      return (
        <Badge variant="outline" className="text-xs bg-red-500/20 text-red-400 border-red-500/30">
          <Zap className="w-3 h-3 mr-1" />
          Now
        </Badge>
      );
    case 'upcoming':
      return (
        <Badge variant="outline" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Soon
        </Badge>
      );
    default:
      return null;
  }
};

const getInsightIcon = (type: InsightContext['type']) => {
  switch (type) {
    case 'calendar': return Calendar;
    case 'email': return Mail;
    case 'memory': return Brain;
    case 'financial': return DollarSign;
    case 'location': return Navigation;
    case 'goal': return Target;
    default: return Lightbulb;
  }
};

function DiscoveryCard({ discovery }: { discovery: Discovery }) {
  const CategoryIcon = getCategoryIcon(discovery.category);
  const categoryColors = getCategoryColor(discovery.category);
  const urgencyBadge = getUrgencyBadge(discovery.urgency);
  
  return (
    <a 
      href={discovery.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block glass-card p-4 rounded-xl hover:bg-white/10 transition-all group"
    >
      <div className="flex gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", categoryColors)}>
          <CategoryIcon className="w-5 h-5" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-foreground leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {discovery.title}
            </h4>
            <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {discovery.content}
          </p>
          
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{discovery.source}</span>
            {urgencyBadge}
            <Badge variant="outline" className={cn("text-xs capitalize ml-auto", categoryColors)}>
              {discovery.category}
            </Badge>
          </div>
          
          <p className="text-xs text-primary/80 mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {discovery.insightContext}
          </p>
        </div>
      </div>
    </a>
  );
}

function InsightBadge({ insight }: { insight: InsightContext }) {
  const Icon = getInsightIcon(insight.type);
  
  const urgencyColors = {
    immediate: 'border-red-500/30 bg-red-500/10',
    upcoming: 'border-amber-500/30 bg-amber-500/10',
    general: ''
  };
  
  return (
    <div className={cn(
      "glass-card p-2 rounded-lg flex items-center gap-2",
      insight.urgency && urgencyColors[insight.urgency]
    )}>
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground truncate">
        {insight.summary.slice(0, 50)}{insight.summary.length > 50 ? '...' : ''}
      </span>
      {insight.location && (
        <Badge variant="outline" className="text-xs bg-white/5 ml-auto">
          <MapPin className="w-3 h-3 mr-1" />
          {insight.location.split(',')[0]}
        </Badge>
      )}
      {insight.urgency === 'immediate' && (
        <Zap className="w-3 h-3 text-red-400 flex-shrink-0" />
      )}
    </div>
  );
}

export default function ContextualDiscoveries() {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<DiscoveriesData>({
    queryKey: ["/api/discoveries"],
    staleTime: 1000 * 60 * 240,
    refetchOnWindowFocus: false,
  });

  const discoveries = data?.discoveries || [];
  const insights = data?.insights || [];

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/discoveries"] });
    refetch();
  };

  return (
    <Card className="glass-card border-white/20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-fuchsia-500/5" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Discoveries For You</CardTitle>
              <CardDescription>
                Personalized content based on what's happening in your life
              </CardDescription>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            className="border-white/20 hover:bg-white/10"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {isError ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-2">Failed to Load Discoveries</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-sm mx-auto">
              {error instanceof Error ? error.message : 'Unable to fetch discoveries. Please try again.'}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              className="border-white/20"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-4 rounded-xl">
                <div className="flex gap-4">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : discoveries.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 text-primary/50 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-2">Nothing to discover right now</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              When you have upcoming trips, recent interests, or notable activities, personalized discoveries will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {discoveries.map(discovery => (
              <DiscoveryCard key={discovery.id} discovery={discovery} />
            ))}
          </div>
        )}
        
        {insights.length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-muted-foreground mb-2">What's driving these discoveries:</p>
            <div className="space-y-2">
              {insights.slice(0, 3).map((insight, i) => (
                <InsightBadge key={i} insight={insight} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
