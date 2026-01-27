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
  Brain
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
}

interface InsightContext {
  type: 'calendar' | 'email' | 'memory' | 'financial';
  summary: string;
  location?: string;
  date?: string;
  topics: string[];
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
    case 'local': return MapPin;
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

const getInsightIcon = (type: InsightContext['type']) => {
  switch (type) {
    case 'calendar': return Calendar;
    case 'email': return Mail;
    case 'memory': return Brain;
    case 'financial': return DollarSign;
    default: return Lightbulb;
  }
};

function DiscoveryCard({ discovery }: { discovery: Discovery }) {
  const CategoryIcon = getCategoryIcon(discovery.category);
  const categoryColors = getCategoryColor(discovery.category);
  
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
            <Badge variant="outline" className={cn("text-xs capitalize ml-auto", categoryColors)}>
              {discovery.category}
            </Badge>
          </div>
          
          <p className="text-xs text-primary/80 mt-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Based on: {discovery.insightContext}
          </p>
        </div>
      </div>
    </a>
  );
}

function InsightBadge({ insight }: { insight: InsightContext }) {
  const Icon = getInsightIcon(insight.type);
  
  return (
    <div className="glass-card p-2 rounded-lg flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <span className="text-xs text-muted-foreground truncate">
        {insight.summary.slice(0, 40)}{insight.summary.length > 40 ? '...' : ''}
      </span>
      {insight.location && (
        <Badge variant="outline" className="text-xs bg-white/5 ml-auto">
          <MapPin className="w-3 h-3 mr-1" />
          {insight.location.split(',')[0]}
        </Badge>
      )}
    </div>
  );
}

export default function ContextualDiscoveries() {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<DiscoveriesData>({
    queryKey: ["/api/discoveries"],
    staleTime: 1000 * 60 * 15,
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
                AI-curated content based on your life insights
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
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No discoveries yet</h3>
            <p className="text-muted-foreground text-sm max-w-sm mx-auto">
              Connect your calendar, email, or log some memories to get personalized discoveries based on your life.
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
            <p className="text-xs text-muted-foreground mb-2">Insights driving your discoveries:</p>
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
