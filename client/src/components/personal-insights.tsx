import { useQuery } from "@tanstack/react-query";
import { ReadAloudButton } from "@/components/read-aloud-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Newspaper, 
  Users, 
  Briefcase, 
  Calendar, 
  Wallet, 
  Heart, 
  Star,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";

interface PersonalNewsStory {
  id: string;
  category: 'people' | 'projects' | 'calendar' | 'financial' | 'wellbeing' | 'highlights';
  headline: string;
  summary: string;
  details?: string;
  relatedItems?: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'celebratory';
  priority: 'breaking' | 'featured' | 'standard';
  icon?: string;
}

interface NewsFeedResponse {
  status: string;
  data: {
    stories: PersonalNewsStory[];
    generatedAt: string;
    dataSources: {
      memories: number;
      calendars: number;
      emails: number;
      financial: boolean;
    };
  };
  dataSources: {
    memories: number;
    calendars: number;
    emails: number;
    financial: boolean;
  };
  cached: boolean;
  fullResultReady: boolean;
  generatedAt: string;
}

const getCategoryIcon = (category: PersonalNewsStory['category']) => {
  switch (category) {
    case 'people': return Users;
    case 'projects': return Briefcase;
    case 'calendar': return Calendar;
    case 'financial': return Wallet;
    case 'wellbeing': return Heart;
    case 'highlights': return Star;
    default: return Newspaper;
  }
};

const getCategoryColor = (category: PersonalNewsStory['category']) => {
  switch (category) {
    case 'people': return 'text-blue-500 bg-blue-500/20 border-blue-500/30';
    case 'projects': return 'text-orange-500 bg-orange-500/20 border-orange-500/30';
    case 'calendar': return 'text-purple-500 bg-purple-500/20 border-purple-500/30';
    case 'financial': return 'text-emerald-500 bg-emerald-500/20 border-emerald-500/30';
    case 'wellbeing': return 'text-pink-500 bg-pink-500/20 border-pink-500/30';
    case 'highlights': return 'text-yellow-500 bg-yellow-500/20 border-yellow-500/30';
    default: return 'text-gray-500 bg-gray-500/20 border-gray-500/30';
  }
};

const getSentimentStyle = (sentiment: PersonalNewsStory['sentiment']) => {
  switch (sentiment) {
    case 'positive': return 'border-l-green-500';
    case 'negative': return 'border-l-red-500';
    case 'celebratory': return 'border-l-yellow-500';
    default: return 'border-l-blue-500';
  }
};

const getPriorityBadge = (priority: PersonalNewsStory['priority']) => {
  switch (priority) {
    case 'breaking':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">Breaking</Badge>;
    case 'featured':
      return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs">Featured</Badge>;
    default:
      return null;
  }
};

function NewsStoryCard({ story, animate = false }: { story: PersonalNewsStory; animate?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = getCategoryIcon(story.category);
  const categoryColors = getCategoryColor(story.category);
  const sentimentStyle = getSentimentStyle(story.sentiment);
  
  return (
    <div 
      className={cn(
        "glass-card p-4 rounded-xl border-l-4 transition-all",
        sentimentStyle,
        story.priority === 'breaking' && "ring-1 ring-red-500/30",
        animate && "animate-fade-in"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          categoryColors.split(' ')[1]
        )}>
          {story.icon ? (
            <span className="text-lg">{story.icon}</span>
          ) : (
            <Icon className={cn("w-5 h-5", categoryColors.split(' ')[0])} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-semibold text-foreground leading-tight">{story.headline}</h4>
            <div className="flex items-center gap-1 flex-shrink-0">
              {getPriorityBadge(story.priority)}
              <Badge variant="outline" className={cn("text-xs capitalize", categoryColors)}>
                {story.category}
              </Badge>
            </div>
          </div>
          
          <p className="text-sm text-muted-foreground leading-relaxed">{story.summary}</p>
          
          <div className="flex items-center gap-1 mt-2">
            <ReadAloudButton
              text={[story.headline, story.summary, story.details].filter(Boolean).join(". ")}
              label="Read"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            />
            {(story.details || story.relatedItems?.length) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3 mr-1" />
                    Less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3 mr-1" />
                    More details
                  </>
                )}
              </Button>
            )}
          </div>
          
          {expanded && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-2 animate-fade-in">
              {story.details && (
                <p className="text-sm text-muted-foreground">{story.details}</p>
              )}
              {story.relatedItems && story.relatedItems.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {story.relatedItems.map((item, i) => (
                    <Badge key={i} variant="outline" className="text-xs bg-white/5">
                      {item}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StorySkeletonCard() {
  return (
    <div className="glass-card p-4 rounded-xl border-l-4 border-l-blue-500/30">
      <div className="flex items-start gap-3">
        <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export default function PersonalInsights() {
  const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const forceRefreshRef = useRef(false);
  const [showAll, setShowAll] = useState(false);

  // Stage 1: Quick query — top 3 stories, fast (~3-4s)
  const { data: quickData, isLoading: quickLoading, isFetching: quickFetching, refetch: refetchQuick } = useQuery<NewsFeedResponse>({
    queryKey: ["/api/news-feed/quick", userTimezone],
    queryFn: async () => {
      const shouldForce = forceRefreshRef.current;
      forceRefreshRef.current = false;
      const url = `/api/news-feed?quick=true&timezone=${encodeURIComponent(userTimezone)}${shouldForce ? '&refresh=true' : ''}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 30,
  });

  // Stage 2: Full query — all stories, auto-runs after quick loads
  // Polls with backoff until full result is ready (background generation can take ~15s)
  const fullResultAlreadyReady = quickData?.fullResultReady === true;
  const { data: fullData, isLoading: fullLoading, isFetching: fullFetching, refetch: refetchFull } = useQuery<NewsFeedResponse>({
    queryKey: ["/api/news-feed/full", userTimezone],
    queryFn: async () => {
      const url = `/api/news-feed?timezone=${encodeURIComponent(userTimezone)}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }
      return response.json();
    },
    enabled: !!quickData && !quickLoading,  // only start after quick load completes
    staleTime: 1000 * 60 * 30,
    // Poll every 5s while background generation is running (fullResultReady=false)
    refetchInterval: (query) => {
      const data = query.state.data as NewsFeedResponse | undefined;
      if (!data) return 5000;           // not loaded yet — poll to pick up background result
      if (data.fullResultReady) return false;  // full result ready — stop polling
      return 5000;                       // still background generating — keep polling
    },
  });

  // Use full data when available, fall back to quick data
  const activeData = fullData ?? quickData;
  const stories = activeData?.data?.stories || [];
  const dataSources = activeData?.dataSources;
  const isFullReady = fullData?.fullResultReady !== false;
  const isLoadingMore = !isFullReady && !!quickData && !quickLoading;

  // Stories split: quick shows first 3, expanded shows all
  const visibleStories = showAll ? stories : stories.slice(0, 3);
  const hiddenCount = stories.length - 3;

  const handleRefresh = () => {
    forceRefreshRef.current = true;
    setShowAll(false);
    refetchQuick();
    refetchFull();
  };

  const isLoading = quickLoading;
  const isFetching = quickFetching || fullFetching;

  return (
    <Card className="glass-card border-white/20 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5" />
      <CardHeader className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-500 flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Personal Insights</CardTitle>
              <CardDescription>
                AI-generated insights from your ecosystem
              </CardDescription>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Regenerate from latest data</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      
      <CardContent className="relative space-y-4">
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <StorySkeletonCard key={i} />
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-12">
            <Newspaper className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground mb-2">No insights yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mb-4">
              Start logging memories, connect your calendar and email to see personalized insights.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="border-white/20 hover:bg-white/10"
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", isFetching && "animate-spin")} />
              Retry
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Visible stories */}
            <div className="space-y-3">
              {visibleStories.map((story, i) => (
                <NewsStoryCard key={story.id} story={story} animate={i >= 3} />
              ))}
            </div>

            {/* More stories loading (background generation in progress) */}
            {isLoadingMore && !showAll && (
              <div className="space-y-3">
                <StorySkeletonCard />
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                  <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                  Generating more insights…
                </div>
              </div>
            )}

            {/* Show more / show less button */}
            {isFullReady && hiddenCount > 0 && (
              <Button
                variant="ghost"
                className="w-full border border-white/10 hover:bg-white/5 text-sm gap-2"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? (
                  <>
                    <ChevronUp className="w-4 h-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show {hiddenCount} more insight{hiddenCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </div>
        )}
        
        {dataSources && stories.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4 text-xs text-muted-foreground border-t border-white/10">
            {(dataSources.memories ?? 0) > 0 && (
              <span>{dataSources.memories} memories</span>
            )}
            {(dataSources.calendars ?? 0) > 0 && (
              <>
                <span>•</span>
                <span>{dataSources.calendars} events</span>
              </>
            )}
            {(dataSources.emails ?? 0) > 0 && (
              <>
                <span>•</span>
                <span>{dataSources.emails} emails</span>
              </>
            )}
            {dataSources.financial && (
              <>
                <span>•</span>
                <span>Financial data</span>
              </>
            )}
            {activeData?.cached && (
              <>
                <span>•</span>
                <span className="text-yellow-500/70">Cached</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
